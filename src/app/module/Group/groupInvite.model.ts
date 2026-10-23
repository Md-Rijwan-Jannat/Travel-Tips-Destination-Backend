import { createHash, randomBytes } from "crypto";
import { model, Schema } from "mongoose";
import { IGroupInvite } from "./group.interface";
import { GROUP_INVITE_STATUS } from "./group.constants";

// Cryptographically secure, unguessable invite token (256 bits). Only the
// SHA-256 hash is persisted — a DB leak cannot replay invitations.
export const generateInviteToken = (): string =>
  randomBytes(32).toString("base64url");

export const hashInviteToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const groupInviteSchema = new Schema<IGroupInvite>(
  {
    group: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    label: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(GROUP_INVITE_STATUS),
      default: GROUP_INVITE_STATUS.ACTIVE,
    },
    maxUses: {
      type: Number,
      min: 1,
      default: null,
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    requiresApproval: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// Hot-path index: redeem lookups by group for admin listings.
groupInviteSchema.index({ group: 1, status: 1 });

export const GroupInvite = model<IGroupInvite>("GroupInvite", groupInviteSchema);
