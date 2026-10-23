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
const react_interface_1 = require("./react.interface");
const http_status_1 = __importDefault(require("http-status"));
const react_model_1 = require("./react.model");
const post_model_1 = require("../Post/post.model");
const comment_model_1 = require("../Comment/comment.model");
const short_model_1 = require("../Short/short.model");
const short_service_1 = require("../Short/short.service");
const postAccess_1 = require("../Post/postAccess");
const mongoose_1 = __importDefault(require("mongoose"));
const TARGET_TYPES = ["post", "comment", "short"];
const isTargetType = (value) => typeof value === "string" && TARGET_TYPES.includes(value);
const isStoreType = (value) => typeof value === "string" && react_interface_1.REACT_STORE_TYPES.includes(value);
const targetFilter = (targetType, targetId) => ({ [targetType]: targetId });
/**
 * Target access gate: reacting requires being able to READ the target and,
 * for group content, active (unbanned/unmuted) membership in that group.
 * Missing/invisible targets surface as 404 (no existence probing).
 */
const assertReactTargetAccess = (userId, targetId, type, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const req = requester !== null && requester !== void 0 ? requester : { id: userId, role: "USER" };
    if (!mongoose_1.default.Types.ObjectId.isValid(targetId)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Target not found");
    }
    if (type === "post") {
        const post = yield post_model_1.Post.findById(targetId);
        if (!post || post.isDeleted) {
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
        }
        yield (0, postAccess_1.assertCanInteractWithPost)(post, req);
        return;
    }
    if (type === "short") {
        const short = yield short_model_1.Short.findById(targetId);
        if (!short || short.isDeleted) {
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
        }
        yield short_service_1.ShortService.assertCanInteractWithShort(short, req);
        return;
    }
    const comment = yield comment_model_1.Comment.findById(targetId);
    if (!comment || comment.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Comment not found");
    }
    if (comment.short) {
        const short = yield short_model_1.Short.findById(String(comment.short));
        if (!short)
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Comment not found");
        yield short_service_1.ShortService.assertCanInteractWithShort(short, req);
        return;
    }
    if (comment.post) {
        const post = yield post_model_1.Post.findById(String(comment.post));
        if (post)
            yield (0, postAccess_1.assertCanInteractWithPost)(post, req);
    }
});
// Get all likes
const getAllLikes = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield react_model_1.React.find({ type: "like" });
    return result;
});
// Get all dislikes
const getAllDisLikes = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield react_model_1.React.find({ type: "dislike" });
    return result;
});
/**
 * Legacy denormalization: posts and comments keep a `likes` user-id array
 * that older clients read for counts. The new reaction flows keep it in sync
 * when the reaction is (or becomes / stops being) a `like`. Shorts have their
 * own separate legacy like endpoint and are intentionally not synced here.
 */
