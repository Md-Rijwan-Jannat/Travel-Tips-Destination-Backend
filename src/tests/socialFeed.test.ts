import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import globalErrorHandler from "../app/middlewares/globalErrorhandler";
import { PostRoutes } from "../app/module/Post/post.routes";
import { CommentRoutes } from "../app/module/Comment/comment.routes";
import { GroupRoutes } from "../app/module/Group/group.routes";
import { User } from "../app/module/User/user.model";
import { Post } from "../app/module/Post/post.model";
import { PostHidden } from "../app/module/Post/postHidden.model";
import { Comment } from "../app/module/Comment/comment.model";
import { React } from "../app/module/Reacts/react.model";
import { Group } from "../app/module/Group/group.model";
import { GroupMembership } from "../app/module/Group/groupMembership.model";
import { createToken } from "../app/utils/tokenGenerateFunction";

// Aura Trip social-feed upgrade tests: media layout persistence, validation,
// profile pin/feature, per-user hide, group pin, comment settings, nested
// comment sorting/highlighting and soft deletion.

const TEST_SECRET = process.env.jwt_access_secret as string;

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/posts", PostRoutes);
  app.use("/comments", CommentRoutes);
  app.use("/groups", GroupRoutes);
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
let viewer: any;
let admin: any;
let authorToken: string;
let viewerToken: string;
let adminToken: string;

const basePost = (overrides: Record<string, unknown> = {}) => ({
  images: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
  title: "Sunrise at the pier",
  description: "Golden hour was unreal today.",
  category: "Photography",
  status: "FREE",
  ...overrides,
});

const createPostViaApi = async (
  overrides: Record<string, unknown> = {},
  token = authorToken,
) => {
  const res = await request(app)
    .post("/posts")
    .set("authorization", token)
    .send(basePost(overrides));
  expect(res.status).toBe(201);
  return res.body.data;
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Build indexes (partial unique pin/feature slots, reaction uniqueness)
  // before any test runs so race-recovery paths behave like production.
  await Promise.all([Post.init(), Comment.init(), React.init()]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Post.deleteMany({}),
    PostHidden.deleteMany({}),
    Comment.deleteMany({}),
    React.deleteMany({}),
    Group.deleteMany({}),
    GroupMembership.deleteMany({}),
  ]);

  author = await User.create({
    name: "Author",
    email: "author@example.com",
    password: "AuthorPass123!",
  });
  viewer = await User.create({
    name: "Viewer",
    email: "viewer@example.com",
    password: "ViewerPass123!",
  });
  admin = await User.create({
    name: "Admin",
    email: "admin@example.com",
    password: "AdminPass123!",
    role: "ADMIN",
  });

  authorToken = makeToken(author);
  viewerToken = makeToken(viewer);
  adminToken = makeToken(admin);
});

describe("Post creation validation", () => {
  it("creates a post with a media layout and derives the author from the token", async () => {
    const post = await createPostViaApi({ mediaLayout: "FEATURE" });
    expect(post.mediaLayout).toBe("FEATURE");
    expect(String(post.user)).toBe(String(author._id));
    expect(post.isEdited).toBe(false);
    expect(post.pinned).toBe(false);
    expect(post.featured).toBe(false);
  });

  it("accepts the composer's single-string category and strips integrity fields", async () => {
    const res = await request(app)
      .post("/posts")
      .set("authorization", authorToken)
      .send({
        ...basePost(),
        // Simulates a tampered payload — must never reach the database.
        likes: [String(viewer._id)],
        reportCount: 999,
        isDeleted: false,
        user: String(viewer._id),
      });
    expect(res.status).toBe(201);
    const stored = await Post.findById(res.body.data._id).lean();
    expect(stored!.likes).toHaveLength(0);
    expect(stored!.reportCount).toBe(0);
    expect(String(stored!.user)).toBe(String(author._id));
  });

  it("rejects an invalid media layout", async () => {
    const res = await request(app)
      .post("/posts")
      .set("authorization", authorToken)
      .send(basePost({ mediaLayout: "COLLAGE" }));
    expect(res.status).toBe(400);
  });

  it("rejects non-https media URLs", async () => {
    const res = await request(app)
      .post("/posts")
      .set("authorization", authorToken)
      .send(basePost({ images: ["javascript:alert(1)"] }));
    expect(res.status).toBe(400);
  });

  it("allows a text-only post (no images)", async () => {
    const res = await request(app)
      .post("/posts")
      .set("authorization", authorToken)
      .send({ ...basePost(), images: [] });
    expect(res.status).toBe(201);
  });

  it("marks a post as edited when its content changes", async () => {
    const post = await createPostViaApi();
    expect(post.isEdited).toBe(false);

    const res = await request(app)
      .patch(`/posts/${post._id}`)
      .set("authorization", authorToken)
      .send({ description: "Updated caption" });
    expect(res.status).toBe(200);
    expect(res.body.data.isEdited).toBe(true);
    expect(res.body.data.editedAt).toBeTruthy();
  });
});

