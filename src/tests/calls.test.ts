import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import globalErrorHandler from "../app/middlewares/globalErrorhandler";
import { CallRoutes } from "../app/module/Call/call.routes";
import { User } from "../app/module/User/user.model";
import { Chat } from "../app/module/Chat/chat.model";
import { Call } from "../app/module/Call/call.model";
import { CallServices } from "../app/module/Call/call.service";
import { CALL_STATUS } from "../app/module/Call/call.interface";
import AppError from "../app/errors/AppError";
import { createToken } from "../app/utils/tokenGenerateFunction";

// WebRTC call lifecycle: RINGING → ACTIVE/REJECTED/CANCELLED/ENDED, with
// membership checks everywhere and signal-relay gating for SDP/ICE.

const TEST_SECRET = process.env.jwt_access_secret as string;

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/calls", CallRoutes);
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
let dm: any;
let groupChat: any;

const asAlice = { id: "", role: "USER" };
const asBob = { id: "", role: "USER" };
const asMallory = { id: "", role: "USER" };

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
    Call.deleteMany({}),
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

  dm = await Chat.create({ users: [alice._id, bob._id] });
  groupChat = await Chat.create({
    users: [alice._id, bob._id, mallory._id],
    isGroupChat: true,
    chatName: "Trio",
  });

  asAlice.id = String(alice._id);
  asBob.id = String(bob._id);
  asMallory.id = String(mallory._id);
});

