import { IComment } from "./comment.interface";
import { Comment } from "./comment.model";
import AppError from "../../errors/AppError";
import httpStatus from "http-status";
import { User } from "../User/user.model";
import { Post } from "../Post/post.model";

// Add a comment to the DB
const addCommentIntoDB = async (
  payload: Partial<IComment>,
  id: string
): Promise<IComment> => {
  const user = await User.findById(id);
  const post = await Post.findById(payload.post);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  if (!post) {
    throw new AppError(httpStatus.NOT_FOUND, "Post not found");
  }

  const comment = await Comment.create({ ...payload, user: id });
  return comment;
};

// Get all comments for a post
const getCommentForPostFromDB = async (postId: string): Promise<IComment[]> => {
  const comments = await Comment.find({ post: postId, isDeleted: false })
    .populate("user")
    .populate({
      path: "replies",
      populate: {
        path: "user",
      },
    });
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
  getCommentForPostFromDB,
  updateCommentIntoDB,
  deleteCommentFromDB,
  replyToCommentFromDB,
};