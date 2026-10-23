import mongoose, { Schema } from "mongoose";
import { REACT_STORE_TYPES, TReact } from "./react.interface";

const reactSchema = new Schema<TReact>(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
    comment: { type: mongoose.Schema.Types.ObjectId, ref: "Comment" },
    short: { type: mongoose.Schema.Types.ObjectId, ref: "Short" },
    type: { type: String, enum: REACT_STORE_TYPES, required: true },
  },
  { timestamps: true },
);

// Uniqueness: at most one reaction per user per target (partial indexes —
// only rows where the field exists participate, so a react is bound to
// exactly one target kind). These constraints make concurrent duplicate
// reactions impossible at the database level.
reactSchema.index(
  { user: 1, post: 1 },
  { unique: true, partialFilterExpression: { post: { $type: "objectId" } } },
);
reactSchema.index(
  { user: 1, comment: 1 },
  { unique: true, partialFilterExpression: { comment: { $type: "objectId" } } },
);
reactSchema.index(
  { user: 1, short: 1 },
  { unique: true, partialFilterExpression: { short: { $type: "objectId" } } },
);
// Summary aggregation hot path: counts by type for one target.
reactSchema.index({ post: 1, type: 1 });
reactSchema.index({ comment: 1, type: 1 });
reactSchema.index({ short: 1, type: 1 });

export const React = mongoose.model<TReact>("React", reactSchema);
