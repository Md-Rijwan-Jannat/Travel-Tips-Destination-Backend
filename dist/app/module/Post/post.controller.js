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
exports.PostControllers = void 0;
const post_service_1 = require("./post.service");
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const http_status_1 = __importDefault(require("http-status"));
// Create a new post
const createPost = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield post_service_1.PostService.createPostIntoDB(req.body, req.user.id, {
        id: req.user.id,
        role: req.user.role,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: 'Post created successfully',
        data: post,
    });
}));
// Get a post by ID
const getPostById = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield post_service_1.PostService.getPostByIdFromDB(req.params.id, {
        id: req.user.id,
        role: req.user.role,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Post retrieved successfully',
        data: post,
    });
}));
// Get all posts
const getAllPosts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { result, meta } = yield post_service_1.PostService.getAllPostsFromDB(req.query, {
        id: req.user.id,
        role: req.user.role,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Posts retrieved successfully',
        data: result,
        meta: meta,
    });
}));
// Get all normal posts
const getAllPostsNormalForAnalytics = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { result, meta } = yield post_service_1.PostService.getAllPostsNormalForAnalytics(req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Normal posts retrieved successfully',
        meta: meta,
        data: result,
    });
}));
// Get all premium posts
const getAllPostsPremiumForAnalytics = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { result, meta } = yield post_service_1.PostService.getAllPostsPremiumForAnalytics(req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Premium posts retrieved successfully',
        meta: meta,
        data: result,
    });
}));
// Get all  premium posts
const getAllPremiumPosts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { result, meta } = yield post_service_1.PostService.getAllPremiumPostsFromDB(req.query, { id: req.user.id, role: req.user.role });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Premium posts retrieved successfully',
        meta: meta,
        data: result,
    });
}));
// Pin/unpin a post to the owner's profile (owner or admin only)
const setPin = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const pinned = req.body.pinned === true;
    const post = yield post_service_1.PostService.setProfilePinFromDB(req.params.id, pinned, {
        id: req.user.id,
        role: req.user.role,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: pinned ? 'Post pinned' : 'Post unpinned',
        data: post,
    });
}));
// Feature/unfeature a post on the owner's profile (owner or admin only)
const setFeature = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const featured = req.body.featured === true;
    const post = yield post_service_1.PostService.setProfileFeatureFromDB(req.params.id, featured, { id: req.user.id, role: req.user.role });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: featured ? 'Post featured' : 'Post unfeatured',
        data: post,
    });
}));
// Pin/unpin a post inside its community group (group staff only)
const setGroupPin = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield post_service_1.PostService.setGroupPinFromDB(req.params.id, req.body.pinned === true, { id: req.user.id, role: req.user.role });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Group pin updated',
        data: post,
    });
}));
// Hide a post from the caller's own feed (never affects other viewers)
const hidePost = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield post_service_1.PostService.hidePostForUserFromDB(req.params.id, req.user.id, { id: req.user.id, role: req.user.role });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Post hidden from your feed',
        data: result,
    });
}));
// Undo a per-user hide
const unhidePost = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield post_service_1.PostService.unhidePostForUserFromDB(req.params.id, req.user.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Post restored to your feed',
        data: result,
    });
}));
// Persist the post owner's comment ordering + featured-comment policy
const updateCommentSettings = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const post = yield post_service_1.PostService.updateCommentSettingsFromDB(req.params.id, req.body, { id: req.user.id, role: req.user.role });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Comment settings updated',
        data: (_a = post.commentSettings) !== null && _a !== void 0 ? _a : null,
    });
}));
// Update a post by ID
const updatePost = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield post_service_1.PostService.updatePostIntoDB(req.params.id, req.body, {
        id: req.user.id,
        role: req.user.role,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Post updated successfully',
        data: post,
    });
}));
// Delete a post by ID
const deletePost = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield post_service_1.PostService.deletePostFromDB(req.params.id, {
        id: req.user.id,
        role: req.user.role,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Post deleted successfully',
        data: post,
    });
}));
// Recover Delete a post by ID
const recoverPost = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield post_service_1.PostService.recoverPostFromDB(req.params.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Post recover successfully',
        data: post,
    });
}));
// Report a post by ID
const reportPost = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield post_service_1.PostService.reportPostFromDB(req.params.id, req.body, req.user.id, { id: req.user.id, role: req.user.role });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Report successful',
        data: post,
    });
}));
exports.PostControllers = {
    createPost,
    getPostById,
    getAllPosts,
    getAllPostsNormalForAnalytics,
    getAllPostsPremiumForAnalytics,
    getAllPremiumPosts,
    updatePost,
    deletePost,
    recoverPost,
    reportPost,
    setPin,
    setFeature,
    setGroupPin,
    hidePost,
    unhidePost,
    updateCommentSettings,
};
