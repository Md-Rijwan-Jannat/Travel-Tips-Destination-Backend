import mongoose, { Schema } from 'mongoose';
import { TStory } from './story.interface';

const storySchema = new Schema<TStory>({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  media: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  views: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  reactions: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      type: { type: String, enum: ['like', 'love', 'laugh', 'sad', 'angry'] },
    },
  ],
});

export const Story = mongoose.model<TStory>('Story', storySchema);
