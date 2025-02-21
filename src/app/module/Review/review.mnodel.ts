import mongoose, { Schema } from "mongoose";
import { TReview } from "./review.interface";

const ReviewSchema: Schema = new Schema<TReview>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    quote: { type: String, required: true, maxlength: 500 },
    variant: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
  },
  { timestamps: true }
);

export const Review = mongoose.model<TReview>("Review", ReviewSchema);
