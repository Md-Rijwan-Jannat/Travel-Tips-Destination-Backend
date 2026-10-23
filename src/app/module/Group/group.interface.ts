import { Document, Types } from "mongoose";
import {
  GROUP_ACTIVITY_ACTION,
  GROUP_CATEGORY,
  GROUP_INVITE_STATUS,
  GROUP_JOIN_POLICY,
  GROUP_MEMBERSHIP_STATUS,
  GROUP_MODERATION_STATUS,
  GROUP_POST_PERMISSION,
  GROUP_ROLE,
  GROUP_VISIBILITY,
  SHORT_AUDIENCE,
  SHORT_STATUS,
} from "./group.constants";

export interface IGroup extends Document {
  name: string;
  slug: string;
  description: string;
  purpose?: string | null;
  category: (typeof GROUP_CATEGORY)[number];
  visibility: (typeof GROUP_VISIBILITY)[keyof typeof GROUP_VISIBILITY];
  image?: string | null;
  coverImage?: string | null;
  location?: string | null;
  rules: string[];
  joinPolicy: (typeof GROUP_JOIN_POLICY)[keyof typeof GROUP_JOIN_POLICY];
  postPermission: (typeof GROUP_POST_PERMISSION)[keyof typeof GROUP_POST_PERMISSION];
  postApprovalEnabled: boolean;
  chatEnabled: boolean;
  notifyOnNewPost: boolean;
  owner: Types.ObjectId;
  chat?: Types.ObjectId | null;
  memberCount: number;
  pendingCount: number;
  bannedUsers: Types.ObjectId[];
  mutedUsers: Types.ObjectId[];
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGroupMembership extends Document {
  group: Types.ObjectId;
  user: Types.ObjectId;
  role: (typeof GROUP_ROLE)[keyof typeof GROUP_ROLE];
  status: (typeof GROUP_MEMBERSHIP_STATUS)[keyof typeof GROUP_MEMBERSHIP_STATUS];
  joinedAt?: Date | null;
  requestedAt?: Date | null;
  reviewedBy?: Types.ObjectId | null;
  reviewedAt?: Date | null;
  bannedBy?: Types.ObjectId | null;
  bannedAt?: Date | null;
  mutedNotifications?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGroupInvite extends Document {
  group: Types.ObjectId;
  tokenHash: string;
  createdBy: Types.ObjectId;
  label?: string | null;
  status: (typeof GROUP_INVITE_STATUS)[keyof typeof GROUP_INVITE_STATUS];
  maxUses?: number | null;
  usedCount: number;
  requiresApproval: boolean;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  revokedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGroupActivityLog extends Document {
  group: Types.ObjectId;
  actor: Types.ObjectId;
  action: (typeof GROUP_ACTIVITY_ACTION)[keyof typeof GROUP_ACTIVITY_ACTION];
  targetType?: string;
  targetId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IShort extends Document {
  user: Types.ObjectId;
  group?: Types.ObjectId | null;
  title?: string | null;
  caption?: string | null;
  video: string;
  coverImage?: string | null;
  duration?: number | null;
  location?: string | null;
  hashtags: string[];
  audience: (typeof SHORT_AUDIENCE)[keyof typeof SHORT_AUDIENCE];
  status: (typeof SHORT_STATUS)[keyof typeof SHORT_STATUS];
  moderationStatus: (typeof GROUP_MODERATION_STATUS)[keyof typeof GROUP_MODERATION_STATUS];
  rejectionReason?: string | null;
  likes: Types.ObjectId[];
  commentCount: number;
  viewCount: number;
  views: Types.ObjectId[];
  reportCount: number;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotification extends Document {
  recipient: Types.ObjectId;
  actor?: Types.ObjectId | null;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: Types.ObjectId | null;
  groupId?: Types.ObjectId | null;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TRequester = { id: string; role: string };
