import mongoose, { Schema, Document } from "mongoose";
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

export const React = mongoose.model<TReact>("React", reactSchema);
