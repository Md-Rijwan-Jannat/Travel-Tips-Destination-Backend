import { IComment } from "./comment.interface";
import { Comment } from "./comment.model";
import AppError from "../../errors/AppError";
import httpStatus from "http-status";
import { User } from "../User/user.model";

// Add a comment to the DB
const addCommentIntoDB = async (
  payload: Partial<IComment>,
  email: string
): Promise<IComment> => {
  const user = await User.findOne({ email });
  const post = await User.findById(payload.post);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  if (!post) {
    throw new AppError(httpStatus.NOT_FOUND, "Post not found");
  }

  const comment = await Comment.create(payload);
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

// Like a comment
const likeCommentFromDB = async (
  commentId: string
): Promise<IComment | null> => {
  const comment = await Comment.findByIdAndUpdate(
    commentId,
    { $inc: { likes: 1 } },
    { new: true }
  );
  if (!comment || comment.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Comment not found");
  }
  return comment;
};

// Dislike a comment
const dislikeCommentFromDB = async (
  commentId: string
): Promise<IComment | null> => {
  const comment = await Comment.findByIdAndUpdate(
    commentId,
    { $inc: { dislikes: 1 } },
    { new: true }
  );
  if (!comment || comment.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Comment not found");
  }
  return comment;
};

// Reply to a comment
const replyToCommentFromDB = async (
  commentId: string,
  replyData: Partial<IComment>
): Promise<IComment> => {
  const reply = await Comment.create(replyData);
  await Comment.findByIdAndUpdate(commentId, { $push: { replies: reply._id } });
  return reply;
};

export const CommentService = {
  addCommentIntoDB,
  getCommentForPostFromDB,
  updateCommentIntoDB,
  deleteCommentFromDB,
  likeCommentFromDB,
  dislikeCommentFromDB,
  replyToCommentFromDB,
};
