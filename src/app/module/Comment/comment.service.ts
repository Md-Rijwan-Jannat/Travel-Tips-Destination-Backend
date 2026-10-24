import { IComment } from "./comment.interface";
import { Comment } from "./comment.model";
import AppError from "../../errors/AppError";
import httpStatus from "http-status";
import { User } from "../User/user.model";
import { Post } from "../Post/post.model";
import { TPost } from "../Post/post.interface";
import { React } from "../Reacts/react.model";
import mongoose, { Types } from "mongoose";
import { assertCanInteractWithPost, assertCanViewPost } from "../Post/postAccess";
import { Short } from "../Short/short.model";
import { ShortService } from "../Short/short.service";
import { NotificationService } from "../Notification/notification.service";

type TRequester = { id: string; role: string };
type TCommentSortMode = "TOP" | "NEWEST" | "OLDEST";

const transactionsSupported = async (): Promise<boolean> => {
  try {
    const db = mongoose.connection.db;
    if (!db) return false;
    const hello = await db.admin().command({ hello: 1 });
    // Transactions require a replica set / mongos.
    return hello.setName !== undefined || hello.msg === "isdbgrid";
  } catch {
    return false;
  }
};

// Add a comment to the DB (to a post OR a short). The target's access rules
// (group membership, audience, moderation state) are enforced server-side.
const addCommentIntoDB = async (payload: Partial<IComment>, userId: string, requester?: TRequester): Promise<IComment> => {
  const req: TRequester = requester ?? { id: userId, role: "USER" };

  if (payload.short) {
    const short = await Short.findById(String(payload.short));
    if (!short || short.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, "Post not found");
    }
    await ShortService.assertCanInteractWithShort(short, req);

    const comment = await Comment.create({
      text: payload.text,
      images: payload.images ?? [],
      user: userId,
      short: short._id,
    });
    await Short.updateOne({ _id: short._id }, { $inc: { commentCount: 1 } });
    return comment;
  }

  const post = await Post.findById(payload.post);
  if (!post || post.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Post not found");
  }
  await assertCanInteractWithPost(post, req);

  if (await transactionsSupported()) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new AppError(httpStatus.NOT_FOUND, "User not found");
      }

      const comment = await Comment.create([{ ...payload, user: userId, short: null }], {
        session,
      });

      await Post.findByIdAndUpdate(payload.post, { $push: { comments: comment[0]._id } }, { session });

      await session.commitTransaction();
      session.endSession();

      // Notify post author (fire-and-forget after transaction committed).
      void (async () => {
        try {
          const postDoc = await Post.findById(payload.post).select("user title").lean();
          if (postDoc) {
            await NotificationService.createNotificationIntoDB({
              recipient: String(postDoc.user),
              actor: userId,
              type: "post.commented",
              title: "Someone commented on your post",
              body: typeof payload.text === "string" ? payload.text.slice(0, 120) : undefined,
              link: `/posts/${String(payload.post)}`,
              entityType: "post",
              entityId: String(payload.post),
            });
          }
        } catch {
          /* never block */
        }
      })();

      return comment[0];
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  // Standalone deployments (no replica set) cannot run transactions — the
  // same ordered operations run without one so commenting still works.
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  const comment = await Comment.create({ ...payload, user: userId, short: null });
  await Post.findByIdAndUpdate(payload.post, { $push: { comments: comment._id } });

  // Notify post author (standalone path).
  void (async () => {
    try {
      const postDoc = await Post.findById(payload.post).select("user title").lean();
      if (postDoc) {
        await NotificationService.createNotificationIntoDB({
          recipient: String(postDoc.user),
          actor: userId,
          type: "post.commented",
          title: "Someone commented on your post",
          body: typeof payload.text === "string" ? payload.text.slice(0, 120) : undefined,
          link: `/posts/${String(payload.post)}`,
          entityType: "post",
          entityId: String(payload.post),
        });
      }
    } catch {
      /* never block */
    }
  })();

  return comment;
};

const getAllCommentFromDB = async (): Promise<IComment[]> => {
  const comments = await Comment.find({ isDeleted: false })
    .populate("user")
    .populate({
      path: "replies",
      populate: {
        path: "user",
      },
    });
  return comments;
};

/* ------------------------------------------------------------------ */
/* Sorting + automatic/manual highlighting                             */
/* ------------------------------------------------------------------ */

