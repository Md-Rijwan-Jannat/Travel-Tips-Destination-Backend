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
exports.CommentService = void 0;
const comment_model_1 = require("./comment.model");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const user_model_1 = require("../User/user.model");
const post_model_1 = require("../Post/post.model");
const mongoose_1 = __importDefault(require("mongoose"));
const QueryBuilder_1 = __importDefault(require("../../builder/QueryBuilder"));
// Add a comment to the DB
const addCommentIntoDB = (payload, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const session = yield mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const user = yield user_model_1.User.findById(userId).session(session);
        const post = yield post_model_1.Post.findById(payload.post).session(session);
        if (!user) {
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
        }
        if (!post) {
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
        }
        // Create the comment
        const comment = yield comment_model_1.Comment.create([Object.assign(Object.assign({}, payload), { user: userId })], {
            session,
        });
        yield post_model_1.Post.findByIdAndUpdate(payload.post, {
            $push: { comments: comment[0]._id },
        }, { session });
        // Commit the transaction
        yield session.commitTransaction();
        session.endSession();
        return comment[0];
    }
    catch (error) {
        yield session.abortTransaction();
        session.endSession();
        throw error;
    }
});
const getAllCommentFromDB = () => __awaiter(void 0, void 0, void 0, function* () {
    const comments = yield comment_model_1.Comment.find({ isDeleted: false })
        .populate("user")
        .populate({
        path: "replies",
        populate: {
            path: "user",
        },
    });
    return comments;
});
const getCommentForPostFromDB = (postId, query) => __awaiter(void 0, void 0, void 0, function* () {
    const commentQueryBuilder = new QueryBuilder_1.default(comment_model_1.Comment.find({ post: postId, isDeleted: false })
        .populate("user")
        .populate({
        path: "replies",
        populate: {
            path: "user",
        },
    }), query)
        .sort()
        .fields()
        .filter();
    const comments = yield commentQueryBuilder.modelQuery;
    return comments;
});
// Update a comment by ID
const updateCommentIntoDB = (commentId, updateData) => __awaiter(void 0, void 0, void 0, function* () {
    const comment = yield comment_model_1.Comment.findByIdAndUpdate(commentId, updateData, {
        new: true,
    });
    if (!comment || comment.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Comment not found");
    }
    return comment;
});
// Soft delete a comment by ID
const deleteCommentFromDB = (commentId) => __awaiter(void 0, void 0, void 0, function* () {
    const comment = yield comment_model_1.Comment.findByIdAndDelete(commentId);
    if (!comment) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Comment not found");
    }
    return null;
});
// Reply to a comment
const replyToCommentFromDB = (commentId, replyData, id) => __awaiter(void 0, void 0, void 0, function* () {
    const comment = yield comment_model_1.Comment.findById(commentId);
    if (!comment) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Comment not found");
    }
    const reply = yield comment_model_1.Comment.create(Object.assign(Object.assign({}, replyData), { user: id }));
    yield comment_model_1.Comment.findByIdAndUpdate(commentId, { $push: { replies: reply._id } });
    return reply;
});
exports.CommentService = {
    addCommentIntoDB,
    getAllCommentFromDB,
    getCommentForPostFromDB,
    updateCommentIntoDB,
    deleteCommentFromDB,
    replyToCommentFromDB,
};
