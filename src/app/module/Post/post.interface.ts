import { Document, Types } from "mongoose";
import { POST_STATUS } from "./post.constants";

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
}

export type TPostStatus = keyof typeof POST_STATUS;
