import AppError from "../../errors/AppError";
import { TReact } from "./react.interface";
import httpStatus from "http-status";
import { React } from "./react.model";
import { Post } from "../Post/post.model";
import { Comment } from "../Comment/comment.model";

// Utility to get model based on type
const getTargetModel = (type: "post" | "comment") => {
  return type === "post" ? Post : Comment;
};

// Like a post or comment
const likeFromDB = async (
  userId: string,
  targetId: string,
  type: "post" | "comment"
): Promise<TReact> => {
  // Check if the user has already liked this post/comment
  const existingReact = await React.findOne({
    user: userId,
    [type]: targetId,
    type: "like",
  });

  if (existingReact) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You have already liked this item."
    );
  }

  // Remove any existing dislike if present
  await React.findOneAndDelete({
    user: userId,
    [type]: targetId,
    type: "dislike",
  });

  // Add new like
  const newReact = await React.create({
    user: userId,
    [type]: targetId,
    type: "like",
  });

  // Push the new React ID to the likes array of the post/comment
  if (type === "post") {
    await Post.findByIdAndUpdate(targetId, {
      $push: { likes: newReact._id },
    });
  }
  if (type === "comment") {
    await Comment.findByIdAndUpdate(targetId, {
      $push: { likes: newReact._id },
    });
  }

  return newReact;
};

// Unlike a post or comment
const unlikeFromDB = async (
  userId: string,
  targetId: string,
  type: "post" | "comment"
): Promise<void> => {
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
      $pull: { likes: existingReact._id },
    });
  }
  if (type === "comment") {
    await Comment.findByIdAndUpdate(targetId, {
      $pull: { likes: existingReact._id },
    });
  }
};

// Dislike a post or comment
const dislikeFromDB = async (
  userId: string,
  targetId: string,
  type: "post" | "comment"
): Promise<TReact> => {
  // Check if the user has already disliked this post/comment
  const existingReact = await React.findOne({
    user: userId,
    [type]: targetId,
    type: "dislike",
  });

  if (existingReact) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You have already disliked this item."
    );
  }

  // Remove any existing like if present
  await React.findOneAndDelete({
    user: userId,
    [type]: targetId,
    type: "like",
  });

  // Add new dislike
  const newReact = await React.create({
    user: userId,
    [type]: targetId,
    type: "dislike",
  });

  // Push the new React ID to the dislikes array of the post/comment
  if (type === "post") {
    await Post.findByIdAndUpdate(targetId, {
      $push: { dislikes: newReact._id },
    });
  }
  if (type === "comment") {
    await Comment.findByIdAndUpdate(targetId, {
      $push: { dislikes: newReact._id },
    });
  }

  return newReact;
};

// Undislike a post or comment
const undislikeFromDB = async (
  userId: string,
  targetId: string,
  type: "post" | "comment"
): Promise<void> => {
  const existingReact = await React.findOneAndDelete({
    user: userId,
    [type]: targetId,
    type: "dislike",
  });

  if (!existingReact) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You haven't disliked this item."
    );
  }

  // Remove the React ID from the dislikes array of the post/comment
  if (type === "post") {
    await Post.findByIdAndUpdate(targetId, {
      $pull: { dislikes: existingReact._id },
    });
  }
  if (type === "comment") {
    await Comment.findByIdAndUpdate(targetId, {
      $pull: { dislikes: existingReact._id },
    });
  }
};

export const ReactService = {
  likeFromDB,
  unlikeFromDB,
  dislikeFromDB,
  undislikeFromDB,
};
