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
  }
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
    location: {
      type: String,
      default: null,
      trim: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    group: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    groupVisibility: {
      type: String,
      enum: ["PUBLIC", "PRIVATE", null],
      default: null,
    },
    moderationStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "REMOVED"],
      default: "APPROVED",
    },
    moderationReason: {
      type: String,
      default: null,
    },
    moderatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    moderatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Hot-path indexes: feed/profile lookups by author and by
// (status, isDeleted) feed filters.
postSchema.index({ user: 1 });
postSchema.index({ status: 1, isDeleted: 1 });
// Community: group feed + moderation queue + global-feed privacy filter.
postSchema.index({ group: 1, moderationStatus: 1, createdAt: -1 });
postSchema.index({ group: 1, reportCount: -1 });
postSchema.index({ groupVisibility: 1, moderationStatus: 1 });

export const Post = mongoose.model<TPost>("Post", postSchema);
