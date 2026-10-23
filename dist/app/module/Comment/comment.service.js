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
const react_model_1 = require("../Reacts/react.model");
const mongoose_1 = __importDefault(require("mongoose"));
const postAccess_1 = require("../Post/postAccess");
const short_model_1 = require("../Short/short.model");
const short_service_1 = require("../Short/short.service");
const transactionsSupported = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = mongoose_1.default.connection.db;
        if (!db)
            return false;
        const hello = yield db.admin().command({ hello: 1 });
        // Transactions require a replica set / mongos.
        return hello.setName !== undefined || hello.msg === "isdbgrid";
    }
    catch (_a) {
        return false;
    }
});
// Add a comment to the DB (to a post OR a short). The target's access rules
// (group membership, audience, moderation state) are enforced server-side.
const addCommentIntoDB = (payload, userId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const req = requester !== null && requester !== void 0 ? requester : { id: userId, role: "USER" };
    if (payload.short) {
        const short = yield short_model_1.Short.findById(String(payload.short));
        if (!short || short.isDeleted) {
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
        }
        yield short_service_1.ShortService.assertCanInteractWithShort(short, req);
        const comment = yield comment_model_1.Comment.create({
            text: payload.text,
            images: (_a = payload.images) !== null && _a !== void 0 ? _a : [],
            user: userId,
            short: short._id,
        });
        yield short_model_1.Short.updateOne({ _id: short._id }, { $inc: { commentCount: 1 } });
        return comment;
    }
    const post = yield post_model_1.Post.findById(payload.post);
    if (!post || post.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
    }
    yield (0, postAccess_1.assertCanInteractWithPost)(post, req);
    if (yield transactionsSupported()) {
        const session = yield mongoose_1.default.startSession();
        session.startTransaction();
        try {
            const user = yield user_model_1.User.findById(userId).session(session);
            if (!user) {
                throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
            }
            const comment = yield comment_model_1.Comment.create([Object.assign(Object.assign({}, payload), { user: userId, short: null })], {
                session,
            });
            yield post_model_1.Post.findByIdAndUpdate(payload.post, { $push: { comments: comment[0]._id } }, { session });
            yield session.commitTransaction();
            session.endSession();
            return comment[0];
        }
        catch (error) {
            yield session.abortTransaction();
            session.endSession();
            throw error;
        }
    }
    // Standalone deployments (no replica set) cannot run transactions — the
    // same ordered operations run without one so commenting still works.
    const user = yield user_model_1.User.findById(userId);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    const comment = yield comment_model_1.Comment.create(Object.assign(Object.assign({}, payload), { user: userId, short: null }));
    yield post_model_1.Post.findByIdAndUpdate(payload.post, { $push: { comments: comment._id } });
    return comment;
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
/* ------------------------------------------------------------------ */
/* Sorting + automatic/manual highlighting                             */
/* ------------------------------------------------------------------ */
/**
 * Documented engagement policy used by both TOP sorting and automatic
 * highlighting (deterministic, predictable, resistant to tiny fluctuations):
 *
 *   score = reactions * 3 + liveReplies * 2 + recencyBonus
 *   recencyBonus = 3 * max(0, 1 - ageDays / 7)      (fades over 7 days)
 *
 * A comment is considered "strongly engaged" when it has at least
 * STRONG_ENGAGEMENT_MIN total reactions + replies. Automatic highlighting
 * prefers the best strongly-engaged comment; when none exists it falls back
 * to the most recent eligible comment. Reaction count alone can never
 * dominate indefinitely because recency keeps rotating candidates and the
 * strong-gate prevents single-count churn from flipping the choice.
 */
const RECENCY_WINDOW_DAYS = 7;
const STRONG_ENGAGEMENT_MIN = 2;
const engagementScore = (entry, now) => {
    const ageMs = now - entry.createdAt.getTime();
    const ageDays = Math.max(0, ageMs / 86400000);
    const recency = ageDays >= RECENCY_WINDOW_DAYS
        ? 0
        : 3 * (1 - ageDays / RECENCY_WINDOW_DAYS);
    return entry.reactions * 3 + entry.replies * 2 + recency;
};
const resolveSortMode = (raw, fallback) => {
    const value = typeof raw === "string" ? raw.toUpperCase() : "";
    if (value === "TOP" || value === "NEWEST" || value === "OLDEST")
        return value;
    // Legacy query spellings.
    if (raw === "newest" || raw === "-createdAt")
        return "NEWEST";
    if (raw === "oldest" || raw === "createdAt")
        return "OLDEST";
    return fallback;
};
const fetchCommentPool = (filter) => __awaiter(void 0, void 0, void 0, function* () {
    // Live comments, plus soft-deleted comments that still have surviving
    // replies (so their threads can render as neutral placeholders instead of
    // silently orphaning the children).
    return comment_model_1.Comment.find(Object.assign(Object.assign({}, filter), { $or: [{ isDeleted: false }, { isDeleted: true, replies: { $not: { $size: 0 } } }] }))
        .populate("user")
        .populate({ path: "replies", populate: { path: "user" } });
});
const reactionCountsByComment = (commentIds) => __awaiter(void 0, void 0, void 0, function* () {
    if (commentIds.length === 0)
        return new Map();
    const rows = yield react_model_1.React.aggregate([
        { $match: { comment: { $in: commentIds } } },
        { $group: { _id: "$comment", count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [String(row._id), row.count]));
});
/**
 * Comment list for a post: every live comment plus surviving-thread
 * placeholders, top-level comments ordered by the resolved sort mode
 * (viewer ?sort= overrides the owner's default) and replies in chronological
 * order. Also resolves the featured comment (manual owner selection with a
 * graceful automatic fallback).
 */
const getCommentForPostFromDB = (postId, query, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    let post = null;
    try {
        post = yield post_model_1.Post.findById(postId);
    }
    catch (_k) {
        // Invalid id → empty list (same as a post that never existed).
        return {
            comments: [],
            sortMode: "TOP",
            featuredCommentId: null,
            featuredMode: "none",
        };
    }
    if (post && requester) {
        yield (0, postAccess_1.assertCanViewPost)(post, requester);
    }
    if (!post || post.isDeleted) {
        return {
            comments: [],
            sortMode: "TOP",
            featuredCommentId: null,
            featuredMode: "none",
        };
    }
    const settings = post.commentSettings;
    const sortMode = resolveSortMode(query.sort, (_a = settings === null || settings === void 0 ? void 0 : settings.sortMode) !== null && _a !== void 0 ? _a : "TOP");
    const pool = yield fetchCommentPool({ post: postId });
    const topLevel = pool.filter((c) => !c.parentComment);
    const replies = pool.filter((c) => c.parentComment);
    // Live reply counts per top-level comment (computed from the pool the
    // caller can actually see — soft-deleted replies never count).
    const liveRepliesByParent = new Map();
    for (const reply of replies) {
        if (reply.isDeleted)
            continue;
        const parentId = String(reply.parentComment);
        liveRepliesByParent.set(parentId, ((_b = liveRepliesByParent.get(parentId)) !== null && _b !== void 0 ? _b : 0) + 1);
    }
    const reactionCounts = yield reactionCountsByComment(topLevel.map((c) => c._id));
    const now = Date.now();
    const rankables = new Map();
    for (const comment of topLevel) {
        const id = String(comment._id);
        rankables.set(id, {
            id,
            createdAt: (_c = comment.createdAt) !== null && _c !== void 0 ? _c : new Date(0),
            reactions: (_d = reactionCounts.get(id)) !== null && _d !== void 0 ? _d : 0,
            replies: (_e = liveRepliesByParent.get(id)) !== null && _e !== void 0 ? _e : 0,
        });
    }
    const sortedTop = [...topLevel].sort((a, b) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        if (sortMode === "NEWEST") {
            return ((_b = (_a = b.createdAt) === null || _a === void 0 ? void 0 : _a.getTime()) !== null && _b !== void 0 ? _b : 0) - ((_d = (_c = a.createdAt) === null || _c === void 0 ? void 0 : _c.getTime()) !== null && _d !== void 0 ? _d : 0);
        }
        if (sortMode === "OLDEST") {
            return ((_f = (_e = a.createdAt) === null || _e === void 0 ? void 0 : _e.getTime()) !== null && _f !== void 0 ? _f : 0) - ((_h = (_g = b.createdAt) === null || _g === void 0 ? void 0 : _g.getTime()) !== null && _h !== void 0 ? _h : 0);
        }
        // TOP
        const sa = engagementScore(rankables.get(String(a._id)), now);
        const sb = engagementScore(rankables.get(String(b._id)), now);
        if (sb !== sa)
            return sb - sa;
        // Deterministic tie-break: stronger engagement first, then newest.
        const ra = rankables.get(String(a._id));
        const rb = rankables.get(String(b._id));
        if (rb.reactions !== ra.reactions)
            return rb.reactions - ra.reactions;
        return ((_k = (_j = b.createdAt) === null || _j === void 0 ? void 0 : _j.getTime()) !== null && _k !== void 0 ? _k : 0) - ((_m = (_l = a.createdAt) === null || _l === void 0 ? void 0 : _l.getTime()) !== null && _m !== void 0 ? _m : 0);
    });
    const sortedReplies = [...replies].sort((a, b) => { var _a, _b, _c, _d; return ((_b = (_a = a.createdAt) === null || _a === void 0 ? void 0 : _a.getTime()) !== null && _b !== void 0 ? _b : 0) - ((_d = (_c = b.createdAt) === null || _c === void 0 ? void 0 : _c.getTime()) !== null && _d !== void 0 ? _d : 0); });
    /* ----- featured comment resolution ----- */
    let featuredCommentId = null;
    let featuredMode = "none";
    // Eligible = live, top-level, visible comments (placeholders excluded).
    const eligible = sortedTop.filter((c) => !c.isDeleted);
    if ((settings === null || settings === void 0 ? void 0 : settings.highlightMode) === "MANUAL" && settings.highlightedComment) {
        const manualId = String(settings.highlightedComment);
        const manual = eligible.find((c) => String(c._id) === manualId);
        if (manual) {
            featuredCommentId = manualId;
            featuredMode = "manual";
        }
        else {
            // The manually featured comment was deleted or became ineligible —
            // fall back to automatic selection and clear the stale pointer.
            yield post_model_1.Post.updateOne({ _id: postId, "commentSettings.highlightedComment": settings.highlightedComment }, {
                $set: {
                    "commentSettings.highlightMode": "AUTO",
                    "commentSettings.highlightedComment": null,
                },
            });
        }
    }
    if (!featuredCommentId && eligible.length > 0) {
        const strong = eligible.filter((c) => {
            const r = rankables.get(String(c._id));
            return r.reactions + r.replies >= STRONG_ENGAGEMENT_MIN;
        });
        if (strong.length > 0) {
            let winner = strong[0];
            let winnerScore = engagementScore(rankables.get(String(winner._id)), now);
            for (const candidate of strong.slice(1)) {
                const score = engagementScore(rankables.get(String(candidate._id)), now);
                if (score > winnerScore ||
                    (score === winnerScore &&
                        ((_g = (_f = candidate.createdAt) === null || _f === void 0 ? void 0 : _f.getTime()) !== null && _g !== void 0 ? _g : 0) <
                            ((_j = (_h = winner.createdAt) === null || _h === void 0 ? void 0 : _h.getTime()) !== null && _j !== void 0 ? _j : 0))) {
                    winner = candidate;
                    winnerScore = score;
                }
            }
            featuredCommentId = String(winner._id);
            featuredMode = "automatic";
        }
        else {
            // No meaningful engagement yet → the most recent eligible comment.
            const mostRecent = eligible.reduce((best, c) => { var _a, _b, _c, _d; return ((_b = (_a = c.createdAt) === null || _a === void 0 ? void 0 : _a.getTime()) !== null && _b !== void 0 ? _b : 0) > ((_d = (_c = best.createdAt) === null || _c === void 0 ? void 0 : _c.getTime()) !== null && _d !== void 0 ? _d : 0) ? c : best; });
            featuredCommentId = String(mostRecent._id);
            featuredMode = "automatic";
        }
    }
    return {
        // Flat list (top-level in sorted order, then replies chronologically) —
        // clients rebuild the tree from `parentComment` pointers.
        comments: [...sortedTop, ...sortedReplies],
        sortMode,
        featuredCommentId,
        featuredMode,
    };
});
const getCommentsForShortFromDB = (shortId, query, requester) => __awaiter(void 0, void 0, void 0, function* () {
    if (!mongoose_1.default.Types.ObjectId.isValid(shortId)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
    }
    const short = yield short_model_1.Short.findById(shortId);
    if (!short)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
    yield short_service_1.ShortService.assertCanViewShort(short, requester);
    const sortMode = resolveSortMode(query.sort, "NEWEST");
    const pool = yield fetchCommentPool({ short: shortId });
    const topLevel = pool.filter((c) => !c.parentComment);
    const replies = pool.filter((c) => c.parentComment);
    const sortedTop = [...topLevel].sort((a, b) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        return sortMode === "OLDEST"
            ? ((_b = (_a = a.createdAt) === null || _a === void 0 ? void 0 : _a.getTime()) !== null && _b !== void 0 ? _b : 0) - ((_d = (_c = b.createdAt) === null || _c === void 0 ? void 0 : _c.getTime()) !== null && _d !== void 0 ? _d : 0)
            : sortMode === "TOP"
                ? (((_f = (_e = b.createdAt) === null || _e === void 0 ? void 0 : _e.getTime()) !== null && _f !== void 0 ? _f : 0) - ((_h = (_g = a.createdAt) === null || _g === void 0 ? void 0 : _g.getTime()) !== null && _h !== void 0 ? _h : 0))
                : ((_k = (_j = b.createdAt) === null || _j === void 0 ? void 0 : _j.getTime()) !== null && _k !== void 0 ? _k : 0) - ((_m = (_l = a.createdAt) === null || _l === void 0 ? void 0 : _l.getTime()) !== null && _m !== void 0 ? _m : 0);
    });
    const sortedReplies = [...replies].sort((a, b) => { var _a, _b, _c, _d; return ((_b = (_a = a.createdAt) === null || _a === void 0 ? void 0 : _a.getTime()) !== null && _b !== void 0 ? _b : 0) - ((_d = (_c = b.createdAt) === null || _c === void 0 ? void 0 : _c.getTime()) !== null && _d !== void 0 ? _d : 0); });
    return {
        comments: [...sortedTop, ...sortedReplies],
        sortMode,
        featuredCommentId: null,
        featuredMode: "none",
    };
});
const assertCanModifyComment = (comment, requester) => {
    const isOwner = String(comment.user) === requester.id;
    if (!isOwner && requester.role !== "ADMIN") {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are not allowed to modify this comment");
    }
};
// Update a comment by ID (owner or admin only)
const updateCommentIntoDB = (commentId, updateData, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield comment_model_1.Comment.findById(commentId);
    if (!existing || existing.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Comment not found");
    }
    assertCanModifyComment(existing, requester);
    // Only text/images are content; ownership fields are never writable here.
    const allowed = {};
    if (updateData.text !== undefined)
        allowed.text = updateData.text;
    if (updateData.images !== undefined)
        allowed.images = updateData.images;
    if (updateData.text !== undefined && updateData.text !== existing.text) {
        allowed.editedAt = new Date();
    }
    const comment = yield comment_model_1.Comment.findByIdAndUpdate(commentId, allowed, {
        new: true,
    });
    if (!comment || comment.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Comment not found");
    }
    return comment;
});
/**
 * Delete a comment by ID (owner or admin only).
 *
 * Deletion is a SOFT delete: the row survives so reply threads keep their
 * parent linkage and render as a neutral placeholder instead of orphaning
 * children. Top-level comments are also removed from the post's comment-id
 * list (keeps counts accurate) and a manual featured-comment pointer at this
 * comment gracefully returns the post to automatic highlighting.
 */
