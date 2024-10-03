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
exports.ReactService = void 0;
const AppError_1 = __importDefault(require("../../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const react_model_1 = require("./react.model");
const post_model_1 = require("../Post/post.model");
const comment_model_1 = require("../Comment/comment.model");
// Like a post or comment
const likeFromDB = (userId, targetId, type) => __awaiter(void 0, void 0, void 0, function* () {
    // Check if the user has already liked this post/comment
    const existingLikeReact = yield react_model_1.React.findOne({
        user: userId,
        [type]: targetId,
        type: "like",
    });
    // If user already liked, throw an error or return depending on your needs
    if (existingLikeReact) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "You have already liked this item.");
    }
    // Check if the user has disliked the post/comment before and remove the dislike
    const existingDislikeReact = yield react_model_1.React.findOneAndDelete({
        user: userId,
        [type]: targetId,
        type: "dislike",
    });
    if (existingDislikeReact) {
        // Remove the user from the dislikes array of the post/comment
        if (type === "post") {
            yield post_model_1.Post.findByIdAndUpdate(targetId, {
                $pull: { dislikes: userId },
            });
        }
        else if (type === "comment") {
            yield comment_model_1.Comment.findByIdAndUpdate(targetId, {
                $pull: { dislikes: userId },
            });
        }
    }
    // Add new like
    const newReact = yield react_model_1.React.create({
        user: userId,
        [type]: targetId,
        type: "like",
    });
    // Push the new React ID to the likes array of the post/comment
    if (type === "post") {
        yield post_model_1.Post.findByIdAndUpdate(targetId, {
            $push: { likes: userId },
        });
    }
    else if (type === "comment") {
        yield comment_model_1.Comment.findByIdAndUpdate(targetId, {
            $push: { likes: userId },
        });
    }
    return newReact;
});
// Unlike a post or comment
const unlikeFromDB = (userId, targetId, type) => __awaiter(void 0, void 0, void 0, function* () {
    const existingReact = yield react_model_1.React.findOneAndDelete({
        user: userId,
        [type]: targetId,
        type: "like",
    });
    if (!existingReact) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "You haven't liked this item.");
    }
    // Remove the React ID from the likes array of the post/comment
    if (type === "post") {
        yield post_model_1.Post.findByIdAndUpdate(targetId, {
            $pull: { likes: userId },
        });
    }
    else if (type === "comment") {
        yield comment_model_1.Comment.findByIdAndUpdate(targetId, {
            $pull: { likes: userId },
        });
    }
});
// Dislike a post or comment
const dislikeFromDB = (userId, targetId, type) => __awaiter(void 0, void 0, void 0, function* () {
    // Check if the user has already disliked this post/comment
    const existingDislikeReact = yield react_model_1.React.findOne({
        user: userId,
        [type]: targetId,
        type: "dislike",
    });
    // If user already disliked, throw an error or return depending on your needs
    if (existingDislikeReact) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "You have already disliked this item.");
    }
    // Check if the user has liked the post/comment before and remove the like
    const existingLikeReact = yield react_model_1.React.findOneAndDelete({
        user: userId,
        [type]: targetId,
        type: "like",
    });
    if (existingLikeReact) {
        // Remove the user from the likes array of the post/comment
        if (type === "post") {
            yield post_model_1.Post.findByIdAndUpdate(targetId, {
                $pull: { likes: userId },
            });
        }
        else if (type === "comment") {
            yield comment_model_1.Comment.findByIdAndUpdate(targetId, {
                $pull: { likes: userId },
            });
        }
    }
    // Add new dislike
    const newReact = yield react_model_1.React.create({
        user: userId,
        [type]: targetId,
        type: "dislike",
    });
    // Push the new React ID to the dislikes array of the post/comment
    if (type === "post") {
        yield post_model_1.Post.findByIdAndUpdate(targetId, {
            $push: { dislikes: userId },
        });
    }
    else if (type === "comment") {
        yield comment_model_1.Comment.findByIdAndUpdate(targetId, {
            $push: { dislikes: userId },
        });
    }
    return newReact;
});
// Undislike a post or comment
const undislikeFromDB = (userId, targetId, type) => __awaiter(void 0, void 0, void 0, function* () {
    const existingReact = yield react_model_1.React.findOneAndDelete({
        user: userId,
        [type]: targetId,
        type: "dislike",
    });
    if (!existingReact) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "You haven't disliked this item.");
    }
    // Remove the React ID from the dislikes array of the post/comment
    if (type === "post") {
        yield post_model_1.Post.findByIdAndUpdate(targetId, {
            $pull: { dislikes: userId },
        });
    }
    else if (type === "comment") {
        yield comment_model_1.Comment.findByIdAndUpdate(targetId, {
            $pull: { dislikes: userId },
        });
    }
});
exports.ReactService = {
    likeFromDB,
    unlikeFromDB,
    dislikeFromDB,
    undislikeFromDB,
};
