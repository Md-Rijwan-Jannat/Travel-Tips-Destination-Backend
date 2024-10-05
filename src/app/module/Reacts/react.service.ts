import AppError from "../../errors/AppError";
import { TReact } from "./react.interface";
import httpStatus from "http-status";
import { React } from "./react.model";
import { Post } from "../Post/post.model";
import { Comment } from "../Comment/comment.model";

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

// Like a post or comment
const likeFromDB = async (
  userId: string,
  targetId: string,
  type: "post" | "comment",
): Promise<TReact> => {
  const existingLikeReact = await React.findOne({
    user: userId,
    [type]: targetId,
    type: "like",
  });

  if (existingLikeReact) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You have already liked this item.",
    );
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
  type: "post" | "comment",
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
  type: "post" | "comment",
): Promise<TReact> => {
  const existingDislikeReact = await React.findOne({
    user: userId,
    [type]: targetId,
    type: "dislike",
  });

  if (existingDislikeReact) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You have already disliked this item.",
    );
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
const undislikeFromDB = async (
  userId: string,
  targetId: string,
  type: "post" | "comment",
): Promise<void> => {
  const existingReact = await React.findOneAndDelete({
    user: userId,
    [type]: targetId,
    type: "dislike",
  });

  if (!existingReact) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You haven't disliked this item.",
    );
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

export const ReactService = {
  getAllLikes,
  getAllDisLikes,
  likeFromDB,
  unlikeFromDB,
  dislikeFromDB,
  undislikeFromDB,
};