describe("Profile pin and highlight", () => {
  it("pins a post and moves the single pin when another post is pinned", async () => {
    const first = await createPostViaApi({ title: "First" });
    const second = await createPostViaApi({ title: "Second" });

    await request(app)
      .post(`/posts/${first._id}/pin`)
      .set("authorization", authorToken)
      .send({ pinned: true })
      .expect(200);

    await request(app)
      .post(`/posts/${second._id}/pin`)
      .set("authorization", authorToken)
      .send({ pinned: true })
      .expect(200);

    const rows = await Post.find({ user: author._id, pinned: true });
    expect(rows).toHaveLength(1);
    expect(String(rows[0]._id)).toBe(String(second._id));
  });

  it("unpins without touching other posts", async () => {
    const post = await createPostViaApi();
    await request(app)
      .post(`/posts/${post._id}/pin`)
      .set("authorization", authorToken)
      .send({ pinned: true })
      .expect(200);

    const res = await request(app)
      .post(`/posts/${post._id}/pin`)
      .set("authorization", authorToken)
      .send({ pinned: false });
    expect(res.status).toBe(200);
    expect(res.body.data.pinned).toBe(false);
    expect(await Post.countDocuments({ pinned: true })).toBe(0);
  });

  it("keeps concurrent pins consistent (exactly one winner)", async () => {
    const a = await createPostViaApi({ title: "A" });
    const b = await createPostViaApi({ title: "B" });

    const results = await Promise.all([
      request(app).post(`/posts/${a._id}/pin`).set("authorization", authorToken).send({ pinned: true }),
      request(app).post(`/posts/${b._id}/pin`).set("authorization", authorToken).send({ pinned: true }),
    ]);
    for (const res of results) {
      expect([200, 500]).toContain(res.status);
    }

    expect(await Post.countDocuments({ user: author._id, pinned: true })).toBe(1);
  });

  it("rejects pinning by someone other than the owner", async () => {
    const post = await createPostViaApi();
    const res = await request(app)
      .post(`/posts/${post._id}/pin`)
      .set("authorization", viewerToken)
      .send({ pinned: true });
    expect(res.status).toBe(403);
  });

  it("maintains an independent single featured slot", async () => {
    const p1 = await createPostViaApi({ title: "P1" });
    const p2 = await createPostViaApi({ title: "P2" });

    await request(app)
      .post(`/posts/${p1._id}/feature`)
      .set("authorization", authorToken)
      .send({ featured: true })
      .expect(200);
    await request(app)
      .post(`/posts/${p1._id}/pin`)
      .set("authorization", authorToken)
      .send({ pinned: true })
      .expect(200);
    await request(app)
      .post(`/posts/${p2._id}/feature`)
      .set("authorization", authorToken)
      .send({ featured: true })
      .expect(200);

    // P1 remains pinned while P2 takes the featured slot.
    expect(await Post.countDocuments({ pinned: true })).toBe(1);
    const featured = await Post.find({ featured: true });
    expect(featured).toHaveLength(1);
    expect(String(featured[0]._id)).toBe(String(p2._id));
    const pinned = await Post.findOne({ pinned: true });
    expect(String(pinned!._id)).toBe(String(p1._id));
  });
});

