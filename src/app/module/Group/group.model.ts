import { model, Schema } from "mongoose";
import { IGroup } from "./group.interface";
import {
  GROUP_CATEGORY,
  GROUP_JOIN_POLICY,
  GROUP_POST_PERMISSION,
  GROUP_VISIBILITY,
} from "./group.constants";

const groupSchema = new Schema<IGroup>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    purpose: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
    },
    category: {
      type: String,
      enum: GROUP_CATEGORY,
      required: true,
    },
    visibility: {
      type: String,
      enum: Object.values(GROUP_VISIBILITY),
      default: GROUP_VISIBILITY.PUBLIC,
    },
    image: {
      type: String,
      default: null,
    },
    coverImage: {
      type: String,
      default: null,
    },
    location: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },
    rules: {
      type: [String],
      default: [],
    },
    joinPolicy: {
      type: String,
      enum: Object.values(GROUP_JOIN_POLICY),
      default: GROUP_JOIN_POLICY.OPEN,
    },
    postPermission: {
      type: String,
      enum: Object.values(GROUP_POST_PERMISSION),
      default: GROUP_POST_PERMISSION.ALL_MEMBERS,
    },
    // Default OFF: members publish immediately unless staff opt into approval.
    postApprovalEnabled: {
      type: Boolean,
      default: false,
    },
    // Group-conversation messaging switch (applied to the linked Messenger
    // conversation for sends — reads stay available to members).
    chatEnabled: {
      type: Boolean,
      default: true,
    },
    // Group-level notification preference for new feed posts.
    notifyOnNewPost: {
      type: Boolean,
      default: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    chat: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
      default: null,
    },
    memberCount: {
      type: Number,
      default: 1,
      min: 0,
    },
    pendingCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    bannedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    mutedUsers: [
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
  { timestamps: true },
);

// Hot-path indexes: discovery filters, membership lookups by owner.
groupSchema.index({ visibility: 1, isDeleted: 1, memberCount: -1 });
groupSchema.index({ category: 1, isDeleted: 1 });
groupSchema.index({ owner: 1 });

export const Group = model<IGroup>("Group", groupSchema);