describe("Call invite", () => {
  it("creates a RINGING call and identifies the callee", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(dm._id),
      "VIDEO",
      asAlice,
    );
    expect(call.status).toBe(CALL_STATUS.RINGING);
    expect(String(call.caller._id ?? call.caller)).toBe(String(alice._id));
    expect(String(call.callee._id ?? call.callee)).toBe(String(bob._id));
    expect(call.mediaType).toBe("VIDEO");
  });

  it("rejects a second invite while a call is ringing or active", async () => {
    await CallServices.inviteToCallFromDB(String(dm._id), "AUDIO", asAlice);
    await expect(
      CallServices.inviteToCallFromDB(String(dm._id), "AUDIO", asAlice),
    ).rejects.toMatchObject({ statusCode: 409 });

    // Even the callee cannot start a second call in the same chat.
    await expect(
      CallServices.inviteToCallFromDB(String(dm._id), "VIDEO", asBob),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("allows a new invite after the previous call ended", async () => {
    const first = await CallServices.inviteToCallFromDB(
      String(dm._id),
      "AUDIO",
      asAlice,
    );
    await CallServices.rejectCallFromDB(String(first._id), asBob);
    const second = await CallServices.inviteToCallFromDB(
      String(dm._id),
      "AUDIO",
      asAlice,
    );
    expect(second.status).toBe(CALL_STATUS.RINGING);
  });

  it("404s for non-members and starts a RINGING group call for members", async () => {
    await expect(
      CallServices.inviteToCallFromDB(String(dm._id), "AUDIO", asMallory),
    ).rejects.toMatchObject({ statusCode: 404 });

    const call = await CallServices.inviteToCallFromDB(
      String(groupChat._id),
      "AUDIO",
      asAlice,
    );
    expect(call.status).toBe(CALL_STATUS.RINGING);
    expect(call.isGroupCall).toBe(true);
    expect(String(call.caller._id ?? call.caller)).toBe(String(alice._id));
    expect(call.callee).toBeNull();
    expect((call.participants ?? []).map((p) => String(p))).toEqual([
      String(alice._id),
    ]);
  });
});

describe("Call accept / reject / end", () => {
  it("lets only the callee accept, moving RINGING → ACTIVE", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(dm._id),
      "VIDEO",
      asAlice,
    );

    await expect(
      CallServices.acceptCallFromDB(String(call._id), asAlice),
    ).rejects.toMatchObject({ statusCode: 403 });

    const accepted = await CallServices.acceptCallFromDB(
      String(call._id),
      asBob,
    );
    expect(accepted.status).toBe(CALL_STATUS.ACTIVE);
    expect(accepted.answeredAt).toBeTruthy();
  });

  it("rejects accepting a call that is no longer ringing", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(dm._id),
      "AUDIO",
      asAlice,
    );
    await CallServices.acceptCallFromDB(String(call._id), asBob);
    await expect(
      CallServices.acceptCallFromDB(String(call._id), asBob),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("records a rejection by the callee", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(dm._id),
      "AUDIO",
      asAlice,
    );
    const rejected = await CallServices.rejectCallFromDB(
      String(call._id),
      asBob,
    );
    expect(rejected.status).toBe(CALL_STATUS.REJECTED);
    expect(rejected.endedAt).toBeTruthy();
  });

  it("caller hanging up while ringing cancels (not misses) the call", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(dm._id),
      "AUDIO",
      asAlice,
    );
    const cancelled = await CallServices.endCallFromDB(String(call._id), asAlice);
    expect(cancelled.status).toBe(CALL_STATUS.CANCELLED);
  });

  it("ends an ACTIVE call with a computed talk duration", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(dm._id),
      "VIDEO",
      asAlice,
    );
    await CallServices.acceptCallFromDB(String(call._id), asBob);
    // Simulate a call that has been running for ~2 seconds.
    await Call.updateOne(
      { _id: call._id },
      { answeredAt: new Date(Date.now() - 2000) },
    );

    const ended = await CallServices.endCallFromDB(String(call._id), asBob);
    expect(ended.status).toBe(CALL_STATUS.ENDED);
    expect(ended.durationSeconds).toBeGreaterThanOrEqual(2);
  });

  it("is idempotent against double-end from both sides", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(dm._id),
      "AUDIO",
      asAlice,
    );
    await CallServices.acceptCallFromDB(String(call._id), asBob);
    await CallServices.endCallFromDB(String(call._id), asAlice);
    await expect(
      CallServices.endCallFromDB(String(call._id), asBob),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("hides calls from non-participants (404, no oracle)", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(dm._id),
      "AUDIO",
      asAlice,
    );
    for (const fn of [
      () => CallServices.acceptCallFromDB(String(call._id), asMallory),
      () => CallServices.rejectCallFromDB(String(call._id), asMallory),
      () => CallServices.endCallFromDB(String(call._id), asMallory),
    ]) {
      await expect(fn()).rejects.toMatchObject({ statusCode: 404 });
    }
  });
});

