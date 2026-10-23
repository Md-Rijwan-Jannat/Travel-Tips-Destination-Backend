import { model, Schema } from "mongoose";
import { IGroupMembership } from "./group.interface";
import { GROUP_MEMBERSHIP_STATUS, GROUP_ROLE } from "./group.constants";

const groupMembershipSchema = new Schema<IGroupMembership>(
  {
    group: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(GROUP_ROLE),
      default: GROUP_ROLE.MEMBER,
    },
    status: {
      type: String,
      enum: Object.values(GROUP_MEMBERSHIP_STATUS),
      default: GROUP_MEMBERSHIP_STATUS.NONE,
    },
    joinedAt: {
      type: Date,
      default: null,
    },
    requestedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    bannedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    bannedAt: {
      type: Date,
      default: null,
    },
    // Per-member notification preference for this group (new posts + chat
    // activity). Independent from the platform-wide mute (mutedUsers).
    mutedNotifications: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// Uniqueness: one membership row per (group, user) — authoritative
// guard against duplicate joins under concurrent requests.
groupMembershipSchema.index({ group: 1, user: 1 }, { unique: true });
// Hot-path index: pending-request queue and member lists.
groupMembershipSchema.index({ group: 1, status: 1 });
groupMembershipSchema.index({ user: 1, status: 1 });

export const GroupMembership = model<IGroupMembership>(
  "GroupMembership",
  groupMembershipSchema,
);
