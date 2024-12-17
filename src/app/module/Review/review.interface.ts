import { Types } from 'mongoose';

export interface TReview {
  user: Types.ObjectId;
  content: string;
  rating: number;
  createdAt?: Date;
  updatedAt?: Date;
}
