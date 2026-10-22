import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import globalErrorHandler from "../app/middlewares/globalErrorhandler";
import { PostRoutes } from "../app/module/Post/post.routes";
import { CommentRoutes } from "../app/module/Comment/comment.routes";
import { ChatRoutes } from "../app/module/Chat/chat.routes";
import { MessageRoutes } from "../app/module/Messages/message.routes";
import { ProfileRoutes } from "../app/module/Profile/profile.routes";
import { UserRoutes } from "../app/module/User/user.routes";
import { User } from "../app/module/User/user.model";
import { Post } from "../app/module/Post/post.model";
import { Comment } from "../app/module/Comment/comment.model";
import { Chat } from "../app/module/Chat/chat.model";
import { Message } from "../app/module/Messages/message.model";
import { createToken } from "../app/utils/tokenGenerateFunction";

// Batch 2 (Authorization) integration tests: cross-user/cross-role access must
// be rejected. Runs against a real in-memory MongoDB (mongod is not installed
// locally). Tokens are signed with the test secret from setupEnv.ts; note that
// the Auth middleware reads the raw Authorization header (no "Bearer" prefix).

const TEST_SECRET = process.env.jwt_access_secret as string;

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/posts", PostRoutes);
  app.use("/comments", CommentRoutes);
  app.use("/chats", ChatRoutes);
  app.use("/messages", MessageRoutes);
  app.use("/profile", ProfileRoutes);
  app.use("/users", UserRoutes);
  app.use(globalErrorHandler);
  return app;
};

const makeToken = (user: { _id: unknown; email: string; role?: string }) => {
  const payload = {
    id: String(user._id),
    email: user.email,
    role: user.role ?? "USER",
  };
  return createToken(payload, TEST_SECRET, "1h");
};

let mongod: MongoMemoryServer;
const app = buildApp();

