import AppError from "../../errors/AppError";
import { TReact } from "./react.interface";
import httpStatus from "http-status";
import { React } from "./react.model";
import { Post } from "../Post/post.model";
import { Comment } from "../Comment/comment.model";

// Like a post or comment
const likeFromDB = async (
  userId: string,
  targetId: string,
  type: "post" | "comment"
): Promise<TReact> => {
  // Check if the user has already liked this post/comment
  const existingLikeReact = await React.findOne({
    user: userId,
    [type]: targetId,
    type: "like",
  });

  // If user already liked, throw an error or return depending on your needs
  if (existingLikeReact) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You have already liked this item."
    );
  }

  // Check if the user has disliked the post/comment before and remove the dislike
  const existingDislikeReact = await React.findOneAndDelete({
    user: userId,
    [type]: targetId,
    type: "dislike",
  });

  if (existingDislikeReact) {
    // Remove the user from the dislikes array of the post/comment
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

  // Push the new React ID to the likes array of the post/comment
  if (type === "post") {
    await Post.findByIdAndUpdate(targetId, {
      $push: { likes: userId },
    });
  } else if (type === "comment") {
    await Comment.findByIdAndUpdate(targetId, {
      $push: { likes: userId },
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
      $pull: { likes: userId },
    });
  } else if (type === "comment") {
    await Comment.findByIdAndUpdate(targetId, {
      $pull: { likes: userId },
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
  const existingDislikeReact = await React.findOne({
    user: userId,
    [type]: targetId,
    type: "dislike",
  });

  // If user already disliked, throw an error or return depending on your needs
  if (existingDislikeReact) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You have already disliked this item."
    );
  }

  // Check if the user has liked the post/comment before and remove the like
  const existingLikeReact = await React.findOneAndDelete({
    user: userId,
    [type]: targetId,
    type: "like",
  });

  if (existingLikeReact) {
    // Remove the user from the likes array of the post/comment
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

  // Push the new React ID to the dislikes array of the post/comment
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
      $pull: { dislikes: userId },
    });
  } else if (type === "comment") {
    await Comment.findByIdAndUpdate(targetId, {
      $pull: { dislikes: userId },
    });
  }
};

export const ReactService = {
  likeFromDB,
  unlikeFromDB,
  dislikeFromDB,
  undislikeFromDB,
};
