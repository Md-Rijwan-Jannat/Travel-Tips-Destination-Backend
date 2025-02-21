import { Types } from "mongoose";

export interface TReview {
  user: Types.ObjectId;
  quote: string;
  variant: string;
  rating: number;
  createdAt?: Date;
  updatedAt?: Date;
}
