import AppError from "../../errors/AppError";
import { REACT_STORE_TYPES, TReact, TReactTargetType, TReactionSummary, TReactionType, TReactStoreType } from "./react.interface";
import httpStatus from "http-status";
import { React } from "./react.model";
import { Post } from "../Post/post.model";
import { Comment } from "../Comment/comment.model";
import { Short } from "../Short/short.model";
import { ShortService } from "../Short/short.service";
import { assertCanInteractWithPost } from "../Post/postAccess";
import mongoose from "mongoose";
import { NotificationService } from "../Notification/notification.service";

type TRequester = { id: string; role: string };

const TARGET_TYPES: TReactTargetType[] = ["post", "comment", "short"];

const isTargetType = (value: unknown): value is TReactTargetType => typeof value === "string" && (TARGET_TYPES as string[]).includes(value);

const isStoreType = (value: unknown): value is TReactStoreType =>
  typeof value === "string" && (REACT_STORE_TYPES as readonly string[]).includes(value);

const targetFilter = (targetType: TReactTargetType, targetId: string): Record<string, string> => ({ [targetType]: targetId });

/**
 * Target access gate: reacting requires being able to READ the target and,
 * for group content, active (unbanned/unmuted) membership in that group.
 * Missing/invisible targets surface as 404 (no existence probing).
 */
const assertReactTargetAccess = async (
  userId: string,
  targetId: string,
  type: "post" | "comment" | "short",
  requester?: TRequester,
): Promise<void> => {
  const req: TRequester = requester ?? { id: userId, role: "USER" };

  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Target not found");
  }

  if (type === "post") {
    const post = await Post.findById(targetId);
    if (!post || post.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, "Post not found");
    }
    await assertCanInteractWithPost(post, req);
    return;
  }

  if (type === "short") {
    const short = await Short.findById(targetId);
    if (!short || short.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, "Short not found");
    }
    await ShortService.assertCanInteractWithShort(short, req);
    return;
  }

  const comment = await Comment.findById(targetId);
  if (!comment || comment.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Comment not found");
  }
  if (comment.short) {
    const short = await Short.findById(String(comment.short));
    if (!short) throw new AppError(httpStatus.NOT_FOUND, "Comment not found");
    await ShortService.assertCanInteractWithShort(short, req);
    return;
  }
  if (comment.post) {
    const post = await Post.findById(String(comment.post));
    if (post) await assertCanInteractWithPost(post, req);
  }
};

// Get all likes
const getAllLikes = async () => {
  const result = await React.find({ type: "like" });

  return result;
};

// Get all dislikes
const getAllDisLikes = async () => {
  const result = await React.find({ type: "dislike" });

  return result;
};

/**
 * Legacy denormalization: posts and comments keep a `likes` user-id array
 * that older clients read for counts. The new reaction flows keep it in sync
 * when the reaction is (or becomes / stops being) a `like`. Shorts have their
 * own separate legacy like endpoint and are intentionally not synced here.
 */
const syncLegacyLikeArray = async (targetType: "post" | "comment", targetId: string, userId: string, isLike: boolean): Promise<void> => {
  const op = isLike ? "$addToSet" : "$pull";
  if (targetType === "post") {
    await Post.findByIdAndUpdate(targetId, { [op]: { likes: userId } });
  } else {
    await Comment.findByIdAndUpdate(targetId, { [op]: { likes: userId } });
  }
};

// Like a post or comment
const likeFromDB = async (userId: string, targetId: string, type: "post" | "comment", requester?: TRequester): Promise<TReact> => {
  await assertReactTargetAccess(userId, targetId, type, requester);

  const existingLikeReact = await React.findOne({
    user: userId,
    [type]: targetId,
    type: "like",
  });

  if (existingLikeReact) {
    throw new AppError(httpStatus.BAD_REQUEST, "You have already liked this item.");
  }

  const existingDislikeReact = await React.findOneAndDelete({
    user: userId,
    [type]: targetId,
    type: "dislike",
  });

  if (existingDislikeReact) {
    if (type === "post") {
      await Post.findByIdAndUpdate(targetId, {
        $pull: { dislikes: userId },
      });
    } else if (type === "comment") {
      await Comment.findByIdAndUpdate(targetId, {
        $pull: { dislikes: userId },
      });
    }
  }

  // Add new like
  const newReact = await React.create({
    user: userId,
    [type]: targetId,
    type: "like",
  });

  if (type === "post") {
    await Post.findByIdAndUpdate(targetId, {
      $push: { likes: userId },
    });
    // Notify the post author (deduped: only once per unread cycle).
    const post = await Post.findById(targetId).select("user title").lean();
    if (post) {
      await NotificationService.createNotificationIntoDB({
        recipient: String(post.user),
        actor: userId,
        type: "post.liked",
        title: "Someone liked your post",
        body: post.title ?? undefined,
        link: `/posts/${targetId}`,
        entityType: "post",
        entityId: targetId,
        dedupe: true,
      });
    }
  } else if (type === "comment") {
    await Comment.findByIdAndUpdate(targetId, {
      $push: { likes: userId },
    });
    // Notify the comment author.
    const comment = await Comment.findById(targetId).select("user post").lean();
    if (comment) {
      await NotificationService.createNotificationIntoDB({
        recipient: String(comment.user),
        actor: userId,
        type: "comment.liked",
        title: "Someone liked your comment",
        link: comment.post ? `/posts/${String(comment.post)}` : null,
        entityType: "comment",
        entityId: targetId,
        dedupe: true,
      });
    }
  }

  return newReact;
};

