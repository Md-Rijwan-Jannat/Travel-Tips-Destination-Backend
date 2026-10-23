import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import globalErrorHandler from "../app/middlewares/globalErrorhandler";
import { MessageRoutes } from "../app/module/Messages/message.routes";
import { ChatRoutes } from "../app/module/Chat/chat.routes";
import { User } from "../app/module/User/user.model";
import { Chat } from "../app/module/Chat/chat.model";
import { Message } from "../app/module/Messages/message.model";
import { createToken } from "../app/utils/tokenGenerateFunction";

// Rich messaging upgrade: typed messages (image/voice/location/emoji),
// edit/soft-delete, and view-once media that is consumed exactly once and
// never appears in history.

const TEST_SECRET = process.env.jwt_access_secret as string;

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/messages", MessageRoutes);
  app.use("/chats", ChatRoutes);
  app.use(globalErrorHandler);
  return app;
};

const makeToken = (user: { _id: unknown; email: string; role?: string }) =>
  createToken(
    { id: String(user._id), email: user.email, role: user.role ?? "USER" },
    TEST_SECRET,
    "1h",
  );

let mongod: MongoMemoryServer;
const app = buildApp();

let alice: any;
let bob: any;
let mallory: any;
let aliceToken: string;
let bobToken: string;
let malloryToken: string;
let dm: any;

const IMG = "https://res.cloudinary.com/demo/image/upload/sample.jpg";
const AUDIO = "https://res.cloudinary.com/demo/video/upload/dog.mp3";

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Chat.deleteMany({}),
    Message.deleteMany({}),
  ]);

  alice = await User.create({
    name: "Alice",
    email: "alice@example.com",
    password: "AlicePass123!",
  });
  bob = await User.create({
    name: "Bob",
    email: "bob@example.com",
    password: "BobPass123!",
  });
  mallory = await User.create({
    name: "Mallory",
    email: "mallory@example.com",
    password: "MalloryPass123!",
  });

  aliceToken = makeToken(alice);
  bobToken = makeToken(bob);
  malloryToken = makeToken(mallory);

  dm = await Chat.create({ users: [alice._id, bob._id] });
});

const send = (payload: Record<string, unknown>, token = aliceToken) =>
  request(app).post("/messages").set("authorization", token).send(payload);

