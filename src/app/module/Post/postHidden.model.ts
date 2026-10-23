import { Document, model, Schema, Types } from "mongoose";

export interface IPostHidden extends Document {
  user: Types.ObjectId;
  post: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Per-user "hide from my feed" state. Kept in its own collection so hiding
 * never mutates the original post (other viewers keep seeing it) and so the
 * post document never accumulates an unbounded `hiddenBy` array.
 */
const postHiddenSchema = new Schema<IPostHidden>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    post: { type: Schema.Types.ObjectId, ref: "Post", required: true },
  },
  { timestamps: true },
);

// One hide row per (user, post): repeat requests are idempotent.
postHiddenSchema.index({ user: 1, post: 1 }, { unique: true });
// Feed exclusion lookup: every hidden post for one user.
postHiddenSchema.index({ user: 1 });

export const PostHidden = model<IPostHidden>("PostHidden", postHiddenSchema);
