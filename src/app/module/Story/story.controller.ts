import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import httpStatus from 'http-status';
import { StoryService } from './story.service';

const createStory = catchAsync(async (req, res) => {
  const story = await StoryService.createStory({
    user: req.user.id,
    media: req.body.media,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Story created successfully',
    data: story,
  });
});

const getUserStories = catchAsync(async (req, res) => {
  const stories = await StoryService.getUserStories(req.user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Stories retrieved successfully',
    data: stories,
  });
});

const getAllUserStories = catchAsync(async (req, res) => {
  const stories = await StoryService.getAllUserStories();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Stories retrieved successfully',
    data: stories,
  });
});

const getSingleStories = catchAsync(async (req, res) => {
  const stories = await StoryService.getUserStories(req.params.storyId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Stories retrieved successfully',
    data: stories,
  });
});

const updateStory = catchAsync(async (req, res) => {
  const { storyId } = req.params;
  const updatedStory = await StoryService.updateStory(storyId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Story updated successfully',
    data: updatedStory,
  });
});

const addView = catchAsync(async (req, res) => {
  const { storyId } = req.params;
  const story = await StoryService.addView(storyId, req.user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'View added successfully',
    data: story,
  });
});

const addReaction = catchAsync(async (req, res) => {
  const { storyId } = req.params;
  const { type } = req.body;

  const story = await StoryService.addReaction(storyId, req.user.id, type);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reaction added successfully',
    data: story,
  });
});

const deleteStory = catchAsync(async (req, res) => {
  const { storyId } = req.params;

  await StoryService.deleteStory(storyId, req.user.id);

  sendResponse(res, {
    statusCode: httpStatus.NO_CONTENT,
    success: true,
    message: 'Story deleted successfully',
  });
});

export const StoryController = {
  createStory,
  getUserStories,
  getAllUserStories,
  getSingleStories,
  updateStory,
  addView,
  addReaction,
  deleteStory,
};
