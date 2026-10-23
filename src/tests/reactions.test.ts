import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import globalErrorHandler from "../app/middlewares/globalErrorhandler";
import { ReactRoutes } from "../app/module/Reacts/react.routes";
import { User } from "../app/module/User/user.model";
import { Post } from "../app/module/Post/post.model";
import { Comment } from "../app/module/Comment/comment.model";
import { Short } from "../app/module/Short/short.model";
import { React } from "../app/module/Reacts/react.model";
import { createToken } from "../app/utils/tokenGenerateFunction";

// Aura Trip unified 7-type reaction system tests: taxonomy, one-reaction-per-
// user atomicity, summaries, access control and legacy like/dislike back-compat.

const TEST_SECRET = process.env.jwt_access_secret as string;

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/react", ReactRoutes);
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

let author: any;
let reactor: any;
let other: any;
let authorToken: string;
let reactorToken: string;
let otherToken: string;

const newPost = async (overrides: Record<string, unknown> = {}) =>
  Post.create({
    user: author._id,
    images: ["https://example.com/pic.png"],
    title: "Kyoto in autumn",
    description: "Walked through Arashiyama at sunrise.",
    category: "Exploration",
    status: "FREE",
    ...overrides,
  });

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
    Post.deleteMany({}),
    Comment.deleteMany({}),
    Short.deleteMany({}),
    React.deleteMany({}),
  ]);

  author = await User.create({
    name: "Author",
    email: "author@example.com",
    password: "AuthorPass123!",
  });
  reactor = await User.create({
    name: "Reactor",
    email: "reactor@example.com",
    password: "ReactorPass123!",
  });
  other = await User.create({
    name: "Other",
    email: "other@example.com",
    password: "OtherPass123!",
  });

  authorToken = makeToken(author);
  reactorToken = makeToken(reactor);
  otherToken = makeToken(other);
});

describe("Seven-reaction taxonomy", () => {
  it("accepts all seven reaction types and reports accurate counts", async () => {
    const post = await newPost();

    const types = ["like", "love", "care", "haha", "wow", "sad", "angry"];
    for (const type of types) {
      const res = await request(app)
        .post(`/react/post/${post._id}`)
        .set("authorization", makeToken(await User.create({
          name: `U-${type}`,
          email: `${type}@example.com`,
          password: "Pass12345!",
        })))
        .send({ type });
      expect(res.status).toBe(200);
      expect(res.body.data.counts).toBeTruthy();
    }

    const summary = await request(app)
      .get(`/react/summary/post/${post._id}`)
      .set("authorization", reactorToken);
    expect(summary.status).toBe(200);
    expect(summary.body.data.total).toBe(7);
    for (const type of types) {
      expect(summary.body.data.counts[type]).toBe(1);
    }
    expect(summary.body.data.myReaction).toBeNull();
  });

  it("rejects an invalid reaction type with a validation error", async () => {
    const post = await newPost();
    const res = await request(app)
      .post(`/react/post/${post._id}`)
      .set("authorization", reactorToken)
      .send({ type: "thumbstupid" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBeTruthy();
  });
});

describe("One reaction per user per target", () => {
  it("changes the existing reaction instead of creating a second one", async () => {
    const post = await newPost();

    await request(app)
      .post(`/react/post/${post._id}`)
      .set("authorization", reactorToken)
      .send({ type: "like" })
      .expect(200);

    const changed = await request(app)
      .post(`/react/post/${post._id}`)
      .set("authorization", reactorToken)
      .send({ type: "wow" })
      .expect(200);

    expect(changed.body.data.myReaction).toBe("wow");
    expect(changed.body.data.counts.like).toBeUndefined();
    expect(changed.body.data.counts.wow).toBe(1);

    const rows = await React.find({ user: reactor._id, post: post._id });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("wow");
  });

  it("prevents duplicate reactions under concurrent requests", async () => {
    const post = await newPost();

    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app)
          .post(`/react/post/${post._id}`)
          .set("authorization", reactorToken)
          .send({ type: "love" }),
      ),
    );

    for (const res of attempts) {
      expect([200, 409]).toContain(res.status);
    }

    const rows = await React.find({ user: reactor._id, post: post._id });
    expect(rows).toHaveLength(1);
  });

  it("removes the reaction and returns an empty summary", async () => {
    const post = await newPost();

    await request(app)
      .post(`/react/post/${post._id}`)
      .set("authorization", reactorToken)
      .send({ type: "sad" })
      .expect(200);

    const removed = await request(app)
      .delete(`/react/post/${post._id}`)
      .set("authorization", reactorToken)
      .expect(200);

    expect(removed.body.data.myReaction).toBeNull();
    expect(removed.body.data.total).toBe(0);
    expect(await React.countDocuments({ post: post._id })).toBe(0);
  });

  it("removing a reaction the user never set is safe (no error, empty summary)", async () => {
    const post = await newPost();
    const res = await request(app)
      .delete(`/react/post/${post._id}`)
      .set("authorization", reactorToken)
      .expect(200);
    expect(res.body.data.total).toBe(0);
  });
});