describe("Per-user hide", () => {
  it("hides a post from the hider's feed only", async () => {
    const post = await createPostViaApi();

    await request(app)
      .post(`/posts/${post._id}/hide`)
      .set("authorization", viewerToken)
      .expect(200);

    const viewerFeed = await request(app)
      .get("/posts")
      .set("authorization", viewerToken);
    expect(viewerFeed.body.data.map((p: any) => p._id)).not.toContain(post._id);

    const authorFeed = await request(app)
      .get("/posts")
      .set("authorization", authorToken);
    expect(authorFeed.body.data.map((p: any) => p._id)).toContain(post._id);

    // The original post still exists untouched.
    expect(await PostHidden.countDocuments({ user: viewer._id })).toBe(1);
    const stored = await Post.findById(post._id).lean();
    expect(stored!.isDeleted).toBe(false);
  });

  it("restores the post on unhide", async () => {
    const post = await createPostViaApi();
    await request(app)
      .post(`/posts/${post._id}/hide`)
      .set("authorization", viewerToken)
      .expect(200);

    await request(app)
      .delete(`/posts/${post._id}/hide`)
      .set("authorization", viewerToken)
      .expect(200);

    const feed = await request(app)
      .get("/posts")
      .set("authorization", viewerToken);
    expect(feed.body.data.map((p: any) => p._id)).toContain(post._id);
  });

  it("does not affect the premium feed filter path", async () => {
    const post = await createPostViaApi({ status: "PREMIUM" });
    await request(app)
      .post(`/posts/${post._id}/hide`)
      .set("authorization", viewerToken)
      .expect(200);

    const feed = await request(app)
      .get("/posts/premium")
      .set("authorization", viewerToken);
    expect(feed.body.data.map((p: any) => p._id)).not.toContain(post._id);
  });
});

describe("Group pinning", () => {
  const createGroup = async (): Promise<any> => {
    const res = await request(app)
      .post("/groups")
      .set("authorization", authorToken)
      .send({
        name: "Alpine Trails",
        description: "A group for mountain trail sharing.",
        category: "Travel Tips",
      });
    expect(res.status).toBe(201);
    return res.body.data;
  };

  it("lets group staff pin inside the group without claiming the profile pin", async () => {
    const group = await createGroup();
    const groupPost = await Post.create({
      ...basePost({ title: "Group post" }),
      user: author._id,
      group: group._id,
      groupVisibility: group.visibility,
    });

    // Profile-pin an unrelated personal post first.
    const personal = await createPostViaApi({ title: "Personal" });
    await request(app)
      .post(`/posts/${personal._id}/pin`)
      .set("authorization", authorToken)
      .send({ pinned: true })
      .expect(200);

    const res = await request(app)
      .post(`/posts/${groupPost._id}/group-pin`)
      .set("authorization", authorToken)
      .send({ pinned: true });
    expect(res.status).toBe(200);
    expect(res.body.data.groupPinnedAt).toBeTruthy();

    // Profile pin slot untouched by the group pin.
    const pinnedRows = await Post.find({ pinned: true });
    expect(pinnedRows).toHaveLength(1);
    expect(String(pinnedRows[0]._id)).toBe(String(personal._id));
  });

  it("rejects group pinning by non-members", async () => {
    const group = await createGroup();
    const groupPost = await Post.create({
      ...basePost({ title: "Group post" }),
      user: author._id,
      group: group._id,
      groupVisibility: group.visibility,
    });

    const res = await request(app)
      .post(`/posts/${groupPost._id}/group-pin`)
      .set("authorization", viewerToken)
      .send({ pinned: true });
    expect(res.status).toBe(403);
  });

  it("enforces the per-group pin limit", async () => {
    const group = await createGroup();
    const posts = [];
    for (let i = 0; i < 4; i += 1) {
      posts.push(
        await Post.create({
          ...basePost({ title: `Pinned ${i}` }),
          user: author._id,
          group: group._id,
          groupVisibility: group.visibility,
        }),
      );
    }

    for (let i = 0; i < 3; i += 1) {
      const res = await request(app)
        .post(`/posts/${posts[i]._id}/group-pin`)
        .set("authorization", authorToken)
        .send({ pinned: true });
      expect(res.status).toBe(200);
    }

    const overflow = await request(app)
      .post(`/posts/${posts[3]._id}/group-pin`)
      .set("authorization", authorToken)
      .send({ pinned: true });
    expect(overflow.status).toBe(400);
  });
});

