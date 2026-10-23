import { model, Schema } from "mongoose";
import { IMessage } from "../Messages/message.interface";

const messageSchema = new Schema<IMessage>(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    content: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
    chat: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
    },
    readBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true },
);

// Hot-path index: message history is always fetched per chat.
messageSchema.index({ chat: 1 });

export const Message = model<IMessage>("Message", messageSchema);