describe("Legacy like/dislike endpoints stay compatible", () => {
  it("legacy like still writes the React row and the Post.likes array", async () => {
    const post = await newPost();

    await request(app)
      .post(`/react/post/${post._id}/like`)
      .set("authorization", reactorToken)
      .expect(200);

    const stored = await Post.findById(post._id).lean();
    expect((stored!.likes ?? []).map(String)).toContain(String(reactor._id));

    // The unified summary sees the legacy like.
    const summary = await request(app)
      .get(`/react/summary/post/${post._id}`)
      .set("authorization", reactorToken);
    expect(summary.body.data.myReaction).toBe("like");
    expect(summary.body.data.counts.like).toBe(1);
  });

  it("switching from legacy like to a modern reaction clears Post.likes", async () => {
    const post = await newPost();

    await request(app)
      .post(`/react/post/${post._id}/like`)
      .set("authorization", reactorToken)
      .expect(200);

    await request(app)
      .post(`/react/post/${post._id}`)
      .set("authorization", reactorToken)
      .send({ type: "haha" })
      .expect(200);

    const stored = await Post.findById(post._id).lean();
    expect((stored!.likes ?? []).map(String)).not.toContain(
      String(reactor._id),
    );
  });

  it("legacy dislike is preserved in storage but not part of the 7-type set", async () => {
    const post = await newPost();

    await request(app)
      .post(`/react/post/${post._id}/dislike`)
      .set("authorization", reactorToken)
      .expect(200);

    const summary = await request(app)
      .get(`/react/summary/post/${post._id}`)
      .set("authorization", reactorToken);
    // Legacy dislike rows still count toward `total` but the UI's 7 types
    // do not include it.
    expect(summary.body.data.total).toBe(1);
    expect(summary.body.data.myReaction).toBe("dislike");
  });
});

describe("Comment and Short reactions", () => {
  it("supports the same reaction set on comments", async () => {
    const post = await newPost();
    const comment = await Comment.create({
      user: author._id,
      post: post._id,
      text: "Great tip!",
    });

    const res = await request(app)
      .post(`/react/comment/${comment._id}`)
      .set("authorization", reactorToken)
      .send({ type: "care" })
      .expect(200);
    expect(res.body.data.myReaction).toBe("care");

    const summary = await request(app)
      .get(`/react/summary/comment/${comment._id}`)
      .set("authorization", otherToken)
      .expect(200);
    expect(summary.body.data.counts.care).toBe(1);
    expect(summary.body.data.myReaction).toBeNull();
  });

  it("supports reactions on shorts", async () => {
    const short = await Short.create({
      user: author._id,
      title: "Sunrise hike",
      video: "https://res.cloudinary.com/demo/video/upload/dog.mp4",
      status: "PUBLISHED",
    });

    await request(app)
      .post(`/react/short/${short._id}`)
      .set("authorization", reactorToken)
      .send({ type: "wow" })
      .expect(200);

    const summary = await request(app)
      .get(`/react/summary/short/${short._id}`)
      .set("authorization", reactorToken)
      .expect(200);
    expect(summary.body.data.counts.wow).toBe(1);
  });
});

describe("Access control and validation", () => {
  it("404s when reacting to a deleted post", async () => {
    const post = await newPost({ isDeleted: true });
    const res = await request(app)
      .post(`/react/post/${post._id}`)
      .set("authorization", reactorToken)
      .send({ type: "like" });
    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    const post = await newPost();
    const res = await request(app)
      .post(`/react/post/${post._id}`)
      .send({ type: "like" });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown target type", async () => {
    const post = await newPost();
    const res = await request(app)
      .post(`/react/destination/${post._id}`)
      .set("authorization", reactorToken)
      .send({ type: "like" });
    expect(res.status).toBe(400);
  });

  it("404s for an invalid target id without leaking existence", async () => {
    const res = await request(app)
      .post(`/react/post/${new mongoose.Types.ObjectId()}`)
      .set("authorization", reactorToken)
      .send({ type: "like" });
    expect(res.status).toBe(404);
  });

  it("never returns other users' identities in the summary", async () => {
    const post = await newPost();
    await request(app)
      .post(`/react/post/${post._id}`)
      .set("authorization", otherToken)
      .send({ type: "love" })
      .expect(200);

    const summary = await request(app)
      .get(`/react/summary/post/${post._id}`)
      .set("authorization", reactorToken)
      .expect(200);

    expect(JSON.stringify(summary.body.data)).not.toContain(String(other._id));
    expect(summary.body.data.counts.love).toBe(1);
    expect(summary.body.data.myReaction).toBeNull();
  });
});
