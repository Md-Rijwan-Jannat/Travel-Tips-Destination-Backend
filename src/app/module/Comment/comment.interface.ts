import { Document, Types } from "mongoose";

export interface IComment extends Document {
  user: Types.ObjectId;
  post?: Types.ObjectId | null;
  short?: Types.ObjectId | null;
  text: string;
  images?: string[];
  likes: Types.ObjectId[];
  dislikes: Types.ObjectId[];
  replies: Types.ObjectId[];
  parentComment?: Types.ObjectId;
  isDeleted: boolean;
  /** Set when the author edits their comment (shown as "Edited"). */
  editedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}
