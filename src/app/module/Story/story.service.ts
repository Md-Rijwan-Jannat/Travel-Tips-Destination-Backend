import { Types } from 'mongoose';
import AppError from '../../errors/AppError';
import { User } from '../User/user.model';
import { Story } from './story.model';
import httpStatus from 'http-status';

const createStory = async (payload: { user: string; media: string }) => {
  const { user, media } = payload;

  const isUserExists = await User.findById(user);

  if (!isUserExists) throw new AppError(httpStatus.NOT_FOUND, 'User Not Found');

  // Create a story with 24-hour expiration
  const story = await Story.create({
    user,
    media,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours later
  });

  return story;
};

const getUserStories = async (userId: string) => {
  const stories = await Story.find({
    user: userId,
    expiresAt: { $gte: new Date() },
  })
    .sort({ createdAt: -1 })
    .populate('user', '_id name image email verified bio');

  return stories;
};

const getAllUserStories = async () => {
  const stories = await Story.aggregate([
    {
      $match: {
        expiresAt: { $gte: new Date() }, // Only include non-expired stories
      },
    },
    {
      $lookup: {
        from: 'users', // Populate user details for the story owner
        localField: 'user',
        foreignField: '_id',
        as: 'userDetails',
      },
    },
    {
      $unwind: '$userDetails', // Deconstruct the userDetails array
    },
    // Populate reactions.userId
    {
      $lookup: {
        from: 'users',
        localField: 'reactions.userId',
        foreignField: '_id',
        as: 'reactionUserDetails',
      },
    },
    // Populate views (user IDs in the views array)
    {
      $lookup: {
        from: 'users',
        localField: 'views',
        foreignField: '_id',
        as: 'viewUserDetails',
      },
    },
    {
      $group: {
        _id: '$user', // Group by user ID
        userDetails: { $first: '$userDetails' }, // Include unique user details
        stories: {
          $push: {
            _id: '$_id',
            media: '$media',
            createdAt: '$createdAt',
            expiresAt: '$expiresAt',
            reactions: {
              $map: {
                input: '$reactions',
                as: 'reaction',
                in: {
                  type: '$$reaction.type',
                  user: {
                    $arrayElemAt: [
                      '$reactionUserDetails',
                      {
                        $indexOfArray: [
                          '$reactions.userId',
                          '$$reaction.userId',
                        ],
                      },
                    ],
                  },
                },
              },
            },
            views: '$viewUserDetails', // Populated views array
          },
        },
      },
    },
    {
      $project: {
        _id: 0, // Exclude the group _id from the result
        user: {
          _id: '$userDetails._id',
          name: '$userDetails.name',
          image: '$userDetails.image',
          email: '$userDetails.email',
          verified: '$userDetails.verified',
          bio: '$userDetails.bio',
        },
        stories: 1, // Include the grouped stories
      },
    },
  ]);

  // Return an empty array instead of throwing an error
  return stories || [];
};

const getSingleStories = async (storyId: string) => {
  const stories = await Story.findById(storyId)
    .sort({ createdAt: -1 })
    .populate('user', '_id name image email verified bio');

  return stories;
};

const updateStory = async (
  storyId: string,
  payload: { media?: string; expiresAt?: Date }
) => {
  const updatedStory = await Story.findByIdAndUpdate(
    storyId,
    { ...payload },
    { new: true }
  );

  if (!updatedStory) {
    throw new Error('Story not found');
  }

  return updatedStory;
};

const addView = async (storyId: string, userId: string) => {
  const userObjectId = new Types.ObjectId(userId);

  const story = await Story.findById(storyId);
  if (!story) {
    throw new AppError(httpStatus.NOT_FOUND, 'Story Not Found');
  }

  // Check if the user has already viewed the story
  const hasViewed = story.views.includes(userObjectId);
  if (hasViewed) {
    throw new AppError(
      httpStatus.CONFLICT,
      'User has already viewed this story'
    );
  }

  // Add the user's view to the story
  story.views.push(userObjectId);
  await story.save();

  return story;
};

const addReaction = async (
  storyId: string,
  userId: string,
  reactionType: string
) => {
  const story = await Story.findByIdAndUpdate(
    storyId,
    {
      $push: {
        reactions: { userId, type: reactionType },
      },
    },
    { new: true }
  );

  if (!story) {
    throw new AppError(httpStatus.NOT_FOUND, 'Story Not Found');
  }

  return story;
};

const deleteStory = async (storyId: string, userId: string) => {
  const story = await Story.findOneAndDelete({ _id: storyId, user: userId });

  if (!story) {
    throw new AppError(httpStatus.NOT_FOUND, 'Story Not Found or Unauthorized');
  }

  return story;
};

export const StoryService = {
  createStory,
  getUserStories,
  getAllUserStories,
  getSingleStories,
  updateStory,
  addView,
  addReaction,
  deleteStory,
};