// seeded entities
let alice: any;
let bob: any;
let carol: any;
let admin: any;
let aliceToken: string;
let bobToken: string;
let carolToken: string;
let adminToken: string;
let postByBob: any; // bob owns; alice/admin interactions checked from outside
let postOwn: any; // alice owns; her own update
let postLocked: any; // alice owns; forbidden-field update attempt
let postAdminDelete: any; // alice owns; admin delete
let commentByAlice: any;
let groupChat: any; // members: alice, bob (admin is not a member)
let alicePasswordHash: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  await Promise.all([
    User.deleteMany({}),
    Post.deleteMany({}),
    Comment.deleteMany({}),
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
  carol = await User.create({
    name: "Carol",
    email: "carol@example.com",
    password: "CarolPass123!",
  });
  admin = await User.create({
    name: "Admin",
    email: "admin@example.com",
    password: "AdminPass123!",
    role: "ADMIN",
  });
  // post('save') blanks doc.password on the returned document, and the schema
  // now has `select: false`; re-read the stored hash explicitly as baseline.
  const aliceFresh = await User.findById(alice._id).select("+password");
  alicePasswordHash = String(aliceFresh?.password);

  aliceToken = makeToken(alice);
  bobToken = makeToken(bob);
  carolToken = makeToken(carol);
  adminToken = makeToken(admin);

  const basePost = {
    images: ["https://example.com/img.png"],
    description: "A trip",
    category: "Other",
    status: "FREE",
  };

  postByBob = await Post.create({
    ...basePost,
    user: bob._id,
    title: "Bob's post",
  });
  postOwn = await Post.create({
    ...basePost,
    user: alice._id,
    title: "Alice post",
  });
  postLocked = await Post.create({
    ...basePost,
    user: alice._id,
    title: "Alice locked",
    reportCount: 3,
  });
  postAdminDelete = await Post.create({
    ...basePost,
    user: alice._id,
    title: "Admin will delete",
  });

  commentByAlice = await Comment.create({
    user: alice._id,
    post: postOwn._id,
    text: "great post",
  });

  groupChat = await Chat.create({
    chatName: "Trip Group",
    users: [alice._id, bob._id],
    isGroupChat: true,
    groupAdmin: alice._id,
  });

  await Message.create({
    sender: alice._id,
    chat: groupChat._id,
    content: "hello group",
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

describe("post ownership authorization", () => {
  const postId = () => String(postByBob._id);

  it("rejects unauthenticated update (401)", async () => {
    const res = await request(app)
      .patch(`/posts/${postId()}`)
      .send({ title: "nope" });
    expect(res.status).toBe(401);
  });

  it("rejects update of another user's post (403)", async () => {
    const res = await request(app)
      .patch(`/posts/${postId()}`)
      .set("Authorization", aliceToken)
      .send({ title: "hijacked" });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);

    const fresh = await Post.findById(postByBob._id);
    expect(fresh?.title).toBe("Bob's post");
  });

  it("rejects delete of another user's post (403)", async () => {
    const res = await request(app)
      .delete(`/posts/${postId()}`)
      .set("Authorization", aliceToken);
    expect(res.status).toBe(403);

    const fresh = await Post.findById(postByBob._id);
    expect(fresh?.isDeleted).toBe(false);
  });

  it("lets the owner update their own post (200)", async () => {
    const res = await request(app)
      .patch(`/posts/${String(postOwn._id)}`)
      .set("Authorization", aliceToken)
      .send({ title: "Alice post updated" });
    expect(res.status).toBe(200);
    expect(res.body.data?.title).toBe("Alice post updated");
  });

  it("strips ownership/integrity fields from the update payload", async () => {
    const res = await request(app)
      .patch(`/posts/${String(postLocked._id)}`)
      .set("Authorization", aliceToken)
      .send({
        title: "still alice",
        reportCount: 0,
        isDeleted: true,
        user: String(bob._id),
        likes: [String(bob._id)],
      });
    expect(res.status).toBe(200);

    const fresh = await Post.findById(postLocked._id);
    expect(fresh?.title).toBe("still alice");
    expect(fresh?.reportCount).toBe(3);
    expect(fresh?.isDeleted).toBe(false);
    expect(String(fresh?.user)).toBe(String(alice._id));
    expect(fresh?.likes ?? []).toHaveLength(0);
  });

  it("lets an admin delete another user's post (200)", async () => {
    const res = await request(app)
      .delete(`/posts/${String(postAdminDelete._id)}`)
      .set("Authorization", adminToken);
    expect(res.status).toBe(200);

    const fresh = await Post.findById(postAdminDelete._id);
    expect(fresh?.isDeleted).toBe(true);
  });
});

describe("comment ownership authorization", () => {
  it("rejects update of another user's comment (403)", async () => {
    const res = await request(app)
      .patch(`/comments/${String(commentByAlice._id)}`)
      .set("Authorization", bobToken)
      .send({ text: "hijacked comment" });
    expect(res.status).toBe(403);

    const fresh = await Comment.findById(commentByAlice._id);
    expect(fresh?.text).toBe("great post");
  });

  it("rejects delete of another user's comment (403)", async () => {
    const res = await request(app)
      .delete(`/comments/${String(commentByAlice._id)}`)
      .set("Authorization", bobToken);
    expect(res.status).toBe(403);

    const fresh = await Comment.findById(commentByAlice._id);
    expect(fresh).not.toBeNull();
  });

  it("lets the owner update their own comment (200)", async () => {
    const res = await request(app)
      .patch(`/comments/${String(commentByAlice._id)}`)
      .set("Authorization", aliceToken)
      .send({ text: "great post, updated" });
    expect(res.status).toBe(200);
    expect(res.body.data?.text).toBe("great post, updated");
  });
});

describe("group chat membership authorization", () => {
  const chatId = () => String(groupChat._id);

  it("rejects rename by a non-member (403)", async () => {
    const res = await request(app)
      .put(`/chats/rename`)
      .set("Authorization", carolToken)
      .send({ chatId: chatId(), chatName: "Carol was here" });
    expect(res.status).toBe(403);

    const fresh = await Chat.findById(groupChat._id);
    expect(fresh?.chatName).toBe("Trip Group");
  });

  it("rejects group-add by a non-member (403)", async () => {
    const res = await request(app)
      .put(`/chats/group-add`)
      .set("Authorization", carolToken)
      .send({ chatId: chatId(), userId: String(carol._id) });
    expect(res.status).toBe(403);

    const fresh = await Chat.findById(groupChat._id);
    expect((fresh?.users ?? []).some((u) => String(u) === String(carol._id))).toBe(false);
  });

  it("rejects group-remove by a non-member (403)", async () => {
    const res = await request(app)
      .put(`/chats/group-remove`)
      .set("Authorization", carolToken)
      .send({ chatId: chatId(), userId: String(bob._id) });
    expect(res.status).toBe(403);

    const fresh = await Chat.findById(groupChat._id);
    expect((fresh?.users ?? []).some((u) => String(u) === String(bob._id))).toBe(true);
  });

  it("lets a member rename the group (200)", async () => {
    const res = await request(app)
      .put(`/chats/rename`)
      .set("Authorization", bobToken)
      .send({ chatId: chatId(), chatName: "Renamed by Bob" });
    expect(res.status).toBe(200);
    expect(res.body.data?.chatName).toBe("Renamed by Bob");
  });

  it("lets an admin rename a group they are not in (200)", async () => {
    const res = await request(app)
      .put(`/chats/rename`)
      .set("Authorization", adminToken)
      .send({ chatId: chatId(), chatName: "Renamed by Admin" });
    expect(res.status).toBe(200);
    expect(res.body.data?.chatName).toBe("Renamed by Admin");
  });
});

describe("message read/create authorization", () => {
  const chatId = () => String(groupChat._id);

  it("hides messages from non-members (404, no existence oracle)", async () => {
    const res = await request(app)
      .get(`/messages/${chatId()}`)
      .set("Authorization", carolToken);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("returns messages to members (200)", async () => {
    const res = await request(app)
      .get(`/messages/${chatId()}`)
      .set("Authorization", aliceToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("rejects creating a message in a chat you are not in (404) without writing", async () => {
    const before = await Message.countDocuments({ chat: groupChat._id });

    const res = await request(app)
      .post(`/messages`)
      .set("Authorization", carolToken)
      .send({ chat: chatId(), content: "intruder message" });
    expect(res.status).toBe(404);

    const after = await Message.countDocuments({ chat: groupChat._id });
    expect(after).toBe(before);
  });

  it("lets a member send a message (201)", async () => {
    const res = await request(app)
      .post(`/messages`)
      .set("Authorization", bobToken)
      .send({ chat: chatId(), content: "hi from bob" });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

describe("profile whitelist and cross-user protection", () => {
  it("rejects updating someone else's profile (404)", async () => {
    const res = await request(app)
      .patch(`/profile/${String(bob._id)}`)
      .set("Authorization", aliceToken)
      .send({ name: "Hijacked Name" });
    expect(res.status).toBe(404);

    const fresh = await User.findById(bob._id);
    expect(fresh?.name).toBe("Bob");
  });

  it("strips role/verified/password from the update payload (200, unchanged)", async () => {
    const res = await request(app)
      .patch(`/profile/${String(alice._id)}`)
      .set("Authorization", aliceToken)
      .send({
        name: "Alice Updated",
        role: "ADMIN",
        verified: true,
        password: "pwned-password",
      });
    expect(res.status).toBe(200);

    const fresh = await User.findById(alice._id).select("+password");
    expect(fresh?.name).toBe("Alice Updated");
    expect(fresh?.role).toBe("USER");
    expect(fresh?.verified).toBe(false);
    expect(String(fresh?.password)).toBe(alicePasswordHash);
  });

  it("rejects unauthenticated profile update (401)", async () => {
    const res = await request(app)
      .patch(`/profile/${String(alice._id)}`)
      .send({ name: "Nope" });
    expect(res.status).toBe(401);
  });
});

describe("user-list endpoints require authentication", () => {
  it("rejects anonymous access to /users/normal-users (401)", async () => {
    const res = await request(app).get(`/users/normal-users`);
    expect(res.status).toBe(401);
  });

  it("allows an authenticated user (serves discovery features) (200)", async () => {
    const res = await request(app)
      .get(`/users/normal-users`)
      .set("Authorization", aliceToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("rejects a regular user on /users/premium-users (401: role gate)", async () => {
    const res = await request(app)
      .get(`/users/premium-users`)
      .set("Authorization", aliceToken);
    expect(res.status).toBe(401);
  });

  it("allows an admin on /users/premium-users (200)", async () => {
    const res = await request(app)
      .get(`/users/premium-users`)
      .set("Authorization", adminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
