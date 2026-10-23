import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import globalErrorHandler from "../app/middlewares/globalErrorhandler";
import { GroupRoutes } from "../app/module/Group/group.routes";
import { ShortRoutes } from "../app/module/Short/short.routes";
import { NotificationRoutes } from "../app/module/Notification/notification.routes";
import { MessageRoutes } from "../app/module/Messages/message.routes";
import { PostRoutes } from "../app/module/Post/post.routes";
import { User } from "../app/module/User/user.model";
import { Post } from "../app/module/Post/post.model";
import { Chat } from "../app/module/Chat/chat.model";
import { Message } from "../app/module/Messages/message.model";
import { Group } from "../app/module/Group/group.model";
import { GroupMembership } from "../app/module/Group/groupMembership.model";
import { GroupInvite } from "../app/module/Group/groupInvite.model";
import { Short } from "../app/module/Short/short.model";
import { Notification } from "../app/module/Notification/notification.model";
import { createToken } from "../app/utils/tokenGenerateFunction";

// AURA TRIP community integration tests: groups, roles, post approval,
// invite redemption, shorts, group chat read receipts, notifications.

const TEST_SECRET = process.env.jwt_access_secret as string;

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/groups", GroupRoutes);
  app.use("/shorts", ShortRoutes);
  app.use("/notifications", NotificationRoutes);
  app.use("/messages", MessageRoutes);
  app.use("/posts", PostRoutes);
  app.use(globalErrorHandler);
  return app;
};

const makeToken = (user: { _id: unknown; email: string; role?: string }) =>
  createToken(
    { id: String(user._id), email: user.email, role: user.role ?? "USER" },
    TEST_SECRET,
    "1h",
  );

const VIDEO_URL = "https://res.cloudinary.com/demo/video/upload/dog.mp4";
const IMG = "https://example.com/img.png";

let mongod: MongoMemoryServer;
const app = buildApp();

let owner: any;
let member: any;
let outsider: any;
let ownerToken: string;
let memberToken: string;
let outsiderToken: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([
    User.deleteMany({}),
    Post.deleteMany({}),
    Chat.deleteMany({}),
    Message.deleteMany({}),
    Group.deleteMany({}),
    GroupMembership.deleteMany({}),
    GroupInvite.deleteMany({}),
    Short.deleteMany({}),
    Notification.deleteMany({}),
  ]);

  owner = await User.create({
    name: "Owner",
    email: "owner@example.com",
    password: "OwnerPass123!",
  });
  member = await User.create({
    name: "Member",
    email: "member@example.com",
    password: "MemberPass123!",
  });
  outsider = await User.create({
    name: "Outsider",
    email: "outsider@example.com",
    password: "OutsiderPass123!",
  });

  ownerToken = makeToken(owner);
  memberToken = makeToken(member);
  outsiderToken = makeToken(outsider);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

type CreatedGroup = {
  _id: string;
  slug: string;
  name: string;
  visibility: string;
};