/**
 * Documented engagement policy used by both TOP sorting and automatic
 * highlighting (deterministic, predictable, resistant to tiny fluctuations):
 *
 *   score = reactions * 3 + liveReplies * 2 + recencyBonus
 *   recencyBonus = 3 * max(0, 1 - ageDays / 7)      (fades over 7 days)
 *
 * A comment is considered "strongly engaged" when it has at least
 * STRONG_ENGAGEMENT_MIN total reactions + replies. Automatic highlighting
 * prefers the best strongly-engaged comment; when none exists it falls back
 * to the most recent eligible comment. Reaction count alone can never
 * dominate indefinitely because recency keeps rotating candidates and the
 * strong-gate prevents single-count churn from flipping the choice.
 */
const RECENCY_WINDOW_DAYS = 7;
const STRONG_ENGAGEMENT_MIN = 2;

interface TRankable {
  id: string;
  createdAt: Date;
  reactions: number;
  replies: number;
}

const engagementScore = (entry: TRankable, now: number): number => {
  const ageMs = now - entry.createdAt.getTime();
  const ageDays = Math.max(0, ageMs / 86_400_000);
  const recency = ageDays >= RECENCY_WINDOW_DAYS ? 0 : 3 * (1 - ageDays / RECENCY_WINDOW_DAYS);
  return entry.reactions * 3 + entry.replies * 2 + recency;
};

const resolveSortMode = (raw: unknown, fallback: TCommentSortMode): TCommentSortMode => {
  const value = typeof raw === "string" ? raw.toUpperCase() : "";
  if (value === "TOP" || value === "NEWEST" || value === "OLDEST") return value;
  // Legacy query spellings.
  if (raw === "newest" || raw === "-createdAt") return "NEWEST";
  if (raw === "oldest" || raw === "createdAt") return "OLDEST";
  return fallback;
};

const fetchCommentPool = async (filter: Record<string, unknown>): Promise<IComment[]> => {
  // Live comments, plus soft-deleted comments that still have surviving
  // replies (so their threads can render as neutral placeholders instead of
  // silently orphaning the children).
  return Comment.find({
    ...filter,
    $or: [{ isDeleted: false }, { isDeleted: true, replies: { $not: { $size: 0 } } }],
  })
    .populate("user")
    .populate({ path: "replies", populate: { path: "user" } });
};