const deleteCommentFromDB = (commentId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield comment_model_1.Comment.findById(commentId);
    if (!existing) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Comment not found");
    }
    assertCanModifyComment(existing, requester);
    if (existing.isDeleted) {
        // Idempotent: repeating a delete is not an error (retry safety).
        return;
    }
    if (existing.short) {
        yield short_model_1.Short.updateOne({ _id: existing.short }, { $inc: { commentCount: -1 } });
    }
    // Soft delete: keep the document (thread integrity) but blank the content
    // so deleted text never leaks through list/populate responses.
    yield comment_model_1.Comment.findByIdAndUpdate(commentId, {
        isDeleted: true,
        text: "",
        editedAt: null,
    });
    // Top-level comment → drop from the post's comment id list.
    if (existing.post && !existing.parentComment) {
        yield post_model_1.Post.updateOne({ _id: existing.post }, { $pull: { comments: commentId } });
    }
    // A manual featured pointer at this comment falls back to automatic.
    if (existing.post) {
        yield post_model_1.Post.updateOne({
            _id: existing.post,
            "commentSettings.highlightedComment": commentId,
        }, {
            $set: {
                "commentSettings.highlightMode": "AUTO",
                "commentSettings.highlightedComment": null,
            },
        });
    }
});
// Reply to a comment (target is inherited from the parent so a reply can
// never be attached to a different post/short than its parent). Replying to
// a reply is allowed — clients flatten deep levels visually while keeping
// the original parent/reply relationship.
const replyToCommentFromDB = (commentId, replyData, id, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const comment = yield comment_model_1.Comment.findById(commentId);
    if (!comment || comment.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Comment not found");
    }
    if (comment.short) {
        const short = yield short_model_1.Short.findById(String(comment.short));
        if (short) {
            const req = requester !== null && requester !== void 0 ? requester : { id, role: "USER" };
            yield short_service_1.ShortService.assertCanInteractWithShort(short, req);
        }
        const reply = yield comment_model_1.Comment.create({
            text: replyData.text,
            images: (_a = replyData.images) !== null && _a !== void 0 ? _a : [],
            user: id,
            short: comment.short,
            parentComment: comment._id,
        });
        yield short_model_1.Short.updateOne({ _id: comment.short }, { $inc: { commentCount: 1 } });
        yield comment_model_1.Comment.findByIdAndUpdate(commentId, { $push: { replies: reply._id } });
        return reply;
    }
    if (comment.post && requester) {
        const post = yield post_model_1.Post.findById(String(comment.post));
        if (post) {
            yield (0, postAccess_1.assertCanInteractWithPost)(post, requester);
        }
    }
    const reply = yield comment_model_1.Comment.create(Object.assign(Object.assign({}, replyData), { user: id, short: null, post: (_b = comment.post) !== null && _b !== void 0 ? _b : replyData.post, parentComment: comment._id }));
    yield comment_model_1.Comment.findByIdAndUpdate(commentId, { $push: { replies: reply._id } });
    return reply;
});
exports.CommentService = {
    addCommentIntoDB,
    getAllCommentFromDB,
    getCommentForPostFromDB,
    getCommentsForShortFromDB,
    updateCommentIntoDB,
    deleteCommentFromDB,
    replyToCommentFromDB,
};