describe("Comment settings and featured comment", () => {
  it("lets the owner feature a specific comment manually", async () => {
    const post = await createPostViaApi();
    const comment = await Comment.create({
      user: viewer._id,
      post: post._id,
      text: "This is the one!",
    });

    const res = await request(app)
      .patch(`/posts/${post._id}/comment-settings`)
      .set("authorization", authorToken)
      .send({ highlightedComment: String(comment._id) });
    expect(res.status).toBe(200);
    expect(res.body.data.highlightMode).toBe("MANUAL");
    expect(String(res.body.data.highlightedComment)).toBe(String(comment._id));

    const list = await request(app)
      .get(`/comments/${post._id}`)
      .set("authorization", authorToken);
    expect(list.body.meta.featuredCommentId).toBe(String(comment._id));
    expect(list.body.meta.featuredMode).toBe("manual");
  });

  it("rejects featuring a comment from a different post", async () => {
    const postA = await createPostViaApi({ title: "A" });
    const postB = await createPostViaApi({ title: "B" });
    const comment = await Comment.create({
      user: viewer._id,
      post: postB._id,
      text: "Wrong post",
    });

    const res = await request(app)
      .patch(`/posts/${postA._id}/comment-settings`)
      .set("authorization", authorToken)
      .send({ highlightedComment: String(comment._id) });
    expect(res.status).toBe(400);
  });

  it("rejects comment-settings changes from non-owners", async () => {
    const post = await createPostViaApi();
    const res = await request(app)
      .patch(`/posts/${post._id}/comment-settings`)
      .set("authorization", viewerToken)
      .send({ sortMode: "NEWEST" });
    expect(res.status).toBe(403);
  });

  it("returns to automatic highlighting when the featured comment is deleted", async () => {
    const post = await createPostViaApi();
    const featured = await Comment.create({
      user: viewer._id,
      post: post._id,
      text: "Feature me",
    });
    const other = await Comment.create({
      user: author._id,
      post: post._id,
      text: "Another",
    });

    await request(app)
      .patch(`/posts/${post._id}/comment-settings`)
      .set("authorization", authorToken)
      .send({ highlightedComment: String(featured._id) })
      .expect(200);

    await request(app)
      .delete(`/comments/${featured._id}`)
      .set("authorization", viewerToken)
      .expect(200);

    const list = await request(app)
      .get(`/comments/${post._id}`)
      .set("authorization", authorToken);
    expect(list.body.meta.featuredMode).toBe("automatic");
    expect(list.body.meta.featuredCommentId).toBe(String(other._id));

    const stored = await Post.findById(post._id).lean();
    expect(stored!.commentSettings!.highlightMode).toBe("AUTO");
    expect(stored!.commentSettings!.highlightedComment).toBeNull();
  });
});