const reactionCountsByComment = async (commentIds: Types.ObjectId[]): Promise<Map<string, number>> => {
  if (commentIds.length === 0) return new Map();
  const rows = await React.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { comment: { $in: commentIds } } },
    { $group: { _id: "$comment", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
};

export interface TCommentListResult {
  comments: IComment[];
  sortMode: TCommentSortMode;
  featuredCommentId: string | null;
  featuredMode: "manual" | "automatic" | "none";
}

/**
 * Comment list for a post: every live comment plus surviving-thread
 * placeholders, top-level comments ordered by the resolved sort mode
 * (viewer ?sort= overrides the owner's default) and replies in chronological
 * order. Also resolves the featured comment (manual owner selection with a
 * graceful automatic fallback).
 */
const getCommentForPostFromDB = async (
  postId: string,
  query: Record<string, unknown>,
  requester?: TRequester,
): Promise<TCommentListResult> => {
  let post: TPost | null = null;
  try {
    post = await Post.findById(postId);
  } catch {
    // Invalid id → empty list (same as a post that never existed).
    return {
      comments: [],
      sortMode: "TOP",
      featuredCommentId: null,
      featuredMode: "none",
    };
  }
  if (post && requester) {
    await assertCanViewPost(post, requester);
  }
  if (!post || post.isDeleted) {
    return {
      comments: [],
      sortMode: "TOP",
      featuredCommentId: null,
      featuredMode: "none",
    };
  }

  const settings = post.commentSettings;
  const sortMode = resolveSortMode(query.sort, settings?.sortMode ?? "TOP");

  const pool = await fetchCommentPool({ post: postId });
  const topLevel = pool.filter((c) => !c.parentComment);
  const replies = pool.filter((c) => c.parentComment);

  // Live reply counts per top-level comment (computed from the pool the
  // caller can actually see — soft-deleted replies never count).
  const liveRepliesByParent = new Map<string, number>();
  for (const reply of replies) {
    if (reply.isDeleted) continue;
    const parentId = String(reply.parentComment);
    liveRepliesByParent.set(parentId, (liveRepliesByParent.get(parentId) ?? 0) + 1);
  }

  const reactionCounts = await reactionCountsByComment(topLevel.map((c) => c._id as Types.ObjectId));

  const now = Date.now();
  const rankables = new Map<string, TRankable>();
  for (const comment of topLevel) {
    const id = String(comment._id);
    rankables.set(id, {
      id,
      createdAt: comment.createdAt ?? new Date(0),
      reactions: reactionCounts.get(id) ?? 0,
      replies: liveRepliesByParent.get(id) ?? 0,
    });
  }

  const sortedTop = [...topLevel].sort((a, b) => {
    if (sortMode === "NEWEST") {
      return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
    }
    if (sortMode === "OLDEST") {
      return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
    }
    // TOP
    const sa = engagementScore(rankables.get(String(a._id))!, now);
    const sb = engagementScore(rankables.get(String(b._id))!, now);
    if (sb !== sa) return sb - sa;
    // Deterministic tie-break: stronger engagement first, then newest.
    const ra = rankables.get(String(a._id))!;
    const rb = rankables.get(String(b._id))!;
    if (rb.reactions !== ra.reactions) return rb.reactions - ra.reactions;
    return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
  });

  const sortedReplies = [...replies].sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));

  /* ----- featured comment resolution ----- */
  let featuredCommentId: string | null = null;
  let featuredMode: "manual" | "automatic" | "none" = "none";

  // Eligible = live, top-level, visible comments (placeholders excluded).
  const eligible = sortedTop.filter((c) => !c.isDeleted);

  if (settings?.highlightMode === "MANUAL" && settings.highlightedComment) {
    const manualId = String(settings.highlightedComment);
    const manual = eligible.find((c) => String(c._id) === manualId);
    if (manual) {
      featuredCommentId = manualId;
      featuredMode = "manual";
    } else {
      // The manually featured comment was deleted or became ineligible —
      // fall back to automatic selection and clear the stale pointer.
      await Post.updateOne(
        { _id: postId, "commentSettings.highlightedComment": settings.highlightedComment },
        {
          $set: {
            "commentSettings.highlightMode": "AUTO",
            "commentSettings.highlightedComment": null,
          },
        },
      );
    }
  }

  if (!featuredCommentId && eligible.length > 0) {
    const strong = eligible.filter((c) => {
      const r = rankables.get(String(c._id))!;
      return r.reactions + r.replies >= STRONG_ENGAGEMENT_MIN;
    });

    if (strong.length > 0) {
      let winner = strong[0];
      let winnerScore = engagementScore(rankables.get(String(winner._id))!, now);
      for (const candidate of strong.slice(1)) {
        const score = engagementScore(rankables.get(String(candidate._id))!, now);
        if (score > winnerScore || (score === winnerScore && (candidate.createdAt?.getTime() ?? 0) < (winner.createdAt?.getTime() ?? 0))) {
          winner = candidate;
          winnerScore = score;
        }
      }
      featuredCommentId = String(winner._id);
      featuredMode = "automatic";
    } else {
      // No meaningful engagement yet → the most recent eligible comment.
      const mostRecent = eligible.reduce((best, c) => ((c.createdAt?.getTime() ?? 0) > (best.createdAt?.getTime() ?? 0) ? c : best));
      featuredCommentId = String(mostRecent._id);
      featuredMode = "automatic";
    }
  }

  return {
    // Flat list (top-level in sorted order, then replies chronologically) —
    // clients rebuild the tree from `parentComment` pointers.
    comments: [...sortedTop, ...sortedReplies],
    sortMode,
    featuredCommentId,
    featuredMode,
  };
};

