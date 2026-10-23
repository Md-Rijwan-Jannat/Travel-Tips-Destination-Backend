import { model, Schema } from "mongoose";
import { IShort } from "../Group/group.interface";
import {
  GROUP_MODERATION_STATUS,
  SHORT_AUDIENCE,
  SHORT_STATUS,
} from "../Group/group.constants";

const shortSchema = new Schema<IShort>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Optional owning community group. Group shorts are ONLY visible to
    // current approved members of that group (enforced on every read path).
    group: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 150,
      default: null,
    },
    caption: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    // Video asset URL. Server-validated (https + allowed media host +
    // /video/upload/ resource-type marker for Cloudinary).
    video: {
      type: String,
      required: true,
      trim: true,
    },
    coverImage: {
      type: String,
      default: null,
      trim: true,
    },
    duration: {
      type: Number,
      min: 0,
      default: null,
    },
    location: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },
    hashtags: {
      type: [String],
      default: [],
    },
    audience: {
      type: String,
      enum: Object.values(SHORT_AUDIENCE),
      default: SHORT_AUDIENCE.PUBLIC,
    },
    status: {
      type: String,
      enum: Object.values(SHORT_STATUS),
      default: SHORT_STATUS.PROCESSING,
    },
    moderationStatus: {
      type: String,
      enum: Object.values(GROUP_MODERATION_STATUS),
      default: GROUP_MODERATION_STATUS.APPROVED,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    commentCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    viewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    views: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    reportCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// Hot-path indexes: vertical feed paging (status/createdAt) and the
// group-scoped shorts tab.
shortSchema.index({ status: 1, isDeleted: 1, createdAt: -1 });
shortSchema.index({ group: 1, status: 1, createdAt: -1 });
shortSchema.index({ user: 1, createdAt: -1 });

export const Short = model<IShort>("Short", shortSchema);