describe("Group calls (mesh, capped roster)", () => {
  it("lets the first acceptor activate the call and later members join", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(groupChat._id),
      "VIDEO",
      asAlice,
    );
    expect(call.isGroupCall).toBe(true);

    const afterBob = await CallServices.acceptCallFromDB(
      String(call._id),
      asBob,
    );
    expect(afterBob.status).toBe(CALL_STATUS.ACTIVE);
    expect(afterBob.answeredAt).toBeTruthy();
    expect((afterBob.participants ?? []).map((p) => String(p)).sort()).toEqual(
      [String(alice._id), String(bob._id)].sort(),
    );

    const afterMallory = await CallServices.acceptCallFromDB(
      String(call._id),
      asMallory,
    );
    expect(afterMallory.status).toBe(CALL_STATUS.ACTIVE);
    expect((afterMallory.participants ?? []).map(String)).toHaveLength(3);
  });

  it("enforces the 8-participant mesh cap on late joins", async () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      User.create({
        name: `Member ${i}`,
        email: `member${i}@example.com`,
        password: "MemberPass123!",
      }),
    );
    const members: any[] = await Promise.all(many);
    const bigGroup = await Chat.create({
      users: members.map((m) => m._id),
      isGroupChat: true,
      chatName: "Big room",
    });

    const starter = { id: String(members[0]._id), role: "USER" };
    const call = await CallServices.inviteToCallFromDB(
      String(bigGroup._id),
      "AUDIO",
      starter,
    );
    // 1 starter + 7 acceptors = 8 (the mesh ceiling).
    for (let i = 1; i <= 7; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const joined = await CallServices.acceptCallFromDB(
        String(call._id),
        { id: String(members[i]._id), role: "USER" },
      );
      expect(joined.status).toBe(CALL_STATUS.ACTIVE);
    }
    expect(
      ((await Call.findById(call._id))!.participants ?? []),
    ).toHaveLength(8);

    await expect(
      CallServices.acceptCallFromDB(String(call._id), {
        id: String(members[8]._id),
        role: "USER",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    // An outsider still gets the 404 oracle guard.
    const outsider = await User.create({
      name: "Outsider",
      email: "outsider@example.com",
      password: "OutsiderPass123!",
    });
    await expect(
      CallServices.acceptCallFromDB(String(call._id), {
        id: String(outsider._id),
        role: "USER",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("keeps the ring alive when one member declines personally", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(groupChat._id),
      "AUDIO",
      asAlice,
    );
    const declined = await CallServices.rejectCallFromDB(
      String(call._id),
      asMallory,
    );
    expect(declined.status).toBe(CALL_STATUS.RINGING);
    expect(declined.endedAt).toBeNull();

    // The ring is still open for the remaining members.
    const accepted = await CallServices.acceptCallFromDB(
      String(call._id),
      asBob,
    );
    expect(accepted.status).toBe(CALL_STATUS.ACTIVE);
  });

  it("lets only the starter cancel a ringing group call", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(groupChat._id),
      "AUDIO",
      asAlice,
    );
    await expect(
      CallServices.endCallFromDB(String(call._id), asBob),
    ).rejects.toMatchObject({ statusCode: 403 });

    const cancelled = await CallServices.endCallFromDB(
      String(call._id),
      asAlice,
    );
    expect(cancelled.status).toBe(CALL_STATUS.CANCELLED);
  });

  it("continues an ACTIVE group call while members leave, ends when empty", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(groupChat._id),
      "VIDEO",
      asAlice,
    );
    await CallServices.acceptCallFromDB(String(call._id), asBob);
    await CallServices.acceptCallFromDB(String(call._id), asMallory);

    const aliceLeft = await CallServices.endCallFromDB(
      String(call._id),
      asAlice,
    );
    expect(aliceLeft.status).toBe(CALL_STATUS.ACTIVE);
    expect((aliceLeft.participants ?? []).map(String)).not.toContain(
      String(alice._id),
    );

    const bobLeft = await CallServices.endCallFromDB(String(call._id), asBob);
    expect(bobLeft.status).toBe(CALL_STATUS.ACTIVE);

    const empty = await CallServices.endCallFromDB(String(call._id), asMallory);
    expect(empty.status).toBe(CALL_STATUS.ENDED);
    expect((empty.participants ?? []).length).toBe(0);
    expect(empty.durationSeconds).toBeGreaterThanOrEqual(0);
  });

  it("joins an already-ACTIVE group call instead of double-inviting", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(groupChat._id),
      "VIDEO",
      asAlice,
    );
    await CallServices.acceptCallFromDB(String(call._id), asBob);

    // Mallory presses the call button while the call is live → joins it.
    const joined = await CallServices.joinActiveGroupCallFromDB(
      String(groupChat._id),
      asMallory,
    );
    expect(joined).toBeTruthy();
    expect(joined!.status).toBe(CALL_STATUS.ACTIVE);
    expect((joined!.participants ?? []).map(String)).toHaveLength(3);

    // No joinable group call (DM chats) → null so the caller gets the 409.
    await expect(
      CallServices.joinActiveGroupCallFromDB(String(dm._id), asAlice),
    ).resolves.toBeNull();
  });

  it("gates group signal relay on the live participant roster", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(groupChat._id),
      "AUDIO",
      asAlice,
    );
    await CallServices.acceptCallFromDB(String(call._id), asBob);

    const bobSide = await CallServices.assertLiveCallParticipant(
      String(call._id),
      asBob.id,
    );
    expect(bobSide.isGroupCall).toBe(true);
    expect(bobSide.participants).toHaveLength(2);

    // Not yet joined (still ringing) and complete outsiders are both blocked.
    await expect(
      CallServices.assertLiveCallParticipant(String(call._id), asMallory.id),
    ).rejects.toMatchObject({ statusCode: 403 });

    const outsider = await User.create({
      name: "Outsider",
      email: "outsider-signal@example.com",
      password: "OutsiderPass123!",
    });
    await expect(
      CallServices.assertLiveCallParticipant(String(call._id), String(outsider._id)),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("serves group call history to chat members only", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(groupChat._id),
      "AUDIO",
      asAlice,
    );
    await CallServices.acceptCallFromDB(String(call._id), asBob);
    await CallServices.endCallFromDB(String(call._id), asAlice);

    const res = await request(app)
      .get(`/calls/chat/${groupChat._id}`)
      .set("authorization", makeToken(alice));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].isGroupCall).toBe(true);

    const outsider = await User.create({
      name: "Outsider",
      email: "outsider-history@example.com",
      password: "OutsiderPass123!",
    });
    const denied = await request(app)
      .get(`/calls/chat/${groupChat._id}`)
      .set("authorization", makeToken(outsider));
    expect(denied.status).toBe(404);
  });
});

