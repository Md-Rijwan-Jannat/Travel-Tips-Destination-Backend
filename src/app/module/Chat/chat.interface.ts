import { Document, Types } from "mongoose";

export interface IChat extends Document {
  chatName: string;
  user: Types.ObjectId;
  isGroupChat: boolean;
  users: Types.ObjectId[];
  latestMessage: Types.ObjectId;
  groupAdmin: Types.ObjectId;
  groupCommunity?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}
