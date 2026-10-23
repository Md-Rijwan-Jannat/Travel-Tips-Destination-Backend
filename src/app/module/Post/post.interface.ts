import { Document, Types } from "mongoose";
import {
  POST_STATUS,
  TCommentHighlightMode,
  TCommentSortMode,
  TMediaLayout,
} from "./post.constants";

export type TCategoryType =
  | "Adventure"
  | "Exploration"
  | "Business Travel"
  | "Other"
  | "Culture"
  | "Wildlife"
  | "Beaches"
  | "Mountaineering"
  | "Sports"
  | "Road Trip"
  | "City Tours"
  | "Photography";

export interface TCommentSettings {
  /** Owner's default ordering for the comment list. */
  sortMode: TCommentSortMode;
  /** How the featured comment is chosen. */
  highlightMode: TCommentHighlightMode;
  /** Owner's manual featured comment (null in AUTO mode). */
  highlightedComment: Types.ObjectId | null;
}

export interface TPost extends Document {
  user: Types.ObjectId;
  images: string[];
  title: string;
  description: string;
  comments?: Types.ObjectId[];
  category: TCategoryType;
  status: TPostStatus;
  report?: Types.ObjectId[];
  reportCount: number;
  likes: Types.ObjectId[];
  dislikes: Types.ObjectId[];
  isDeleted: boolean;
  location?: string | null;
  tags?: string[];
  group?: Types.ObjectId | null;
  groupVisibility?: "PUBLIC" | "PRIVATE" | null;
  moderationStatus?: "PENDING" | "APPROVED" | "REJECTED" | "REMOVED";
  moderationReason?: string | null;
  moderatedBy?: Types.ObjectId | null;
  moderatedAt?: Date | null;
  /** Author-selected multi-image grid layout (AUTO = renderer decides). */
  mediaLayout?: TMediaLayout;
  /** Edited marker for the caption/media. */
  isEdited?: boolean;
  editedAt?: Date | null;
  /** Pinned to the author's profile — at most ONE per author. */
  pinned?: boolean;
  pinnedAt?: Date | null;
  /** Featured on the author's profile — at most ONE per author. */
  featured?: boolean;
  featuredAt?: Date | null;
  /** Pinned inside its community group (group staff action). */
  groupPinnedAt?: Date | null;
  /** Comment ordering + featured-comment settings owned by the author. */
  commentSettings?: TCommentSettings;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TReport {
  user: Types.ObjectId;
  post: Types.ObjectId;
  report: string;
}

export interface QueryObj {
  isDeleted: boolean;
  status: string;
  category?: { $in: string[] };
  group?: unknown;
  $or?: unknown;
  $and?: unknown;
  moderationStatus?: unknown;
  _id?: { $nin: Types.ObjectId[] };
}

export type TPostStatus = keyof typeof POST_STATUS;
