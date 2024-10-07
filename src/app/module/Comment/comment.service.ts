import { IComment } from "./comment.interface";
import { Comment } from "./comment.model";
import AppError from "../../errors/AppError";
import httpStatus from "http-status";
import { User } from "../User/user.model";
import { Post } from "../Post/post.model";
import mongoose from "mongoose";
import QueryBuilder from "../../builder/QueryBuilder";

// Add a comment to the DB
const addCommentIntoDB = async (
  payload: Partial<IComment>,
  userId: string
): Promise<IComment> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userId).session(session);
    const post = await Post.findById(payload.post).session(session);

    if (!user) {
      throw new AppError(httpStatus.NOT_FOUND, "User not found");
    }
    if (!post) {
      throw new AppError(httpStatus.NOT_FOUND, "Post not found");
    }

    // Create the comment
    const comment = await Comment.create([{ ...payload, user: userId }], {
      session,
    });

    await Post.findByIdAndUpdate(
      payload.post,
      {
        $push: { comments: comment[0]._id },
      },
      { session }
    );

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    return comment[0];
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
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
  query: Record<string, any>
): Promise<IComment[]> => {
  const commentQueryBuilder = new QueryBuilder(
    Comment.find({ post: postId, isDeleted: false })
      .populate("user")
      .populate({
        path: "replies",
        populate: {
          path: "user",
        },
      }),
    query
  )
    .sort()
    .fields()
    .filter();

  const comments = await commentQueryBuilder.modelQuery;
  return comments;
};

// Update a comment by ID
const updateCommentIntoDB = async (
  commentId: string,
  updateData: Partial<IComment>
): Promise<IComment | null> => {
  const comment = await Comment.findByIdAndUpdate(commentId, updateData, {
    new: true,
  });
  if (!comment || comment.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Comment not found");
  }
  return comment;
};

// Soft delete a comment by ID
const deleteCommentFromDB = async (
  commentId: string
): Promise<IComment | null> => {
  const comment = await Comment.findByIdAndDelete(commentId);
  if (!comment) {
    throw new AppError(httpStatus.NOT_FOUND, "Comment not found");
  }
  return null;
};
// Reply to a comment
const replyToCommentFromDB = async (
  commentId: string,
  replyData: Partial<IComment>,
  id: string
): Promise<IComment> => {
  const comment = await Comment.findById(commentId);

  if (!comment) {
    throw new AppError(httpStatus.NOT_FOUND, "Comment not found");
  }

  const reply = await Comment.create({ ...replyData, user: id });
  await Comment.findByIdAndUpdate(commentId, { $push: { replies: reply._id } });
  return reply;
};

export const CommentService = {
  addCommentIntoDB,
  getAllCommentFromDB,
  getCommentForPostFromDB,
  updateCommentIntoDB,
  deleteCommentFromDB,
  replyToCommentFromDB,
};
