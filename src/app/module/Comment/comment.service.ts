import { IComment } from "./comment.interface";
import { Comment } from "./comment.model";
import AppError from "../../errors/AppError";
import httpStatus from "http-status";
import { User } from "../User/user.model";
import { Post } from "../Post/post.model";
import mongoose from "mongoose";
import QueryBuilder from "../../builder/QueryBuilder";
import { assertCanInteractWithPost, assertCanViewPost } from "../Post/postAccess";
import { Short } from "../Short/short.model";
import { ShortService } from "../Short/short.service";

type TRequester = { id: string; role: string };

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
const addCommentIntoDB = async (
  payload: Partial<IComment>,
  userId: string,
  requester?: TRequester,
): Promise<IComment> => {
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

      await Post.findByIdAndUpdate(
        payload.post,
        { $push: { comments: comment[0]._id } },
        { session },
      );

      await session.commitTransaction();
      session.endSession();
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

const getCommentForPostFromDB = async (
  postId: string,
  query: Record<string, unknown>,
  requester?: TRequester,
): Promise<IComment[]> => {
  if (requester) {
    const post = await Post.findById(postId);
    if (post) {
      await assertCanViewPost(post, requester);
    }
  }

  const commentQueryBuilder = new QueryBuilder(
    Comment.find({ post: postId, isDeleted: false })
      .populate("user")
      .populate({
        path: "replies",
        populate: {
          path: "user",
        },
      }),
    query,
  )
    .sort()
    .fields()
    .filter();

  const comments = await commentQueryBuilder.modelQuery;
  return comments;
};

const getCommentsForShortFromDB = async (
  shortId: string,
  query: Record<string, unknown>,
  requester: TRequester,
): Promise<IComment[]> => {
  if (!mongoose.Types.ObjectId.isValid(shortId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Post not found");
  }
  const short = await Short.findById(shortId);
  if (!short) throw new AppError(httpStatus.NOT_FOUND, "Post not found");
  await ShortService.assertCanViewShort(short, requester);

  const commentQueryBuilder = new QueryBuilder(
    Comment.find({ short: shortId, isDeleted: false })
      .populate("user")
      .populate({
        path: "replies",
        populate: { path: "user" },
      }),
    query,
  )
    .sort()
    .fields()
    .filter();

  return commentQueryBuilder.modelQuery;
};

type TRequesterShape = TRequester;

const assertCanModifyComment = (
  comment: { user: unknown },
  requester: TRequesterShape,
) => {
  const isOwner = String(comment.user) === requester.id;
  if (!isOwner && requester.role !== "ADMIN") {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not allowed to modify this comment",
    );
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

  const comment = await Comment.findByIdAndUpdate(commentId, updateData, {
    new: true,
  });
  if (!comment || comment.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Comment not found");
  }
  return comment;
};

// Delete a comment by ID (owner or admin only)
const deleteCommentFromDB = async (
  commentId: string,
  requester: TRequesterShape,
): Promise<IComment | null> => {
  const existing = await Comment.findById(commentId);
  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, "Comment not found");
  }
  assertCanModifyComment(existing, requester);

  if (existing.short) {
    await Short.updateOne({ _id: existing.short }, { $inc: { commentCount: -1 } });
  }

  const comment = await Comment.findByIdAndDelete(commentId);
  if (!comment) {
    throw new AppError(httpStatus.NOT_FOUND, "Comment not found");
  }
  return null;
};

// Reply to a comment (target is inherited from the parent so a reply can
// never be attached to a different post/short than its parent).
const replyToCommentFromDB = async (
  commentId: string,
  replyData: Partial<IComment>,
  id: string,
  requester?: TRequester,
): Promise<IComment> => {
  const comment = await Comment.findById(commentId);
  if (!comment) {
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
