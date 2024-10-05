import mongoose, { Schema } from "mongoose";
import { TPost } from "./post.interface";
import { CategoryEnum, POST_STATUS } from "./post.constants";

// Report Schema
const reportSchema = new Schema(
  {
    report: {
      type: String,
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    post: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Post Schema
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
    category: {
      type: String,
      enum: CategoryEnum,
      required: true,
    },
    status: {
      type: String,
      enum: [POST_STATUS.FREE, POST_STATUS.PREMIUM],
    },
    report: [reportSchema],
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
  },
);

export const Post = mongoose.model<TPost>("Post", postSchema);
