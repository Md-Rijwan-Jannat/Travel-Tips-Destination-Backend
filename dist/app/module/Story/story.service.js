"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoryService = void 0;
const mongoose_1 = require("mongoose");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const user_model_1 = require("../User/user.model");
const story_model_1 = require("./story.model");
const http_status_1 = __importDefault(require("http-status"));
const createStory = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { user, media } = payload;
    const isUserExists = yield user_model_1.User.findById(user);
    if (!isUserExists)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'User Not Found');
    // Create a story with 24-hour expiration
    const story = yield story_model_1.Story.create({
        user,
        media,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours later
    });
    return story;
});
const getUserStories = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const stories = yield story_model_1.Story.find({
        user: userId,
        expiresAt: { $gte: new Date() },
    })
        .sort({ createdAt: -1 })
        .populate('user', '_id name image email verified bio');
    return stories;
});
const getAllUserStories = () => __awaiter(void 0, void 0, void 0, function* () {
    const stories = yield story_model_1.Story.aggregate([
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
});
const getSingleStories = (storyId) => __awaiter(void 0, void 0, void 0, function* () {
    const stories = yield story_model_1.Story.findById(storyId)
        .sort({ createdAt: -1 })
        .populate('user', '_id name image email verified bio');
    return stories;
});
const updateStory = (storyId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const updatedStory = yield story_model_1.Story.findByIdAndUpdate(storyId, Object.assign({}, payload), { new: true });
    if (!updatedStory) {
        throw new Error('Story not found');
    }
    return updatedStory;
});
const addView = (storyId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const userObjectId = new mongoose_1.Types.ObjectId(userId);
    const story = yield story_model_1.Story.findById(storyId);
    if (!story) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Story Not Found');
    }
    // Check if the user has already viewed the story
    const hasViewed = story.views.includes(userObjectId);
    if (hasViewed) {
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'User has already viewed this story');
    }
    // Add the user's view to the story
    story.views.push(userObjectId);
    yield story.save();
    return story;
});
const addReaction = (storyId, userId, reactionType) => __awaiter(void 0, void 0, void 0, function* () {
    const story = yield story_model_1.Story.findByIdAndUpdate(storyId, {
        $push: {
            reactions: { userId, type: reactionType },
        },
    }, { new: true });
    if (!story) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Story Not Found');
    }
    return story;
});
const deleteStory = (storyId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const story = yield story_model_1.Story.findOneAndDelete({ _id: storyId, user: userId });
    if (!story) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Story Not Found or Unauthorized');
    }
    return story;
});
exports.StoryService = {
    createStory,
    getUserStories,
    getAllUserStories,
    getSingleStories,
    updateStory,
    addView,
    addReaction,
    deleteStory,
};
