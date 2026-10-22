import mongoose, { Schema } from "mongoose";
import { TReact } from "./react.interface";

const reactSchema = new Schema<TReact>(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
    comment: { type: mongoose.Schema.Types.ObjectId, ref: "Comment" },
    type: { type: String, enum: ["like", "dislike"], required: true },
  },
  { timestamps: true },
);

// Uniqueness: at most one reaction per user per post, and one per user per
// comment (partial indexes — only rows where the field exists participate,
// so a react is either post-bound or comment-bound, never colliding).
reactSchema.index(
  { user: 1, post: 1 },
  { unique: true, partialFilterExpression: { post: { $type: "objectId" } } },
);
reactSchema.index(
  { user: 1, comment: 1 },
  { unique: true, partialFilterExpression: { comment: { $type: "objectId" } } },
);

export const React = mongoose.model<TReact>("React", reactSchema);