// Unlike a post or comment
const unlikeFromDB = async (userId: string, targetId: string, type: "post" | "comment", requester?: TRequester): Promise<void> => {
  await assertReactTargetAccess(userId, targetId, type, requester);

  const existingReact = await React.findOneAndDelete({
    user: userId,
    [type]: targetId,
    type: "like",
  });

  if (!existingReact) {
    throw new AppError(httpStatus.BAD_REQUEST, "You haven't liked this item.");
  }

  // Remove the React ID from the likes array of the post/comment
  if (type === "post") {
    await Post.findByIdAndUpdate(targetId, {
      $pull: { likes: userId },
    });
  } else if (type === "comment") {
    await Comment.findByIdAndUpdate(targetId, {
      $pull: { likes: userId },
    });
  }
};

// Dislike a post or comment
const dislikeFromDB = async (userId: string, targetId: string, type: "post" | "comment", requester?: TRequester): Promise<TReact> => {
  await assertReactTargetAccess(userId, targetId, type, requester);

  const existingDislikeReact = await React.findOne({
    user: userId,
    [type]: targetId,
    type: "dislike",
  });

  if (existingDislikeReact) {
    throw new AppError(httpStatus.BAD_REQUEST, "You have already disliked this item.");
  }

  const existingLikeReact = await React.findOneAndDelete({
    user: userId,
    [type]: targetId,
    type: "like",
  });

  if (existingLikeReact) {
    if (type === "post") {
      await Post.findByIdAndUpdate(targetId, {
        $pull: { likes: userId },
      });
    } else if (type === "comment") {
      await Comment.findByIdAndUpdate(targetId, {
        $pull: { likes: userId },
      });
    }
  }

  // Add new dislike
  const newReact = await React.create({
    user: userId,
    [type]: targetId,
    type: "dislike",
  });

  if (type === "post") {
    await Post.findByIdAndUpdate(targetId, {
      $push: { dislikes: userId },
    });
  } else if (type === "comment") {
    await Comment.findByIdAndUpdate(targetId, {
      $push: { dislikes: userId },
    });
  }

  return newReact;
};

// Undislike a post or comment
const undislikeFromDB = async (userId: string, targetId: string, type: "post" | "comment", requester?: TRequester): Promise<void> => {
  await assertReactTargetAccess(userId, targetId, type, requester);

  const existingReact = await React.findOneAndDelete({
    user: userId,
    [type]: targetId,
    type: "dislike",
  });

  if (!existingReact) {
    throw new AppError(httpStatus.BAD_REQUEST, "You haven't disliked this item.");
  }

  if (type === "post") {
    await Post.findByIdAndUpdate(targetId, {
      $pull: { dislikes: userId },
    });
  } else if (type === "comment") {
    await Comment.findByIdAndUpdate(targetId, {
      $pull: { dislikes: userId },
    });
  }
};

/* ------------------------------------------------------------------ */
/* Unified 7-type reaction API                                         */
/* ------------------------------------------------------------------ */

/**
 * Atomically set (create or change) the caller's single reaction on a
 * post / comment / short. One reaction per user per target is enforced by a
 * unique partial index; a concurrent upsert race surfaces as a duplicate-key
 * error and is retried once as an in-place update.
 */
