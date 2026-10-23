import { model, Schema } from "mongoose";
import { INotification } from "../Group/group.interface";

const notificationSchema = new Schema<INotification>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    actor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    body: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    // Deep link — must always be an app-relative path (authorization is
    // re-checked when the destination is opened).
    link: {
      type: String,
      trim: true,
      default: null,
    },
    entityType: {
      type: String,
      default: null,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Hot-path indexes: inbox listing and unread badge counts.
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, readAt: 1 });
// Deduplication key for retryable operations (optional, sparse).
notificationSchema.index(
  { recipient: 1, type: 1, entityId: 1 },
  { partialFilterExpression: { entityId: { $type: "objectId" } } },
);

export const Notification = model<INotification>("Notification", notificationSchema);
