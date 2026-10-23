import { model, Schema } from "mongoose";
import { IGroupActivityLog } from "./group.interface";
import { GROUP_ACTIVITY_ACTION } from "./group.constants";

// Append-only moderation/management audit trail. Never store secrets,
// tokens, passwords, or OTP material here.
const groupActivityLogSchema = new Schema<IGroupActivityLog>(
  {
    group: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    actor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      enum: Object.values(GROUP_ACTIVITY_ACTION),
      required: true,
    },
    targetType: {
      type: String,
      default: null,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

groupActivityLogSchema.index({ group: 1, createdAt: -1 });

export const GroupActivityLog = model<IGroupActivityLog>(
  "GroupActivityLog",
  groupActivityLogSchema,
);
