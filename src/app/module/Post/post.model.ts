import mongoose, { Schema } from "mongoose";
import { TPost } from "./post.interface";
import { POST_STATUS } from "./post.constants";

const postSchema = new Schema<TPost>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    images: {
      type: [String],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    comments: [
      {
        type: Schema.Types.ObjectId,
        ref: "Comment",
      },
    ],
    status: {
      type: String,
      enum: [POST_STATUS.FREE, POST_STATUS.PREMIUM],
    },
    report: [
      {
        type: Schema.Types.ObjectId,
        // ref: "Report",
      },
    ],
    reportCount: {
      type: Number,
      default: 0,
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
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const Post = mongoose.model<TPost>("Post", postSchema);