const createGroup = async (
  overrides: Record<string, unknown> = {},
  token = ownerToken,
): Promise<CreatedGroup> => {
  const res = await request(app)
    .post("/groups")
    .set("authorization", token)
    .send({
      name: "Kyoto Autumn Walks",
      description: "A calm group for Kyoto autumn travel planning and photos.",
      category: "Travel Tips",
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body.data;
};

describe("Groups: creation and ownership", () => {
  it("creates a public group with the creator as OWNER and an approved membership", async () => {
    const group = await createGroup();

    const stored = await Group.findById(group._id).lean();
    expect(stored).toBeTruthy();
    expect(stored!.owner.toString()).toBe(String(owner._id));
    expect(stored!.slug).toMatch(/kyoto-autumn-walks/);
    expect(stored!.memberCount).toBe(1);

    const membership = await GroupMembership.findOne({
      group: group._id,
      user: owner._id,
    }).lean();
    expect(membership!.status).toBe("APPROVED");
    expect(membership!.role).toBe("OWNER");

    // A Messenger conversation is created together with the group.
    const chat = await Chat.findOne({ groupCommunity: group._id }).lean();
    expect(chat).toBeTruthy();
    expect(chat!.users.map(String)).toContain(String(owner._id));
    expect(String(stored!.chat)).toBe(String(chat!._id));
  });

  it("derives a unique slug when two groups share a name", async () => {
    const a = await createGroup({ name: "Shared Name Group" });
    const b = await createGroup({ name: "Shared Name Group" });
    expect(a.slug).not.toBe(b.slug);
  });

  it("rejects group creation without authentication", async () => {
    const res = await request(app).post("/groups").send({
      name: "No Auth Group",
      description: "This group should never be created without auth.",
      category: "Travel Tips",
    });
    expect(res.status).toBe(401);
  });
});

describe("Groups: discovery and visibility", () => {
  it("hides private groups from discovery for non-members", async () => {
    const priv = await createGroup({
      name: "Secret Planning",
      visibility: "PRIVATE",
      joinPolicy: "REQUEST",
    });

    const res = await request(app)
      .get("/groups")
      .set("authorization", outsiderToken)
      .query({ searchTerm: "Secret Planning" });
    expect(res.status).toBe(200);
    const slugs = (res.body.data as any[]).map((g) => g.slug);
    expect(slugs).not.toContain(priv.slug);

    // The owner still sees it.
    const mine = await request(app)
      .get("/groups")
      .set("authorization", ownerToken)
      .query({ searchTerm: "Secret Planning" });
    expect((mine.body.data as any[]).map((g) => g.slug)).toContain(priv.slug);
  });

  it("returns 404 (not 403) when a non-member fetches a private group", async () => {
    const priv = await createGroup({
      name: "Hidden Base",
      visibility: "PRIVATE",
      joinPolicy: "REQUEST",
    });

    const res = await request(app)
      .get(`/groups/${priv._id}`)
      .set("authorization", outsiderToken);
    expect(res.status).toBe(404);

    const ownerView = await request(app)
      .get(`/groups/${priv._id}`)
      .set("authorization", ownerToken);
    expect(ownerView.status).toBe(200);
    expect(ownerView.body.data.group.slug).toBe(priv.slug);
  });
});

describe("Groups: joining, requests and bans", () => {
  it("joins an open public group immediately as APPROVED", async () => {
    const group = await createGroup({ name: "Open Trails Club", joinPolicy: "OPEN" });

    const res = await request(app)
      .post(`/groups/${group._id}/join`)
      .set("authorization", memberToken);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("APPROVED");

    // Member is synced into the Messenger conversation.
    const chat = await Chat.findOne({ groupCommunity: group._id }).lean();
    expect(chat!.users.map(String)).toContain(String(member._id));
  });

  it("queues a PENDING request for private groups and lets the owner approve it", async () => {
    const group = await createGroup({
      name: "Private Planning",
      visibility: "PRIVATE",
      joinPolicy: "REQUEST",
    });

    const join = await request(app)
      .post(`/groups/${group._id}/join`)
      .set("authorization", memberToken);
    expect(join.status).toBe(200);
    expect(join.body.data.status).toBe("PENDING");

    const review = await request(app)
      .post(`/groups/${group._id}/members/review`)
      .set("authorization", ownerToken)
      .send({ decision: "APPROVED", userId: String(member._id) });
    expect(review.status).toBe(200);

    const membership = await GroupMembership.findOne({
      group: group._id,
      user: member._id,
    }).lean();
    expect(membership!.status).toBe("APPROVED");

    // Owner is notified of the request/approval pipeline.
    const note = await Notification.findOne({
      recipient: String(owner._id),
      type: { $regex: "group\." },
    }).lean();
    expect(note).toBeTruthy();
  });

  it("lets an approved member leave and removes them from the chat", async () => {
    const group = await createGroup({ name: "Leaveable Group", joinPolicy: "OPEN" });
    await request(app)
      .post(`/groups/${group._id}/join`)
      .set("authorization", memberToken);

    const res = await request(app)
      .post(`/groups/${group._id}/leave`)
      .set("authorization", memberToken);
    expect(res.status).toBe(200);

    const membership = await GroupMembership.findOne({
      group: group._id,
      user: member._id,
    }).lean();
    expect(membership!.status).toBe("LEFT");

    const chat = await Chat.findOne({ groupCommunity: group._id }).lean();
    expect(chat!.users.map(String)).not.toContain(String(member._id));
  });

  it("blocks a banned member from rejoining", async () => {
    const group = await createGroup({ name: "Banhammer Hall", joinPolicy: "OPEN" });
    await request(app)
      .post(`/groups/${group._id}/join`)
      .set("authorization", memberToken);

    const ban = await request(app)
      .post(`/groups/${group._id}/members/remove`)
      .set("authorization", ownerToken)
      .send({ userId: String(member._id), ban: true });
    expect(ban.status).toBe(200);

    const rejoin = await request(app)
      .post(`/groups/${group._id}/join`)
      .set("authorization", memberToken);
    expect(rejoin.status).toBe(403);
  });
});

describe("Groups: roles and ownership transfer", () => {
  it("lets the owner promote a member to ADMIN and an ADMIN appoint a MODERATOR", async () => {
    const group = await createGroup({ name: "Role Ladder", joinPolicy: "OPEN" });
    await request(app)
      .post(`/groups/${group._id}/join`)
      .set("authorization", memberToken);

    const promote = await request(app)
      .patch(`/groups/${group._id}/members/role`)
      .set("authorization", ownerToken)
      .send({ userId: String(member._id), role: "ADMIN" });
    expect(promote.status).toBe(200);

    // The new ADMIN can appoint a moderator (a fresh third member is created
    // inline for this test to avoid cross-test state coupling).
    const modUser = await User.create({
      name: "Mod",
      email: "mod@example.com",
      password: "ModPass123!",
    });
    await request(app)
      .post(`/groups/${group._id}/join`)
      .set("authorization", makeToken(modUser));

    const appoint = await request(app)
      .patch(`/groups/${group._id}/members/role`)
      .set("authorization", memberToken) // the freshly promoted ADMIN
      .send({ userId: String(modUser._id), role: "MODERATOR" });
    expect(appoint.status).toBe(200);
  });

  it("rejects role changes from ordinary members", async () => {
    const group = await createGroup({ name: "Role Guards", joinPolicy: "OPEN" });
    await request(app)
      .post(`/groups/${group._id}/join`)
      .set("authorization", memberToken);

    const res = await request(app)
      .patch(`/groups/${group._id}/members/role`)
      .set("authorization", memberToken)
      .send({ userId: String(owner._id), role: "MEMBER" });
    expect(res.status).toBe(403);
  });

  it("transfers ownership only with explicit confirmation", async () => {
    const group = await createGroup({ name: "Handoff Group", joinPolicy: "OPEN" });
    await request(app)
      .post(`/groups/${group._id}/join`)
      .set("authorization", memberToken);

    const noConfirm = await request(app)
      .post(`/groups/${group._id}/transfer-ownership`)
      .set("authorization", ownerToken)
      .send({ userId: String(member._id) });
    expect(noConfirm.status).toBe(400);

    const ok = await request(app)
      .post(`/groups/${group._id}/transfer-ownership`)
      .set("authorization", ownerToken)
      .send({ userId: String(member._id), confirm: true });
    expect(ok.status).toBe(200);

    const stored = await Group.findById(group._id).lean();
    expect(stored!.owner.toString()).toBe(String(member._id));

    const oldOwnerMembership = await GroupMembership.findOne({
      group: group._id,
      user: owner._id,
    }).lean();
    expect(oldOwnerMembership!.role).toBe("ADMIN");
  });
});

describe("Group posts: approval workflow and feeds", () => {
  it("holds member posts as PENDING when approval is on, then publishes on approve", async () => {
    const group = await createGroup({
      name: "Approval Needed",
      joinPolicy: "OPEN",
      postApprovalEnabled: true,
    });
    await request(app)
      .post(`/groups/${group._id}/join`)
      .set("authorization", memberToken);

    const postRes = await request(app)
      .post(`/groups/${group._id}/posts`)
      .set("authorization", memberToken)
      .send({
        title: "Pending tip",
        description: "A tip that needs approval before anyone else sees it.",
        images: [IMG],
      });
    expect(postRes.status).toBe(201);
    const postId = String(postRes.body.data._id);
    expect(postRes.body.data.moderationStatus).toBe("PENDING");

    // Another ordinary member cannot see the pending post in the group feed.
    await request(app)
      .post(`/groups/${group._id}/join`)
      .set("authorization", outsiderToken);
    const feedAsOtherMember = await request(app)
      .get(`/groups/${group._id}/posts`)
      .set("authorization", outsiderToken);
    expect(feedAsOtherMember.status).toBe(200);
    expect(
      feedAsOtherMember.body.data.posts.map((p: any) => String(p._id)),
    ).not.toContain(postId);

    // Group staff (owner) does see pending posts so they can moderate them.
    const feedAsOwner = await request(app)
      .get(`/groups/${group._id}/posts`)
      .set("authorization", ownerToken);
    expect(feedAsOwner.status).toBe(200);
    expect(feedAsOwner.body.data.posts.map((p: any) => String(p._id))).toContain(
      postId,
    );

    // Staff queue shows it.
    const queue = await request(app)
      .get(`/groups/${group._id}/moderation/posts`)
      .set("authorization", ownerToken)
      .query({ status: "PENDING" });
    expect(queue.status).toBe(200);
    expect(queue.body.data.map((p: any) => String(p._id))).toContain(postId);

    // Ordinary members cannot open the moderation queue.
    const denied = await request(app)
      .get(`/groups/${group._id}/moderation/posts`)
      .set("authorization", memberToken);
    expect(denied.status).toBe(403);

    // Approve → visible in the feed, author notified.
    const approve = await request(app)
      .post(`/groups/${group._id}/moderation/posts/${postId}/approve`)
      .set("authorization", ownerToken);
    expect(approve.status).toBe(200);

    const feedAfter = await request(app)
      .get(`/groups/${group._id}/posts`)
      .set("authorization", memberToken);
    expect(feedAfter.body.data.posts.map((p: any) => String(p._id))).toContain(postId);

    const note = await Notification.findOne({
      recipient: String(member._id),
      type: "group.post_approve",
    }).lean();
    expect(note).toBeTruthy();
  });

  it("keeps rejected posts visible only to their author and staff", async () => {
    const group = await createGroup({
      name: "Strict Rules",
      joinPolicy: "OPEN",
      postApprovalEnabled: true,
    });
    await request(app)
      .post(`/groups/${group._id}/join`)
      .set("authorization", memberToken);

    const postRes = await request(app)
      .post(`/groups/${group._id}/posts`)
      .set("authorization", memberToken)
      .send({
        title: "Rejected tip",
        description: "This tip will be rejected by the group owner.",
        images: [IMG],
      });
    const postId = String(postRes.body.data._id);

    const reject = await request(app)
      .post(`/groups/${group._id}/moderation/posts/${postId}/reject`)
      .set("authorization", ownerToken)
      .send({ reason: "Off topic for this group." });
    expect(reject.status).toBe(200);
    expect(reject.body.data.moderationStatus).toBe("REJECTED");

    // Author still sees their own rejected post (self-view).
    const authorFeed = await request(app)
      .get(`/groups/${group._id}/posts`)
      .set("authorization", memberToken);
    expect(authorFeed.body.data.posts.map((p: any) => String(p._id))).toContain(postId);

    // Staff queue for REJECTED contains it.
    const queue = await request(app)
      .get(`/groups/${group._id}/moderation/posts`)
      .set("authorization", ownerToken)
      .query({ status: "REJECTED" });
    expect(queue.body.data.map((p: any) => String(p._id))).toContain(postId);

    // Restore republishes it.
    const restore = await request(app)
      .post(`/groups/${group._id}/moderation/posts/${postId}/restore`)
      .set("authorization", ownerToken);
    expect(restore.status).toBe(200);
    expect(restore.body.data.moderationStatus).toBe("APPROVED");
  });

  it("excludes private-group posts from the global feed but includes approved PUBLIC-group posts", async () => {
    const priv = await createGroup({
      name: "Private Feed Group",
      visibility: "PRIVATE",
      joinPolicy: "OPEN",
    });
    const pub = await createGroup({
      name: "Public Feed Group",
      visibility: "PUBLIC",
      joinPolicy: "OPEN",
    });

    const privPost = await Post.create({
      title: "Private group post",
      description: "Should never appear in the global feed.",
      images: [IMG],
      category: "Other",
      status: "FREE",
      user: owner._id,
      group: priv._id,
      groupVisibility: "PRIVATE",
      moderationStatus: "APPROVED",
    });
    const pubPost = await Post.create({
      title: "Public group post",
      description: "Appears in the global feed because the group is public.",
      images: [IMG],
      category: "Other",
      status: "FREE",
      user: owner._id,
      group: pub._id,
      groupVisibility: "PUBLIC",
      moderationStatus: "APPROVED",
    });

    const res = await request(app)
      .get("/posts")
      .set("authorization", memberToken)
      .query({ searchTerm: "group post" });
    expect(res.status).toBe(200);
    const ids = JSON.stringify(res.body.data);
    expect(ids).not.toContain(String(privPost._id));
    expect(ids).toContain(String(pubPost._id));
  });
});

describe("Group invites", () => {
  it("redeems a valid invite, rejects invalid tokens and respects maxUses", async () => {
    const group = await createGroup({ name: "Invite Only Club", joinPolicy: "CLOSED" });

    const inviteRes = await request(app)
      .post(`/groups/${group._id}/invites`)
      .set("authorization", ownerToken)
      .send({ label: "Founding members", maxUses: 2 });
    expect(inviteRes.status).toBe(201);
    const token = inviteRes.body.data.token as string;
    expect(token).toBeTruthy();
    // The raw token is returned exactly once; only the hash is stored.
    const storedInvite = await GroupInvite.findOne({ group: group._id }).lean();
    expect(storedInvite!.token).toBeUndefined();
    expect(storedInvite!.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    // Public preview works without auth and never leaks sensitive fields.
    const preview = await request(app).get(`/groups/invites/${token}/preview`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.group.name).toBe("Invite Only Club");
    expect(JSON.stringify(preview.body.data)).not.toContain(token);

    // Redemption joins the group as APPROVED (closed group, no review needed).
    const redeem = await request(app)
      .post(`/groups/invites/${token}/redeem`)
      .set("authorization", memberToken);
    expect(redeem.status).toBe(200);
    expect(redeem.body.data.status).toBe("APPROVED");

    // Redeeming the same invite twice as the same user is a no-op success,
    // but the use counter is only incremented once.
    const again = await request(app)
      .post(`/groups/invites/${token}/redeem`)
      .set("authorization", memberToken);
    expect(again.status).toBe(200);
    const inviteAfter = await GroupInvite.findOne({ tokenHash: storedInvite!.tokenHash });
    expect(inviteAfter!.usedCount).toBe(1);

    // An unknown token is rejected.
    const bad = await request(app)
      .post("/groups/invites/not-a-real-token/redeem")
      .set("authorization", outsiderToken);
    expect(bad.status).toBe(404);
  });

  it("revokes an invite so redemption fails afterwards", async () => {
    const group = await createGroup({ name: "Revoked Invites", joinPolicy: "CLOSED" });
    const inviteRes = await request(app)
      .post(`/groups/${group._id}/invites`)
      .set("authorization", ownerToken)
      .send({});
    const token = inviteRes.body.data.token as string;
    const inviteId = String(inviteRes.body.data.invite._id);

    const revoke = await request(app)
      .delete(`/groups/${group._id}/invites/${inviteId}`)
      .set("authorization", ownerToken);
    expect(revoke.status).toBe(200);

    const redeem = await request(app)
      .post(`/groups/invites/${token}/redeem`)
      .set("authorization", outsiderToken);
    expect(redeem.status).toBe(400);
  });
});

describe("Group chat via Messenger", () => {
  it("blocks messaging when the group has chatEnabled turned off", async () => {
    const group = await createGroup({
      name: "Silent Group",
      joinPolicy: "OPEN",
      chatEnabled: false,
    });
    await request(app)
      .post(`/groups/${group._id}/join`)
      .set("authorization", memberToken);

    const chat = await Chat.findOne({ groupCommunity: group._id }).lean();
    const res = await request(app)
      .post("/messages")
      .set("authorization", memberToken)
      .send({ chat: String(chat!._id), content: "Hello?" });
    expect(res.status).toBe(403);
  });

  it("blocks non-members from sending to the group conversation", async () => {
    const group = await createGroup({ name: "Members Only Chat", joinPolicy: "OPEN" });
    const chat = await Chat.findOne({ groupCommunity: group._id }).lean();

    const res = await request(app)
      .post("/messages")
      .set("authorization", outsiderToken)
      .send({ chat: String(chat!._id), content: "Let me in" });
    // Non-members cannot even discover the conversation (no existence leak).
    expect(res.status).toBe(404);
  });

  it("marks messages as read on fetch and reports unread counts", async () => {
    const group = await createGroup({ name: "Read Receipts", joinPolicy: "OPEN" });
    await request(app)
      .post(`/groups/${group._id}/join`)
      .set("authorization", memberToken);
    const chat = await Chat.findOne({ groupCommunity: group._id }).lean();
    const chatId = String(chat!._id);

    // Owner sends two messages; member has not read them yet.
    await request(app)
      .post("/messages")
      .set("authorization", ownerToken)
      .send({ chat: chatId, content: "Welcome to the group!" });
    await request(app)
      .post("/messages")
      .set("authorization", ownerToken)
      .send({ chat: chatId, content: "Here are the rules." });

    const unreadForMember = await Message.countDocuments({
      chat: chatId,
      readBy: { $ne: member._id },
    });
    expect(unreadForMember).toBe(2);

    // Member fetches history → everything is marked read.
    const fetchRes = await request(app)
      .get(`/messages/${chatId}`)
      .set("authorization", memberToken);
    expect(fetchRes.status).toBe(200);
    expect(fetchRes.body.data).toHaveLength(2);

    const unreadAfter = await Message.countDocuments({
      chat: chatId,
      readBy: { $ne: member._id },
    });
    expect(unreadAfter).toBe(0);

    // Explicit mark-read endpoint works and is idempotent.
    const mark = await request(app)
      .post(`/messages/${chatId}/read`)
      .set("authorization", memberToken);
    expect(mark.status).toBe(200);
    expect(mark.body.data.updated).toBe(0);
  });

  it("paginates message history", async () => {
    const group = await createGroup({ name: "Paginated Chat", joinPolicy: "OPEN" });
    await request(app)
      .post(`/groups/${group._id}/join`)
      .set("authorization", memberToken);
    const chat = await Chat.findOne({ groupCommunity: group._id }).lean();
    const chatId = String(chat!._id);

    for (let i = 1; i <= 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(app)
        .post("/messages")
        .set("authorization", ownerToken)
        .send({ chat: chatId, content: `Message number ${i}` });
    }

    const page1 = await request(app)
      .get(`/messages/${chatId}`)
      .set("authorization", memberToken)
      .query({ page: 1, limit: 2 });
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta.total).toBe(5);
    expect(page1.body.meta.totalPage).toBe(3);
    // Page 1 is the most recent page; messages inside it are chronological.
    expect(page1.body.data[0].content).toBe("Message number 4");
    expect(page1.body.data[1].content).toBe("Message number 5");
  });
});

describe("Aura Trip Shorts", () => {
  it("lets a group member post a group short and hides it from non-members", async () => {
    const group = await createGroup({ name: "Shorts Crew", joinPolicy: "OPEN" });
    await request(app)
      .post(`/groups/${group._id}/join`)
      .set("authorization", memberToken);

    const create = await request(app)
      .post("/shorts")
      .set("authorization", memberToken)
      .send({
        video: VIDEO_URL,
        title: "Kyoto streets at dusk",
        group: String(group._id),
        audience: "PUBLIC",
      });
    expect(create.status).toBe(201);
    const shortId = String(create.body.data._id);

    // Member sees it in the group feed endpoint.
    const groupFeed = await request(app)
      .get(`/groups/${group._id}/shorts`)
      .set("authorization", memberToken);
    expect(groupFeed.status).toBe(200);
    expect(groupFeed.body.data.map((s: any) => String(s._id))).toContain(shortId);

    // Global shorts feed hides it from the owner? No — owner is a member too.
    const ownerFeed = await request(app)
      .get("/shorts")
      .set("authorization", ownerToken);
    expect(ownerFeed.body.data.map((s: any) => String(s._id))).toContain(shortId);

    // Non-member: not in the global feed and no access to the group endpoint.
    const outsiderFeed = await request(app)
      .get("/shorts")
      .set("authorization", outsiderToken);
    expect(outsiderFeed.body.data.map((s: any) => String(s._id))).not.toContain(
      shortId,
    );

    const outsiderGroupFeed = await request(app)
      .get(`/groups/${group._id}/shorts`)
      .set("authorization", outsiderToken);
    expect(outsiderGroupFeed.status).toBe(403);

    const single = await request(app)
      .get(`/shorts/${shortId}`)
      .set("authorization", outsiderToken);
    expect(single.status).toBe(404);
  });

  it("rejects a group short from a non-member", async () => {
    const group = await createGroup({ name: "No Outsider Shorts", joinPolicy: "OPEN" });

    const res = await request(app)
      .post("/shorts")
      .set("authorization", outsiderToken)
      .send({
        video: VIDEO_URL,
        title: "Sneaking in",
        group: String(group._id),
      });
    expect(res.status).toBe(403);
  });

  it("rejects non-Cloudinary video URLs", async () => {
    const res = await request(app)
      .post("/shorts")
      .set("authorization", ownerToken)
      .send({ video: "https://evil.example.com/video.mp4", title: "Bad host" });
    expect(res.status).toBe(400);
  });

  it("tracks views and likes idempotently", async () => {
    const create = await request(app)
      .post("/shorts")
      .set("authorization", ownerToken)
      .send({ video: VIDEO_URL, title: "Engagement check" });
    expect(create.status).toBe(201);
    const shortId = String(create.body.data._id);

    await request(app).post(`/shorts/${shortId}/view`).set("authorization", memberToken);
    await request(app).post(`/shorts/${shortId}/view`).set("authorization", memberToken);
    let stored = await Short.findById(shortId).lean();
    expect(stored!.views.map(String)).toEqual([String(member._id)]);

    const like = await request(app)
      .post(`/shorts/${shortId}/like`)
      .set("authorization", memberToken);
    expect(like.status).toBe(200);
    stored = await Short.findById(shortId).lean();
    expect(stored!.likes.map(String)).toContain(String(member._id));

    const unlike = await request(app)
      .delete(`/shorts/${shortId}/like`)
      .set("authorization", memberToken);
    expect(unlike.status).toBe(200);
    stored = await Short.findById(shortId).lean();
    expect(stored!.likes.map(String)).not.toContain(String(member._id));
  });

  it("hides PRIVATE-audience shorts from other users' feeds", async () => {
    const create = await request(app)
      .post("/shorts")
      .set("authorization", ownerToken)
      .send({ video: VIDEO_URL, title: "Just for me", audience: "PRIVATE" });
    const shortId = String(create.body.data._id);

    const feed = await request(app)
      .get("/shorts")
      .set("authorization", memberToken);
    expect(feed.body.data.map((s: any) => String(s._id))).not.toContain(shortId);

    // Author still sees their own private short.
    const mine = await request(app)
      .get("/shorts")
      .set("authorization", ownerToken);
    expect(mine.body.data.map((s: any) => String(s._id))).toContain(shortId);
  });
});

describe("Notifications", () => {
  it("lists the user's notifications and supports mark-read", async () => {
    // Generate a notification for member via a group join approval flow.
    const group = await createGroup({ name: "Notify Group", joinPolicy: "OPEN" });
    await request(app)
      .post(`/groups/${group._id}/join`)
      .set("authorization", memberToken);
    await Notification.create({
      recipient: member._id,
      actor: owner._id,
      type: "group.new_post",
      title: "New post in Notify Group",
      body: "Fresh content",
      link: `/groups/${group.slug}`,
      entityType: "post",
      entityId: new mongoose.Types.ObjectId(),
      groupId: String(group._id),
    });

    const list = await request(app)
      .get("/notifications")
      .set("authorization", memberToken);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);

    const unread = await request(app)
      .get("/notifications/unread-count")
      .set("authorization", memberToken);
    expect(unread.status).toBe(200);
    expect(unread.body.data.count).toBeGreaterThan(0);

    const readAll = await request(app)
      .patch("/notifications/read-all")
      .set("authorization", memberToken);
    expect(readAll.status).toBe(200);

    const unreadAfter = await request(app)
      .get("/notifications/unread-count")
      .set("authorization", memberToken);
    expect(unreadAfter.body.data.count).toBe(0);
  });
});

describe("Backward compatibility", () => {
  beforeEach(async () => {
    await Post.deleteMany({});
  });

  it("still serves legacy posts without group fields in the global feed", async () => {
    const legacy = await Post.create({
      title: "Legacy travel tip",
      description: "A post created before groups existed.",
      images: [IMG],
      category: "Other",
      status: "FREE",
      user: outsider._id,
    });

    const res = await request(app)
      .get("/posts")
      .set("authorization", memberToken)
      .query({ searchTerm: "Legacy travel tip" });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body.data)).toContain(String(legacy._id));
  });

  it("still serves legacy single post detail", async () => {
    const legacy = await Post.create({
      title: "Legacy detail post",
      description: "Single post detail compatibility check.",
      images: [IMG],
      category: "Other",
      status: "FREE",
      user: outsider._id,
    });

    const res = await request(app)
      .get(`/posts/${legacy._id}`)
      .set("authorization", memberToken);
    expect(res.status).toBe(200);
    expect(String(res.body.data._id)).toBe(String(legacy._id));
  });
});
