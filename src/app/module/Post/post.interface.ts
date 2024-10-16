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
}

export type TPostStatus = keyof typeof POST_STATUS;
