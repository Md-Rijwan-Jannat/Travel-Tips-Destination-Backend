import { Document, Types } from "mongoose";

export interface IComment extends Document {
  user: Types.ObjectId;
  post: Types.ObjectId;
  text: string;
  images?: string[];
  likes: Types.ObjectId[];
  dislikes: Types.ObjectId[];
  replies: Types.ObjectId[];
  parentComment?: Types.ObjectId;
  isDeleted: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
