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
// Create a new post
const createPostIntoDB = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield post_model_1.Post.create(payload);
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
// Get all posts (with optional filters)
const getAllPostsFromDB = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const postQueryBuilder = new QueryBuilder_1.default(post_model_1.Post.find({ isDeleted: false }).populate("user comments"), query)
        .search(post_constants_1.postSearchFelids)
        .sort()
        .fields()
        .filter();
    const posts = yield postQueryBuilder.modelQuery;
    return posts;
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
    console.log("posId", postId);
    const post = yield post_model_1.Post.findByIdAndUpdate(postId, { isDeleted: false }, { new: true });
    if (!post) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
    }
    return post;
});
exports.PostService = {
    createPostIntoDB,
    getPostByIdFromDB,
    getAllPostsFromDB,
    updatePostIntoDB,
    deletePostFromDB,
    recoverPostFromDB,
};