describe("Signal relay gating", () => {
  it("allows SDP/ICE relay between participants of a live call only", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(dm._id),
      "VIDEO",
      asAlice,
    );

    const aliceSide = await CallServices.assertLiveCallParticipant(
      String(call._id),
      asAlice.id,
    );
    expect(aliceSide.caller).toBe(asAlice.id);
    expect(aliceSide.callee).toBe(asBob.id);

    const bobSide = await CallServices.assertLiveCallParticipant(
      String(call._id),
      asBob.id,
    );
    expect(bobSide.caller).toBe(asAlice.id);
  });

  it("blocks strangers from relaying signals", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(dm._id),
      "VIDEO",
      asAlice,
    );
    await expect(
      CallServices.assertLiveCallParticipant(String(call._id), asMallory.id),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("blocks relay once the call is no longer active", async () => {
    const call = await CallServices.inviteToCallFromDB(
      String(dm._id),
      "VIDEO",
      asAlice,
    );
    await CallServices.rejectCallFromDB(String(call._id), asBob);
    await expect(
      CallServices.assertLiveCallParticipant(String(call._id), asAlice.id),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("Call history REST", () => {
  it("returns paginated history to chat members only", async () => {
    const first = await CallServices.inviteToCallFromDB(
      String(dm._id),
      "AUDIO",
      asAlice,
    );
    await CallServices.acceptCallFromDB(String(first._id), asBob);
    await CallServices.endCallFromDB(String(first._id), asAlice);
    await CallServices.inviteToCallFromDB(String(dm._id), "VIDEO", asBob);
    // leave the second one ringing for variety

    const res = await request(app)
      .get(`/calls/chat/${dm._id}`)
      .set("authorization", makeToken(alice))
      .query({ page: 1, limit: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data[0].mediaType).toBe("VIDEO"); // newest first

    const denied = await request(app)
      .get(`/calls/chat/${dm._id}`)
      .set("authorization", makeToken(mallory));
    expect(denied.status).toBe(404);
  });
});

describe("AppError shape sanity", () => {
  it("service errors carry HTTP status codes", async () => {
    try {
      await CallServices.inviteToCallFromDB(
        "000000000000000000000000",
        "AUDIO",
        asAlice,
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(404);
    }
  });
});
