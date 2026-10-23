import mongoose, { Schema } from "mongoose";
import { IComment } from "./comment.interface";

const commentSchema = new Schema<IComment>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Either a post OR a short (shorts reuse the comment/reply system so
    // comment logic is not duplicated).
    post: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      default: null,
    },
    short: {
      type: Schema.Types.ObjectId,
      ref: "Short",
      default: null,
    },
    text: {
      type: String,
      required: true,
    },
    images: {
      type: [String],
    },
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    dislikes: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    replies: [
      {
        type: Schema.Types.ObjectId,
        ref: "Comment",
      },
    ],
    parentComment: {
      type: Schema.Types.ObjectId,
      ref: "Comment",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Hot-path index: comment lists are always fetched per post / per short.
commentSchema.index({ post: 1 });
commentSchema.index({ short: 1 });
// Thread lookups: children of a (possibly soft-deleted) parent comment.
commentSchema.index({ parentComment: 1 });

export const Comment = mongoose.model<IComment>("Comment", commentSchema);