describe("Nested comment ordering, highlighting and soft deletion", () => {
  it("orders comments by newest, oldest and top (engagement)", async () => {
    const post = await createPostViaApi();

    const older = await Comment.create({
      user: viewer._id,
      post: post._id,
      text: "Old but loved",
      createdAt: new Date(Date.now() - 3600_000),
    });
    const newer = await Comment.create({
      user: viewer._id,
      post: post._id,
      text: "Fresh take",
      createdAt: new Date(Date.now() - 60_000),
    });

    // Two reactions on the older comment → strong engagement.
    await React.create([
      { user: viewer._id, comment: older._id, type: "love" },
      { user: author._id, comment: older._id, type: "like" },
    ]);

    const newest = await request(app)
      .get(`/comments/${post._id}?sort=newest`)
      .set("authorization", authorToken);
    expect(newest.body.data[0]._id).toBe(String(newer._id));
    expect(newest.body.meta.sortMode).toBe("NEWEST");

    const oldest = await request(app)
      .get(`/comments/${post._id}?sort=oldest`)
      .set("authorization", authorToken);
    expect(oldest.body.data[0]._id).toBe(String(older._id));

    const top = await request(app)
      .get(`/comments/${post._id}?sort=top`)
      .set("authorization", authorToken);
    expect(top.body.data[0]._id).toBe(String(older._id));

    // The engaged comment is automatically featured.
    expect(top.body.meta.featuredCommentId).toBe(String(older._id));
    expect(top.body.meta.featuredMode).toBe("automatic");
  });

  it("keeps reply threads alive when a parent comment is deleted", async () => {
    const post = await createPostViaApi();
    const parent = await Comment.create({
      user: author._id,
      post: post._id,
      text: "Parent comment",
    });
    const reply = await Comment.create({
      user: viewer._id,
      post: post._id,
      text: "Child reply",
      parentComment: parent._id,
    });
    await Comment.updateOne({ _id: parent._id }, { $push: { replies: reply._id } });
    await Post.updateOne({ _id: post._id }, { $push: { comments: parent._id } });

    await request(app)
      .delete(`/comments/${parent._id}`)
      .set("authorization", authorToken)
      .expect(200);

    const list = await request(app)
      .get(`/comments/${post._id}`)
      .set("authorization", authorToken);

    const placeholder = list.body.data.find((c: any) => c._id === String(parent._id));
    expect(placeholder).toBeTruthy();
    expect(placeholder.isDeleted).toBe(true);
    expect(placeholder.text).toBe("");

    const survivingReply = list.body.data.find(
      (c: any) => c._id === String(reply._id),
    );
    expect(survivingReply).toBeTruthy();
    expect(String(survivingReply.parentComment)).toBe(String(parent._id));

    // Top-level comment count dropped.
    const storedPost = await Post.findById(post._id).lean();
    expect((storedPost!.comments ?? []).map(String)).not.toContain(
      String(parent._id),
    );

    // A deleted comment is never featured.
    expect(list.body.meta.featuredCommentId).not.toBe(String(parent._id));
  });

  it("excludes deleted leaf comments entirely", async () => {
    const post = await createPostViaApi();
    const comment = await Comment.create({
      user: viewer._id,
      post: post._id,
      text: "Gone",
    });
    await Post.updateOne({ _id: post._id }, { $push: { comments: comment._id } });

    await request(app)
      .delete(`/comments/${comment._id}`)
      .set("authorization", viewerToken)
      .expect(200);

    const list = await request(app)
      .get(`/comments/${post._id}`)
      .set("authorization", authorToken);
    expect(list.body.data.map((c: any) => c._id)).not.toContain(
      String(comment._id),
    );
    expect(list.body.meta.featuredCommentId).toBeNull();
  });

  it("allows reply-to-reply and preserves the parent chain", async () => {
    const post = await createPostViaApi();
    const top = await Comment.create({
      user: author._id,
      post: post._id,
      text: "Top",
    });
    await Post.updateOne({ _id: post._id }, { $push: { comments: top._id } });

    const replyRes = await request(app)
      .post(`/comments/${top._id}/reply`)
      .set("authorization", viewerToken)
      .send({ text: "First reply" });
    expect(replyRes.status).toBe(201);

    const deepRes = await request(app)
      .post(`/comments/${replyRes.body.data._id}/reply`)
      .set("authorization", authorToken)
      .send({ text: "Reply to the reply" });
    expect(deepRes.status).toBe(201);
    expect(String(deepRes.body.data.parentComment)).toBe(
      String(replyRes.body.data._id),
    );

    const list = await request(app)
      .get(`/comments/${post._id}`)
      .set("authorization", viewerToken);
    const deep = list.body.data.find(
      (c: any) => c._id === deepRes.body.data._id,
    );
    expect(String(deep.parentComment)).toBe(String(replyRes.body.data._id));
  });

  it("marks a comment as edited when its text changes", async () => {
    const post = await createPostViaApi();
    const comment = await Comment.create({
      user: viewer._id,
      post: post._id,
      text: "Original",
    });

    const res = await request(app)
      .patch(`/comments/${comment._id}`)
      .set("authorization", viewerToken)
      .send({ text: "Corrected" });
    expect(res.status).toBe(200);
    expect(res.body.data.editedAt).toBeTruthy();
  });

  it("rejects editing someone else's comment", async () => {
    const post = await createPostViaApi();
    const comment = await Comment.create({
      user: viewer._id,
      post: post._id,
      text: "Mine",
    });

    const res = await request(app)
      .patch(`/comments/${comment._id}`)
      .set("authorization", authorToken)
      .send({ text: "Hijacked" });
    expect(res.status).toBe(403);
  });
});
