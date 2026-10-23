import { model, Schema } from "mongoose";
import { IChat } from "../Chat/chat.interface";

const chatSchema = new Schema<IChat>(
  {
    chatName: {
      type: String,
      trim: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    isGroupChat: {
      type: Boolean,
      default: false,
    },
    users: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    latestMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    groupAdmin: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    // Link to the community Group this conversation belongs to (null/absent
    // for classic DMs and user-created Messenger group chats). The unique
    // sparse index guarantees exactly ONE conversation per community group.
    groupCommunity: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
  },
  { timestamps: true },
);

// Hot-path index: chat lookups by membership (`users` contains the caller).
chatSchema.index({ users: 1 });
// Uniqueness: one Messenger conversation per community group, even under
// concurrent "open chat" requests. Sparse so DMs are unaffected.
chatSchema.index(
  { groupCommunity: 1 },
  { unique: true, sparse: true, partialFilterExpression: { groupCommunity: { $type: "objectId" } } },
);

export const Chat = model<IChat>("Chat", chatSchema);
