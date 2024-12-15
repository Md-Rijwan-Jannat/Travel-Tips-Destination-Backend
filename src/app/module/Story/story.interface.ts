import mongoose, { Schema, Document } from 'mongoose';

export interface TStory extends Document {
  user: mongoose.Types.ObjectId;
  media: string; // URL to image/video
  createdAt: Date;
  expiresAt: Date;
  views: mongoose.Types.ObjectId[]; // Array of user IDs who viewed the story
  reactions: {
    userId: mongoose.Types.ObjectId;
    type: string; // e.g., "like", "love", etc.
  }[];
}