const syncLegacyLikeArray = (targetType, targetId, userId, isLike) => __awaiter(void 0, void 0, void 0, function* () {
    const op = isLike ? "$addToSet" : "$pull";
    if (targetType === "post") {
        yield post_model_1.Post.findByIdAndUpdate(targetId, { [op]: { likes: userId } });
    }
    else {
        yield comment_model_1.Comment.findByIdAndUpdate(targetId, { [op]: { likes: userId } });
    }
});
// Like a post or comment
const likeFromDB = (userId, targetId, type, requester) => __awaiter(void 0, void 0, void 0, function* () {
    yield assertReactTargetAccess(userId, targetId, type, requester);
    const existingLikeReact = yield react_model_1.React.findOne({
        user: userId,
        [type]: targetId,
        type: "like",
    });
    if (existingLikeReact) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "You have already liked this item.");
    }
    const existingDislikeReact = yield react_model_1.React.findOneAndDelete({
        user: userId,
        [type]: targetId,
        type: "dislike",
    });
    if (existingDislikeReact) {
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
const unlikeFromDB = (userId, targetId, type, requester) => __awaiter(void 0, void 0, void 0, function* () {
    yield assertReactTargetAccess(userId, targetId, type, requester);
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
const dislikeFromDB = (userId, targetId, type, requester) => __awaiter(void 0, void 0, void 0, function* () {
    yield assertReactTargetAccess(userId, targetId, type, requester);
    const existingDislikeReact = yield react_model_1.React.findOne({
        user: userId,
        [type]: targetId,
        type: "dislike",
    });
    if (existingDislikeReact) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "You have already disliked this item.");
    }
    const existingLikeReact = yield react_model_1.React.findOneAndDelete({
        user: userId,
        [type]: targetId,
        type: "like",
    });
    if (existingLikeReact) {
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
const undislikeFromDB = (userId, targetId, type, requester) => __awaiter(void 0, void 0, void 0, function* () {
    yield assertReactTargetAccess(userId, targetId, type, requester);
    const existingReact = yield react_model_1.React.findOneAndDelete({
        user: userId,
        [type]: targetId,
        type: "dislike",
    });
    if (!existingReact) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "You haven't disliked this item.");
    }
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
/* ------------------------------------------------------------------ */
/* Unified 7-type reaction API                                         */
/* ------------------------------------------------------------------ */
/**
 * Atomically set (create or change) the caller's single reaction on a
 * post / comment / short. One reaction per user per target is enforced by a
 * unique partial index; a concurrent upsert race surfaces as a duplicate-key
 * error and is retried once as an in-place update.
 */
const setReactionFromDB = (userId, targetType, targetId, reaction, requester) => __awaiter(void 0, void 0, void 0, function* () {
    yield assertReactTargetAccess(userId, targetId, targetType, requester);
    const filter = Object.assign({ user: userId }, targetFilter(targetType, targetId));
    const update = { $set: { type: reaction } };
    let doc;
    try {
        doc = yield react_model_1.React.findOneAndUpdate(filter, update, {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        });
    }
    catch (error) {
        // Concurrent upsert on the same (user, target) — the loser retries as a
        // plain update of the winner's document.
        const isDuplicate = error instanceof Error &&
            "code" in error &&
            error.code === 11000;
        if (!isDuplicate)
            throw error;
        doc = yield react_model_1.React.findOneAndUpdate(filter, update, { new: true });
        if (!doc)
            throw error;
    }
    // Legacy `likes[]` denormalization for post/comment targets.
    if (targetType !== "short") {
        yield syncLegacyLikeArray(targetType, targetId, userId, reaction === "like");
    }
    return getReactionSummary(userId, targetType, targetId, { skipAccessCheck: true });
});
/** Remove the caller's reaction from a target (idempotent-friendly). */
const removeReactionFromDB = (userId, targetType, targetId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    yield assertReactTargetAccess(userId, targetId, targetType, requester);
    const deleted = yield react_model_1.React.findOneAndDelete(Object.assign({ user: userId }, targetFilter(targetType, targetId)));
    if (deleted && targetType !== "short") {
        yield syncLegacyLikeArray(targetType, targetId, userId, false);
    }
    return getReactionSummary(userId, targetType, targetId, {
        skipAccessCheck: true,
    });
});
/**
 * Aggregated counts per reaction type plus the caller's own reaction.
 * Counts are computed server-side from indexed documents — clients can never
 * supply or trust counts.
 */
const getReactionSummary = (userId, targetType, targetId, options) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!mongoose_1.default.Types.ObjectId.isValid(targetId)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Target not found");
    }
    if (!(options === null || options === void 0 ? void 0 : options.skipAccessCheck)) {
        yield assertReactTargetAccess(userId, targetId, targetType, options === null || options === void 0 ? void 0 : options.requester);
    }
    const rows = yield react_model_1.React.aggregate([
        // Mongoose does not cast aggregate $match values — build the filter with
        // a real ObjectId so the match actually hits the collection.
        {
            $match: {
                [targetType]: new mongoose_1.default.Types.ObjectId(targetId),
            },
        },
        { $group: { _id: "$type", count: { $sum: 1 } } },
    ]);
    const counts = {};
    let total = 0;
    for (const row of rows) {
        counts[row._id] = row.count;
        total += row.count;
    }
    const mine = yield react_model_1.React.findOne(Object.assign({ user: userId }, targetFilter(targetType, targetId)))
        .select("type")
        .lean();
    return {
        targetType,
        targetId,
        counts,
        total,
        myReaction: (_a = mine === null || mine === void 0 ? void 0 : mine.type) !== null && _a !== void 0 ? _a : null,
    };
});
exports.ReactService = {
    assertReactTargetAccess,
    getAllLikes,
    getAllDisLikes,
    likeFromDB,
    unlikeFromDB,
    dislikeFromDB,
    undislikeFromDB,
    setReactionFromDB,
    removeReactionFromDB,
    getReactionSummary,
    isTargetType,
    isStoreType,
};