const setReactionFromDB = async (
  userId: string,
  targetType: TReactTargetType,
  targetId: string,
  reaction: TReactionType,
  requester?: TRequester,
): Promise<TReactionSummary> => {
  await assertReactTargetAccess(userId, targetId, targetType, requester);

  const filter = { user: userId, ...targetFilter(targetType, targetId) };
  const update = { $set: { type: reaction } };

  let doc: TReact | null;
  try {
    doc = await React.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
  } catch (error) {
    // Concurrent upsert on the same (user, target) — the loser retries as a
    // plain update of the winner's document.
    const isDuplicate = error instanceof Error && "code" in error && (error as { code?: number }).code === 11000;
    if (!isDuplicate) throw error;
    doc = await React.findOneAndUpdate(filter, update, { new: true });
    if (!doc) throw error;
  }

  // Legacy `likes[]` denormalization for post/comment targets.
  if (targetType !== "short") {
    await syncLegacyLikeArray(targetType, targetId, userId, reaction === "like");
  }

  // Fire-and-forget notification (never throws — reaction still succeeds).
  void (async () => {
    try {
      if (targetType === "post") {
        const post = await Post.findById(targetId).select("user title").lean();
        if (post) {
          await NotificationService.createNotificationIntoDB({
            recipient: String(post.user),
            actor: userId,
            type: "post.reacted",
            title: "Someone reacted to your post",
            body: post.title ?? undefined,
            link: `/posts/${targetId}`,
            entityType: "post",
            entityId: targetId,
            dedupe: true,
          });
        }
      } else if (targetType === "comment") {
        const comment = await Comment.findById(targetId).select("user post").lean();
        if (comment) {
          await NotificationService.createNotificationIntoDB({
            recipient: String(comment.user),
            actor: userId,
            type: "comment.reacted",
            title: "Someone reacted to your comment",
            link: comment.post ? `/posts/${String(comment.post)}` : null,
            entityType: "comment",
            entityId: targetId,
            dedupe: true,
          });
        }
      } else if (targetType === "short") {
        const short = await Short.findById(targetId).select("user").lean();
        if (short) {
          await NotificationService.createNotificationIntoDB({
            recipient: String(short.user),
            actor: userId,
            type: "short.reacted",
            title: "Someone reacted to your Short",
            link: `/shorts/${targetId}`,
            entityType: "short",
            entityId: targetId,
            dedupe: true,
          });
        }
      }
    } catch {
      // Notification failure must never block the reaction response.
    }
  })();

  return getReactionSummary(userId, targetType, targetId, { skipAccessCheck: true });
};

/** Remove the caller's reaction from a target (idempotent-friendly). */
const removeReactionFromDB = async (
  userId: string,
  targetType: TReactTargetType,
  targetId: string,
  requester?: TRequester,
): Promise<TReactionSummary> => {
  await assertReactTargetAccess(userId, targetId, targetType, requester);

  const deleted = await React.findOneAndDelete({
    user: userId,
    ...targetFilter(targetType, targetId),
  });

  if (deleted && targetType !== "short") {
    await syncLegacyLikeArray(targetType, targetId, userId, false);
  }

  return getReactionSummary(userId, targetType, targetId, {
    skipAccessCheck: true,
  });
};

/**
 * Aggregated counts per reaction type plus the caller's own reaction.
 * Counts are computed server-side from indexed documents — clients can never
 * supply or trust counts.
 */
const getReactionSummary = async (
  userId: string,
  targetType: TReactTargetType,
  targetId: string,
  options?: { skipAccessCheck?: boolean; requester?: TRequester },
): Promise<TReactionSummary> => {
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Target not found");
  }
  if (!options?.skipAccessCheck) {
    await assertReactTargetAccess(userId, targetId, targetType, options?.requester);
  }

  const rows = await React.aggregate<{ _id: TReactStoreType; count: number }>([
    // Mongoose does not cast aggregate $match values — build the filter with
    // a real ObjectId so the match actually hits the collection.
    {
      $match: {
        [targetType]: new mongoose.Types.ObjectId(targetId),
      } as unknown as Record<string, unknown>,
    },
    { $group: { _id: "$type", count: { $sum: 1 } } },
  ]);

  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    counts[row._id] = row.count;
    total += row.count;
  }

  const mine = await React.findOne({
    user: userId,
    ...targetFilter(targetType, targetId),
  })
    .select("type")
    .lean();

  return {
    targetType,
    targetId,
    counts,
    total,
    myReaction: (mine?.type as TReactStoreType | undefined) ?? null,
  };
};

export const ReactService = {
  assertReactTargetAccess,
  getAllLikes,
  getAllDisLikes,
  likeFromDB,
  unlikeFromDB,
  dislikeFromDB,
  undislikeFromDB,
  setReactionFromDB,
  removeReactionFromDB,
  getReactionSummary,
  isTargetType,
  isStoreType,
};
