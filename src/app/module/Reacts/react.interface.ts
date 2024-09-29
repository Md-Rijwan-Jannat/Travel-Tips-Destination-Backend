import { Types } from "mongoose";

export interface TReact {
  user: Types.ObjectId;
  post?: string;
  comment?: string;
  type: "like" | "dislike";
  createdAt: Date;
  updatedAt: Date;
}
