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
exports.StoryController = void 0;
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const http_status_1 = __importDefault(require("http-status"));
const story_service_1 = require("./story.service");
const createStory = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const story = yield story_service_1.StoryService.createStory({
        user: req.user.id,
        media: req.body.media,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: 'Story created successfully',
        data: story,
    });
}));
const getUserStories = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const stories = yield story_service_1.StoryService.getUserStories(req.user.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Stories retrieved successfully',
        data: stories,
    });
}));
const getAllUserStories = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const stories = yield story_service_1.StoryService.getAllUserStories();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Stories retrieved successfully',
        data: stories,
    });
}));
const getSingleStories = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const stories = yield story_service_1.StoryService.getUserStories(req.params.storyId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Stories retrieved successfully',
        data: stories,
    });
}));
const updateStory = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { storyId } = req.params;
    const updatedStory = yield story_service_1.StoryService.updateStory(storyId, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Story updated successfully',
        data: updatedStory,
    });
}));
const addView = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { storyId } = req.params;
    const story = yield story_service_1.StoryService.addView(storyId, req.user.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'View added successfully',
        data: story,
    });
}));
const addReaction = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { storyId } = req.params;
    const { type } = req.body;
    const story = yield story_service_1.StoryService.addReaction(storyId, req.user.id, type);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Reaction added successfully',
        data: story,
    });
}));
const deleteStory = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { storyId } = req.params;
    yield story_service_1.StoryService.deleteStory(storyId, req.user.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.NO_CONTENT,
        success: true,
        message: 'Story deleted successfully',
    });
}));
exports.StoryController = {
    createStory,
    getUserStories,
    getAllUserStories,
    getSingleStories,
    updateStory,
    addView,
    addReaction,
    deleteStory,
};