const getCommentsForShortFromDB = async (
  shortId: string,
  query: Record<string, unknown>,
  requester: TRequester,
): Promise<TCommentListResult> => {
  if (!mongoose.Types.ObjectId.isValid(shortId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Post not found");
  }
  const short = await Short.findById(shortId);
  if (!short) throw new AppError(httpStatus.NOT_FOUND, "Post not found");
  await ShortService.assertCanViewShort(short, requester);

  const sortMode = resolveSortMode(query.sort, "NEWEST");
  const pool = await fetchCommentPool({ short: shortId });
  const topLevel = pool.filter((c) => !c.parentComment);
  const replies = pool.filter((c) => c.parentComment);

  const sortedTop = [...topLevel].sort((a, b) =>
    sortMode === "OLDEST"
      ? (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
      : sortMode === "TOP"
        ? (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
        : (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  );
  const sortedReplies = [...replies].sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));

  return {
    comments: [...sortedTop, ...sortedReplies],
    sortMode,
    featuredCommentId: null,
    featuredMode: "none",
  };
};

type TRequesterShape = TRequester;

const assertCanModifyComment = (comment: { user: unknown }, requester: TRequesterShape) => {
  const isOwner = String(comment.user) === requester.id;
  if (!isOwner && requester.role !== "ADMIN") {
    throw new AppError(httpStatus.FORBIDDEN, "You are not allowed to modify this comment");
  }
};

// Update a comment by ID (owner or admin only)
const updateCommentIntoDB = async (
  commentId: string,
  updateData: Partial<IComment>,
  requester: TRequesterShape,
): Promise<IComment | null> => {
  const existing = await Comment.findById(commentId);
  if (!existing || existing.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Comment not found");
  }
  assertCanModifyComment(existing, requester);

  // Only text/images are content; ownership fields are never writable here.
  const allowed: Record<string, unknown> = {};
  if (updateData.text !== undefined) allowed.text = updateData.text;
  if (updateData.images !== undefined) allowed.images = updateData.images;
  if (updateData.text !== undefined && updateData.text !== existing.text) {
    allowed.editedAt = new Date();
  }

  const comment = await Comment.findByIdAndUpdate(commentId, allowed, {
    new: true,
  });
  if (!comment || comment.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Comment not found");
  }
  return comment;
};

/**
 * Delete a comment by ID (owner or admin only).
 *
 * Deletion is a SOFT delete: the row survives so reply threads keep their
 * parent linkage and render as a neutral placeholder instead of orphaning
 * children. Top-level comments are also removed from the post's comment-id
 * list (keeps counts accurate) and a manual featured-comment pointer at this
 * comment gracefully returns the post to automatic highlighting.
 */
const deleteCommentFromDB = async (commentId: string, requester: TRequesterShape): Promise<void> => {
  const existing = await Comment.findById(commentId);
  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, "Comment not found");
  }
  assertCanModifyComment(existing, requester);

  if (existing.isDeleted) {
    // Idempotent: repeating a delete is not an error (retry safety).
    return;
  }

  if (existing.short) {
    await Short.updateOne({ _id: existing.short }, { $inc: { commentCount: -1 } });
  }

  // Soft delete: keep the document (thread integrity) but blank the content
  // so deleted text never leaks through list/populate responses.
  await Comment.findByIdAndUpdate(commentId, {
    isDeleted: true,
    text: "",
    editedAt: null,
  });

  // Top-level comment → drop from the post's comment id list.
  if (existing.post && !existing.parentComment) {
    await Post.updateOne({ _id: existing.post }, { $pull: { comments: commentId } });
  }

  // A manual featured pointer at this comment falls back to automatic.
  if (existing.post) {
    await Post.updateOne(
      {
        _id: existing.post,
        "commentSettings.highlightedComment": commentId,
      },
      {
        $set: {
          "commentSettings.highlightMode": "AUTO",
          "commentSettings.highlightedComment": null,
        },
      },
    );
  }
};

// Reply to a comment (target is inherited from the parent so a reply can
// never be attached to a different post/short than its parent). Replying to
// a reply is allowed — clients flatten deep levels visually while keeping
// the original parent/reply relationship.
const replyToCommentFromDB = async (
  commentId: string,
  replyData: Partial<IComment>,
  id: string,
  requester?: TRequester,
): Promise<IComment> => {
  const comment = await Comment.findById(commentId);
  if (!comment || comment.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Comment not found");
  }

  if (comment.short) {
    const short = await Short.findById(String(comment.short));
    if (short) {
      const req = requester ?? { id, role: "USER" };
      await ShortService.assertCanInteractWithShort(short, req);
    }
    const reply = await Comment.create({
      text: replyData.text,
      images: replyData.images ?? [],
      user: id,
      short: comment.short,
      parentComment: comment._id,
    });
    await Short.updateOne({ _id: comment.short }, { $inc: { commentCount: 1 } });
    await Comment.findByIdAndUpdate(commentId, { $push: { replies: reply._id } });
    return reply;
  }

  if (comment.post && requester) {
    const post = await Post.findById(String(comment.post));
    if (post) {
      await assertCanInteractWithPost(post, requester);
    }
  }

  const reply = await Comment.create({
    ...replyData,
    user: id,
    short: null,
    post: comment.post ?? replyData.post,
    parentComment: comment._id,
  });
  await Comment.findByIdAndUpdate(commentId, { $push: { replies: reply._id } });

  // Notify the parent comment author about the reply (fire-and-forget).
  void (async () => {
    try {
      await NotificationService.createNotificationIntoDB({
        recipient: String(comment.user),
        actor: id,
        type: "comment.replied",
        title: "Someone replied to your comment",
        body: typeof replyData.text === "string" ? replyData.text.slice(0, 120) : undefined,
        link: comment.post ? `/posts/${String(comment.post)}` : null,
        entityType: "comment",
        entityId: String(comment._id),
      });
    } catch {
      /* never block */
    }
  })();

  return reply;
};

export const CommentService = {
  addCommentIntoDB,
  getAllCommentFromDB,
  getCommentForPostFromDB,
  getCommentsForShortFromDB,
  updateCommentIntoDB,
  deleteCommentFromDB,
  replyToCommentFromDB,
};