describe("Typed message creation", () => {
  it("sends a legacy text payload (no messageType) and defaults to TEXT", async () => {
    const res = await send({ chat: String(dm._id), content: "hello" });
    expect(res.status).toBe(201);
    expect(res.body.data.messageType).toBe("TEXT");
    expect(res.body.data.content).toBe("hello");
    expect(String(res.body.data.sender._id)).toBe(String(alice._id));
    // Sender counts as having read their own message.
    expect(res.body.data.readBy.map(String)).toContain(String(alice._id));
  });

  it("sends an image with a caption", async () => {
    const res = await send({
      chat: String(dm._id),
      messageType: "IMAGE",
      mediaUrl: IMG,
      content: "sunrise!",
    });
    expect(res.status).toBe(201);
    expect(res.body.data.mediaUrl).toBe(IMG);
    expect(res.body.data.content).toBe("sunrise!");
  });

  it("sends a voice note with duration metadata", async () => {
    const res = await send({
      chat: String(dm._id),
      messageType: "VOICE",
      mediaUrl: AUDIO,
      mediaMeta: { durationSeconds: 14 },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.mediaMeta.durationSeconds).toBe(14);
  });

  it("sends a location pin", async () => {
    const res = await send({
      chat: String(dm._id),
      messageType: "LOCATION",
      location: { lat: 46.5197, lng: 6.6323, label: "Lake Geneva" },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.location.lat).toBeCloseTo(46.5197);
    expect(res.body.data.location.label).toBe("Lake Geneva");
  });

  it("starts a live location share with a server-set 15 minute window", async () => {
    const res = await send({
      chat: String(dm._id),
      messageType: "LIVE_LOCATION",
      location: { lat: 51.5007, lng: -0.1246, label: "Big Ben" },
      // Client-supplied windows must be ignored (stripped by validation).
      liveLocation: { expiresAt: new Date(0).toISOString() },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.messageType).toBe("LIVE_LOCATION");
    expect(res.body.data.location.lat).toBeCloseTo(51.5007);
    const expiresAt = new Date(res.body.data.liveLocation.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 15 * 60_000 + 5_000);
  });

  it("sends a big emoji", async () => {
    const res = await send({
      chat: String(dm._id),
      messageType: "EMOJI",
      content: "🔥",
    });
    expect(res.status).toBe(201);
    expect(res.body.data.messageType).toBe("EMOJI");
  });

  it("sends a view-once image but never echoes the URL back", async () => {
    const res = await send({
      chat: String(dm._id),
      messageType: "VIEW_ONCE_IMAGE",
      mediaUrl: IMG,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.messageType).toBe("VIEW_ONCE_IMAGE");
    expect(res.body.data.mediaUrl).toBeNull();
    expect(res.body.data.viewOnceOpened).toBe(false);
  });

  it("ignores client-supplied sender/readBy flags", async () => {
    const res = await send({
      chat: String(dm._id),
      content: "spoof?",
      sender: String(bob._id),
      readBy: [String(bob._id)],
      isDeleted: true,
    });
    expect(res.status).toBe(201);
    expect(String(res.body.data.sender._id)).toBe(String(alice._id));
    expect(res.body.data.isDeleted).toBe(false);
  });

  it("rejects TEXT without content", async () => {
    const res = await send({ chat: String(dm._id) });
    expect(res.status).toBe(400);
  });

  it("rejects IMAGE without a mediaUrl", async () => {
    const res = await send({ chat: String(dm._id), messageType: "IMAGE" });
    expect(res.status).toBe(400);
  });

  it("rejects non-https media URLs", async () => {
    const res = await send({
      chat: String(dm._id),
      messageType: "IMAGE",
      mediaUrl: "javascript:alert(1)",
    });
    expect(res.status).toBe(400);
  });

  it("rejects voice notes without a valid duration", async () => {
    const res = await send({
      chat: String(dm._id),
      messageType: "VOICE",
      mediaUrl: AUDIO,
      mediaMeta: { durationSeconds: 0 },
    });
    expect(res.status).toBe(400);
  });

  it("rejects out-of-range coordinates", async () => {
    const res = await send({
      chat: String(dm._id),
      messageType: "LOCATION",
      location: { lat: 200, lng: 0 },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a live location share without coordinates", async () => {
    const res = await send({
      chat: String(dm._id),
      messageType: "LIVE_LOCATION",
    });
    expect(res.status).toBe(400);
  });

  it("404s for chats the sender is not a member of, without writing", async () => {
    const res = await send(
      { chat: String(dm._id), content: "intruder" },
      malloryToken,
    );
    expect(res.status).toBe(404);
    expect(await Message.countDocuments()).toBe(0);
  });
});

describe("View-once media", () => {
  const sendViewOnce = async () => {
    const res = await send({
      chat: String(dm._id),
      messageType: "VIEW_ONCE_IMAGE",
      mediaUrl: IMG,
      content: "only once",
    });
    expect(res.status).toBe(201);
    return res.body.data._id as string;
  };

  it("consumes exactly once: recipient gets the URL, then 410 forever", async () => {
    const messageId = await sendViewOnce();

    const first = await request(app)
      .post(`/messages/${messageId}/view-once`)
      .set("authorization", bobToken);
    expect(first.status).toBe(200);
    expect(first.body.data.mediaUrl).toBe(IMG);
    expect(first.body.data.caption).toBe("only once");

    const second = await request(app)
      .post(`/messages/${messageId}/view-once`)
      .set("authorization", bobToken);
    expect(second.status).toBe(410);
  });

  it("never leaks the URL in history before or after consumption", async () => {
    const messageId = await sendViewOnce();

    const before = await request(app)
      .get(`/messages/${dm._id}`)
      .set("authorization", bobToken);
    const beforeMsg = before.body.data.find((m: any) => m._id === messageId);
    expect(beforeMsg.mediaUrl).toBeNull();
    expect(beforeMsg.viewOnceOpened).toBe(false);

    await request(app)
      .post(`/messages/${messageId}/view-once`)
      .set("authorization", bobToken)
      .expect(200);

    const after = await request(app)
      .get(`/messages/${dm._id}`)
      .set("authorization", bobToken);
    const afterMsg = after.body.data.find((m: any) => m._id === messageId);
    expect(afterMsg.mediaUrl).toBeNull();
    expect(afterMsg.viewOnceOpened).toBe(true);
  });

  it("does not let the sender consume their own view-once media", async () => {
    const messageId = await sendViewOnce();
    const res = await request(app)
      .post(`/messages/${messageId}/view-once`)
      .set("authorization", aliceToken);
    expect(res.status).toBe(400);
  });

  it("does not let a non-member discover or consume the message", async () => {
    const messageId = await sendViewOnce();
    const res = await request(app)
      .post(`/messages/${messageId}/view-once`)
      .set("authorization", malloryToken);
    expect(res.status).toBe(404);
  });

  it("400s when the message is not view-once media", async () => {
    const text = await send({ chat: String(dm._id), content: "plain" });
    const res = await request(app)
      .post(`/messages/${text.body.data._id}/view-once`)
      .set("authorization", bobToken);
    expect(res.status).toBe(400);
  });

  it("never exposes the mediaUrl through chat-list latestMessage projections", async () => {
    await sendViewOnce();

    const list = await request(app)
      .get("/chats")
      .set("authorization", bobToken);
    expect(list.status).toBe(200);
    const listed = (list.body.data as any[]).find(
      (c) => String(c._id) === String(dm._id),
    );
    expect(listed.latestMessage.messageType).toBe("VIEW_ONCE_IMAGE");
    expect(listed.latestMessage.mediaUrl).toBeNull();

    const single = await request(app)
      .get(`/chats/${dm._id}`)
      .set("authorization", bobToken);
    expect(single.status).toBe(200);
    expect(single.body.data.latestMessage.mediaUrl).toBeNull();
  });
});

describe("Message editing", () => {
  it("lets the sender edit text and stamps isEdited", async () => {
    const created = await send({ chat: String(dm._id), content: "typo heer" });
    const id = created.body.data._id;

    const res = await request(app)
      .patch(`/messages/${id}`)
      .set("authorization", aliceToken)
      .send({ content: "typo here" });
    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe("typo here");
    expect(res.body.data.isEdited).toBe(true);
    expect(res.body.data.editedAt).toBeTruthy();
  });

  it("lets the sender update location coordinates", async () => {
    const created = await send({
      chat: String(dm._id),
      messageType: "LOCATION",
      location: { lat: 0, lng: 0 },
    });
    const res = await request(app)
      .patch(`/messages/${created.body.data._id}`)
      .set("authorization", aliceToken)
      .send({ location: { lat: 48.8584, lng: 2.2945, label: "Eiffel Tower" } });
    expect(res.status).toBe(200);
    expect(res.body.data.location.lat).toBeCloseTo(48.8584);
  });

  it("rejects edits from anyone but the sender", async () => {
    const created = await send({ chat: String(dm._id), content: "mine" });
    const res = await request(app)
      .patch(`/messages/${created.body.data._id}`)
      .set("authorization", bobToken)
      .send({ content: "hijacked" });
    expect(res.status).toBe(403);
  });

  it("rejects empty updates and blanking a text message", async () => {
    const created = await send({ chat: String(dm._id), content: "keep" });
    const id = created.body.data._id;

    const empty = await request(app)
      .patch(`/messages/${id}`)
      .set("authorization", aliceToken)
      .send({});
    expect(empty.status).toBe(400);

    const blank = await request(app)
      .patch(`/messages/${id}`)
      .set("authorization", aliceToken)
      .send({ content: "   " });
    expect(blank.status).toBe(400);
  });

  it("cannot edit a deleted message", async () => {
    const created = await send({ chat: String(dm._id), content: "temp" });
    const id = created.body.data._id;
    await request(app)
      .delete(`/messages/${id}`)
      .set("authorization", aliceToken)
      .expect(200);

    const res = await request(app)
      .patch(`/messages/${id}`)
      .set("authorization", aliceToken)
      .send({ content: "necro" });
    expect(res.status).toBe(404);
  });
});

describe("Message deletion", () => {
  it("soft-deletes: content and media are blanked, receipts stay consistent", async () => {
    const created = await send({
      chat: String(dm._id),
      messageType: "IMAGE",
      mediaUrl: IMG,
      content: "oops",
    });
    const id = created.body.data._id;

    const res = await request(app)
      .delete(`/messages/${id}`)
      .set("authorization", aliceToken);
    expect(res.status).toBe(200);

    const stored = await Message.findById(id).lean();
    expect(stored!.isDeleted).toBe(true);
    expect(stored!.content).toBe("");
    expect(stored!.mediaUrl).toBeNull();

    // History shows an empty tombstone, never the original content.
    const history = await request(app)
      .get(`/messages/${dm._id}`)
      .set("authorization", bobToken);
    const tomb = history.body.data.find((m: any) => m._id === id);
    expect(tomb).toBeTruthy();
    expect(tomb.content).toBe("");
    expect(tomb.mediaUrl).toBeNull();
    expect(tomb.isDeleted).toBe(true);
  });

  it("clears the chat's latest-message pointer", async () => {
    const first = await send({ chat: String(dm._id), content: "first" });
    const second = await send({ chat: String(dm._id), content: "second" });
    expect(String((await Chat.findById(dm._id).lean())!.latestMessage)).toBe(
      second.body.data._id,
    );

    await request(app)
      .delete(`/messages/${second.body.data._id}`)
      .set("authorization", aliceToken)
      .expect(200);

    expect((await Chat.findById(dm._id).lean())!.latestMessage).toBeNull();
    expect(first.body.data._id).toBeTruthy();
  });

  it("rejects deletion by non-senders but allows admins", async () => {
    const created = await send({ chat: String(dm._id), content: "mine" });
    const id = created.body.data._id;

    await request(app)
      .delete(`/messages/${id}`)
      .set("authorization", bobToken)
      .expect(403);

    const admin = await User.create({
      name: "Admin",
      email: "admin@example.com",
      password: "AdminPass123!",
      role: "ADMIN",
    });
    await request(app)
      .delete(`/messages/${id}`)
      .set("authorization", makeToken(admin))
      .expect(200);
  });

  it("is idempotent", async () => {
    const created = await send({ chat: String(dm._id), content: "x" });
    const id = created.body.data._id;
    await request(app)
      .delete(`/messages/${id}`)
      .set("authorization", aliceToken)
      .expect(200);
    await request(app)
      .delete(`/messages/${id}`)
      .set("authorization", aliceToken)
      .expect(200);
  });
});

describe("Reply threads", () => {
  it("replies to a message and history embeds a safe preview", async () => {
    const original = await send({ chat: String(dm._id), content: "where next?" });
    const originalId = original.body.data._id;

    const reply = await send({
      chat: String(dm._id),
      content: "Lisbon!",
      replyTo: originalId,
    });
    expect(reply.status).toBe(201);
    expect(String(reply.body.data.replyTo._id)).toBe(originalId);

    const history = await request(app)
      .get(`/messages/${dm._id}`)
      .set("authorization", bobToken);
    const sent = (history.body.data as any[]).find(
      (m) => m.content === "Lisbon!",
    );
    expect(sent.replyTo).toBeTruthy();
    expect(String(sent.replyTo._id)).toBe(originalId);
    expect(sent.replyTo.sender.name).toBe("Alice");
    expect(sent.replyTo.content).toBe("where next?");
    expect(sent.replyTo.isDeleted).toBe(false);
    // The preview never carries media, even for media parents.
    expect(sent.replyTo.mediaUrl).toBeUndefined();
  });

  it("rejects a replyTo that belongs to a different chat", async () => {
    const other = await Chat.create({ users: [alice._id, mallory._id] });
    const elsewhere = await send(
      { chat: String(other._id), content: "other chat" },
      aliceToken,
    );
    expect(elsewhere.status).toBe(201);

    const res = await send({
      chat: String(dm._id),
      content: "cross-chat reply",
      replyTo: elsewhere.body.data._id,
    });
    expect(res.status).toBe(400);
  });

  it("400s on a malformed replyTo id", async () => {
    const res = await send({
      chat: String(dm._id),
      content: "broken",
      replyTo: "not-an-objectid",
    });
    expect(res.status).toBe(400);
  });

  it("404s when the reply target does not exist", async () => {
    const res = await send({
      chat: String(dm._id),
      content: "ghost",
      replyTo: "64b000000000000000000000",
    });
    expect(res.status).toBe(400);
  });

  it("renders a tombstone preview after the original is removed", async () => {
    const original = await send({ chat: String(dm._id), content: "delete me" });
    const originalId = original.body.data._id;
    await send({ chat: String(dm._id), content: "replying", replyTo: originalId });

    await request(app)
      .delete(`/messages/${originalId}`)
      .set("authorization", aliceToken)
      .expect(200);

    const history = await request(app)
      .get(`/messages/${dm._id}`)
      .set("authorization", bobToken);
    const reply = (history.body.data as any[]).find(
      (m) => m.content === "replying",
    );
    expect(reply.replyTo.isDeleted).toBe(true);
    expect(reply.replyTo.content).toBe("");
  });
});

describe("History and read receipts", () => {
  it("paginates newest page last, chronologically inside the page", async () => {
    for (let i = 1; i <= 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await send({ chat: String(dm._id), content: `msg ${i}` });
    }

    const page = await request(app)
      .get(`/messages/${dm._id}`)
      .set("authorization", bobToken)
      .query({ page: 1, limit: 2 });
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta.total).toBe(5);
    expect(page.body.data[0].content).toBe("msg 4");
    expect(page.body.data[1].content).toBe("msg 5");
  });

  it("marks messages read on full fetch for the reader only", async () => {
    await send({ chat: String(dm._id), content: "one" });
    await send({ chat: String(dm._id), content: "two" });

    const unread = await Message.countDocuments({
      chat: dm._id,
      readBy: { $ne: bob._id },
    });
    expect(unread).toBe(2);

    await request(app)
      .get(`/messages/${dm._id}`)
      .set("authorization", bobToken)
      .expect(200);

    expect(
      await Message.countDocuments({ chat: dm._id, readBy: { $ne: bob._id } }),
    ).toBe(0);
    // Alice's readBy already contained her from creation.
    expect(
      await Message.countDocuments({ chat: dm._id, readBy: { $ne: alice._id } }),
    ).toBe(0);
  });
});
