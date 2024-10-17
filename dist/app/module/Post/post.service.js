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
exports.PostService = void 0;
const post_model_1 = require("./post.model");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const QueryBuilder_1 = __importDefault(require("../../builder/QueryBuilder"));
const post_constants_1 = require("./post.constants");
const mongoose_1 = __importDefault(require("mongoose"));
// Create a new post
const createPostIntoDB = (payload, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield post_model_1.Post.create(Object.assign(Object.assign({}, payload), { user: userId }));
    return post;
});
// Get a post by ID
const getPostByIdFromDB = (postId) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield post_model_1.Post.findById(postId).populate("user comments");
    if (!post || post.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
    }
    return post;
});
// Get all posts for normal posts
const getAllPostsNormalForAnalytics = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const postQueryBuilder = new QueryBuilder_1.default(post_model_1.Post.find({ isDeleted: false, status: "FREE" })
        .populate({
        path: "user",
    })
        .populate({
        path: "comments",
        populate: {
            path: "user",
            model: "User",
        },
    }), query)
        .search(post_constants_1.postSearchFields)
        .sort()
        .fields()
        .filter()
        .paginate();
    const result = yield postQueryBuilder.modelQuery;
    const meta = yield postQueryBuilder.countTotal();
    // Return meta only if the role is ADMIN
    return { result: result, meta: meta };
});
// Get all posts for premium posts
const getAllPostsPremiumForAnalytics = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const postQueryBuilder = new QueryBuilder_1.default(post_model_1.Post.find({ isDeleted: false, status: "PREMIUM" })
        .populate({
        path: "user",
    })
        .populate({
        path: "comments",
        populate: {
            path: "user",
            model: "User",
        },
    }), query)
        .search(post_constants_1.postSearchFields)
        .sort()
        .fields()
        .filter()
        .paginate();
    const result = yield postQueryBuilder.modelQuery;
    const meta = yield postQueryBuilder.countTotal();
    // Return meta only if the role is ADMIN
    return { result: result, meta: meta };
});
// Get all posts (with optional filters)
const getAllPostsFromDB = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const { categories } = query;
    let queryObj = { isDeleted: false, status: "FREE" };
    if (categories) {
        queryObj = Object.assign(Object.assign({}, queryObj), { category: { $in: categories || "" } });
    }
    // Build the post query
    const postQueryBuilder = new QueryBuilder_1.default(post_model_1.Post.find(queryObj)
        .populate({
        path: "user",
    })
        .populate({
        path: "comments",
        populate: {
            path: "user",
            model: "User",
        },
    }), query)
        .search(post_constants_1.postSearchFields)
        .sort()
        .fields()
        .filter()
        .paginate();
    // Execute the query
    const result = yield postQueryBuilder.modelQuery;
    const meta = yield postQueryBuilder.countTotal();
    // Return result and meta (meta only if the role is ADMIN)
    return { result, meta };
});
// Get all premium posts (with optional filters)
const getAllPremiumPostsFromDB = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const postQueryBuilder = new QueryBuilder_1.default(post_model_1.Post.find({ isDeleted: false, status: "PREMIUM" })
        .populate({
        path: "user",
    })
        .populate({
        path: "comments",
        populate: {
            path: "user",
            model: "User",
        },
    }), query)
        .search(post_constants_1.postSearchFields)
        .sort()
        .fields()
        .filter();
    const result = yield postQueryBuilder.modelQuery;
    // Return meta only if the role is ADMIN
    return result;
});
// Update a post by ID
const updatePostIntoDB = (postId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield post_model_1.Post.findByIdAndUpdate(postId, payload, { new: true });
    if (!post || post.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
    }
    return post;
});
// Delete a post by ID (soft delete)
const deletePostFromDB = (postId) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield post_model_1.Post.findByIdAndUpdate(postId, { isDeleted: true }, { new: true });
    if (!post) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
    }
    return post;
});
// Delete a post by ID (soft delete)
const recoverPostFromDB = (postId) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield post_model_1.Post.findByIdAndUpdate(postId, { isDeleted: false }, { new: true });
    if (!post) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
    }
    return post;
});
const reportPostFromDB = (postId, payload, userId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!mongoose_1.default.Types.ObjectId.isValid(postId)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid Post ID");
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(userId)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid User ID");
    }
    // Find the post first to check the reportCount
    const post = yield post_model_1.Post.findById(postId);
    if (!post) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
    }
    // Increment the report count
    const updatedReportCount = post.reportCount + 1;
    // If reportCount reaches 5, soft delete the post
    const isSoftDeleted = updatedReportCount >= 5;
    // Update the post with new report and report count
    const updatedPost = yield post_model_1.Post.findByIdAndUpdate(postId, {
        $push: {
            report: {
                report: payload.report,
                user: userId,
                post: postId,
            },
        },
        reportCount: updatedReportCount,
        isDeleted: isSoftDeleted,
    }, { new: true });
    return updatedPost;
});
exports.PostService = {
    createPostIntoDB,
    getPostByIdFromDB,
    getAllPostsPremiumForAnalytics,
    getAllPostsNormalForAnalytics,
    getAllPostsFromDB,
    getAllPremiumPostsFromDB,
    updatePostIntoDB,
    deletePostFromDB,
    recoverPostFromDB,
    reportPostFromDB,
};
