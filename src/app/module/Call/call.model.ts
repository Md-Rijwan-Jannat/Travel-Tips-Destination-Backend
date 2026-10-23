import { model, Schema } from "mongoose";
import {
  ICall,
  CALL_MEDIA_TYPE_VALUES,
  CALL_STATUS,
  CALL_STATUS_VALUES,
} from "./call.interface";

const callSchema = new Schema<ICall>(
  {
    chat: { type: Schema.Types.ObjectId, ref: "Chat", required: true },
    caller: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // DM only — group calls have no single callee.
    callee: { type: Schema.Types.ObjectId, ref: "User", default: null },
    isGroupCall: { type: Boolean, default: false },
    // Live mesh roster (starter from invite; acceptors as they join).
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    mediaType: {
      type: String,
      enum: [...CALL_MEDIA_TYPE_VALUES],
      required: true,
    },
    status: {
      type: String,
      enum: [...CALL_STATUS_VALUES],
      default: CALL_STATUS.RINGING,
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    answeredAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Call history is always per chat / per participant, newest first.
callSchema.index({ chat: 1, createdAt: -1 });
callSchema.index({ caller: 1, createdAt: -1 });
callSchema.index({ callee: 1, createdAt: -1 });

export const Call = model<ICall>("Call", callSchema);
