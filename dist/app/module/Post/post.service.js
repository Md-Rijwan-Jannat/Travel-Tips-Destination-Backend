"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostService = exports.notifyGroupOfNewPost = void 0;
const post_model_1 = require("./post.model");
const postHidden_model_1 = require("./postHidden.model");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const QueryBuilder_1 = __importDefault(require("../../builder/QueryBuilder"));
const post_constants_1 = require("./post.constants");
const mongoose_1 = __importDefault(require("mongoose"));
const group_model_1 = require("../Group/group.model");
const group_permissions_1 = require("../Group/group.permissions");
const group_constants_1 = require("../Group/group.constants");
const group_permissions_2 = require("../Group/group.permissions");
const postAccess_1 = require("./postAccess");
const notification_service_1 = require("../Notification/notification.service");
const comment_model_1 = require("../Comment/comment.model");
/**
 * Post ids the caller hid from their OWN feed. Hiding is scoped to the user
 * and never modifies the original post for anyone else.
 */
const getHiddenPostIds = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const rows = yield postHidden_model_1.PostHidden.find({ user: userId })
        .select('post')
        .lean();
    return rows.map((row) => row.post);
});
// Create a new post. When `group` is present the request is authorized
// against the community permission layer: membership, role, posting
// settings and post-approval (moderation) state are all decided server-side.
const createPostIntoDB = (payload, userId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const req = requester !== null && requester !== void 0 ? requester : { id: userId, role: 'USER' };
    const _a = payload, { group: rawGroup } = _a, rest = __rest(_a, ["group"]);
    if (!rawGroup) {
        const post = yield post_model_1.Post.create(Object.assign(Object.assign({}, rest), { user: userId }));
        return post;
    }
    const group = yield group_permissions_1.GroupPermissionService.loadGroup(String(rawGroup));
    const membership = yield group_permissions_1.GroupPermissionService.getMembership(group._id, userId);
    if (!group_permissions_1.GroupPermissionService.canViewGroup(group, membership, req)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Group not found');
    }
    if (group_permissions_1.GroupPermissionService.isBanned(membership)) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'You are banned from this group');
    }
    // Membership + `group:post` permission (member-only posting, mute/ban).
    group_permissions_1.GroupPermissionService.assert(group, membership, req, 'group:post');
    if (group.mutedUsers.some((id) => String(id) === userId)) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'You are muted in this group');
    }
    const isStaff = req.role === 'ADMIN' ||
        (membership !== null &&
            (0, group_permissions_2.isStaffRole)(membership.role) &&
            group_permissions_1.GroupPermissionService.isActiveMember(membership));
    // Posting-roles policy: ADMINS-only groups reject ordinary members.
    if (group.postPermission === 'ADMINS' && !isStaff) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Only admins can post in this group');
    }
    // Approval toggle decides the moderation state. Staff posts publish
    // immediately; ordinary member posts become PENDING when approval is ON.
    const moderationStatus = group.postApprovalEnabled && !isStaff
        ? group_constants_1.GROUP_MODERATION_STATUS.PENDING
        : group_constants_1.GROUP_MODERATION_STATUS.APPROVED;
    const post = yield post_model_1.Post.create(Object.assign(Object.assign({}, rest), { user: userId, group: group._id, groupVisibility: group.visibility, moderationStatus }));
    if (moderationStatus === group_constants_1.GROUP_MODERATION_STATUS.APPROVED) {
        yield notifyGroupOfNewPost(group._id, userId, post);
    }
    return post;
});
// Fan-out: notify approved members of a newly published group post,
// respecting the group-level notification preference. Capped to avoid
// write storms in very large groups.
const notifyGroupOfNewPost = (groupId, authorId, post) => __awaiter(void 0, void 0, void 0, function* () {
    const group = yield group_model_1.Group.findById(groupId)
        .select('name slug notifyOnNewPost memberCount');
    if (!group || !group.notifyOnNewPost)
        return;
    const { GroupMembership } = yield Promise.resolve().then(() => __importStar(require('../Group/groupMembership.model')));
    const recipients = yield GroupMembership.find({
        group: groupId,
        status: 'APPROVED',
        user: { $ne: authorId },
        mutedNotifications: { $ne: true },
    })
        .limit(100)
        .distinct('user');
    yield Promise.all(recipients.map((recipient) => notification_service_1.NotificationService.createNotificationIntoDB({
        recipient: String(recipient),
        actor: authorId,
        type: 'group.new_post',
        title: `New post in ${group.name}`,
        body: post.title,
        link: `/groups/${group.slug}?post=${String(post._id)}`,
        entityType: 'post',
        entityId: String(post._id),
        groupId: String(groupId),
    })));
});
exports.notifyGroupOfNewPost = notifyGroupOfNewPost;
// Get a post by ID (private group posts and non-approved posts are hidden
// from unauthorized requesters with the same 404 as a missing post).
const getPostByIdFromDB = (postId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield post_model_1.Post.findById(postId).populate('user comments');
    if (!post || post.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Post not found');
    }
    if (requester) {
        yield (0, postAccess_1.assertCanViewPost)(post, requester);
    }
    return post;
});
// Get all posts for normal posts
const getAllPostsNormalForAnalytics = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const postQueryBuilder = new QueryBuilder_1.default(post_model_1.Post.find({ isDeleted: false, status: 'FREE' })
        .populate({
        path: 'user',
    })
        .populate({
        path: 'comments',
        populate: {
            path: 'user',
            model: 'User',
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
    const postQueryBuilder = new QueryBuilder_1.default(post_model_1.Post.find({ isDeleted: false, status: 'PREMIUM' })
        .populate({
        path: 'user',
    })
        .populate({
        path: 'comments',
        populate: {
            path: 'user',
            model: 'User',
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
// Get all posts (with optional filters). `requester` scopes the feed so
// posts the caller hid from their own feed are excluded (the original post
// stays visible to everyone else).
const getAllPostsFromDB = (query, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const { categories } = query;
    // Global feed never exposes private-group posts or unapproved group posts.
    let queryObj = Object.assign({ isDeleted: false, status: 'FREE' }, postAccess_1.isGloballyVisibleFilter);
    if (categories) {
        queryObj = Object.assign(Object.assign({}, queryObj), { category: { $in: categories } });
    }
    const hiddenIds = requester ? yield getHiddenPostIds(requester.id) : [];
    if (hiddenIds.length > 0) {
        queryObj._id = { $nin: hiddenIds };
    }
    // Build the post query
    const postQueryBuilder = new QueryBuilder_1.default(post_model_1.Post.find(queryObj)
        .populate({
        path: 'user',
    })
        .populate({
        path: 'comments',
        populate: {
            path: 'user',
            model: 'User',
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
const getAllPremiumPostsFromDB = (query, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const { categories } = query;
    let queryObj = Object.assign({ isDeleted: false, status: 'PREMIUM' }, postAccess_1.isGloballyVisibleFilter);
    if (categories) {
        queryObj = Object.assign(Object.assign({}, queryObj), { category: { $in: categories } });
    }
    const hiddenIds = requester ? yield getHiddenPostIds(requester.id) : [];
    if (hiddenIds.length > 0) {
        queryObj._id = { $nin: hiddenIds };
    }
    // Build the post query
    const postQueryBuilder = new QueryBuilder_1.default(post_model_1.Post.find(queryObj)
        .populate({
        path: 'user',
    })
        .populate({
        path: 'comments',
        populate: {
            path: 'user',
            model: 'User',
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
// Fields an owner may change through the update endpoint. Ownership/integrity
// fields (user, reportCount, isDeleted, ...) are never writable by the client.
const EDITABLE_POST_FIELDS = [
    'title',
    'description',
    'images',
    'category',
    'status',
    'location',
    'tags',
    'mediaLayout',
];
// Content fields whose change marks the post as edited.
const EDIT_MARKER_FIELDS = [
    'title',
    'description',
    'images',
    'location',
    'tags',
    'mediaLayout',
];
const assertCanModifyPost = (post, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const isOwner = String(post.user) === requester.id;
    if (isOwner || requester.role === 'ADMIN')
        return;
    // Group staff may edit posts inside their group.
    if (post.group) {
        const group = yield group_model_1.Group.findById(String(post.group));
        if (group && !group.isDeleted) {
            const membership = yield group_permissions_1.GroupPermissionService.getMembership(group._id, requester.id);
            if (group_permissions_1.GroupPermissionService.isActiveMember(membership) &&
                membership &&
                (membership.role === group_constants_1.GROUP_ROLE.OWNER ||
                    membership.role === group_constants_1.GROUP_ROLE.ADMIN ||
                    membership.role === group_constants_1.GROUP_ROLE.MODERATOR)) {
                return;
            }
        }
    }
    throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'You are not allowed to modify this post');
});
// Update a post by ID (owner or admin only)
const updatePostIntoDB = (postId, payload, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield post_model_1.Post.findById(postId);
    if (!existing || existing.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Post not found');
    }
    yield assertCanModifyPost(existing, requester);
    const allowed = {};
    for (const field of EDITABLE_POST_FIELDS) {
        if (payload[field] !== undefined) {
            allowed[field] = payload[field];
        }
    }
    // Content changes are marked as edited (caption/media/layout) so readers
    // see an honest "Edited" indicator. Pure metadata (category/status) is not
    // an edit of the visible content.
    const contentChanged = EDIT_MARKER_FIELDS.some((field) => payload[field] !== undefined);
    if (contentChanged) {
        allowed.isEdited = true;
        allowed.editedAt = new Date();
    }
    const post = yield post_model_1.Post.findByIdAndUpdate(postId, allowed, { new: true });
    if (!post) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Post not found');
    }
    return post;
});
// Delete a post by ID (soft delete, owner or admin only)
const deletePostFromDB = (postId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield post_model_1.Post.findById(postId);
    if (!existing) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Post not found');
    }
    yield assertCanModifyPost(existing, requester);
    const post = yield post_model_1.Post.findByIdAndUpdate(postId, { isDeleted: true }, { new: true });
    if (!post) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Post not found');
    }
    return post;
});
// Delete a post by ID (soft delete)
const recoverPostFromDB = (postId) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield post_model_1.Post.findByIdAndUpdate(postId, { isDeleted: false }, { new: true });
    if (!post) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Post not found');
    }
    return post;
});
const reportPostFromDB = (postId, payload, userId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    if (!mongoose_1.default.Types.ObjectId.isValid(postId)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid Post ID');
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(userId)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid User ID');
    }
    // Find the post first to check the reportCount
    const post = yield post_model_1.Post.findById(postId);
    if (!post) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Post not found');
    }
    // Reporting requires read access (never confirm private group content).
    yield (0, postAccess_1.assertCanViewPost)(post, requester !== null && requester !== void 0 ? requester : { id: userId, role: 'USER' });
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
/* ------------------------------------------------------------------ */
/* Profile pin / highlight / hide / comment settings                   */
/* ------------------------------------------------------------------ */
/** Profile pin & feature are owner-scoped (or platform admin) only. */
const assertIsOwnerOrAdmin = (post, requester) => {
    const isOwner = String(post.user) === requester.id;
    if (!isOwner && requester.role !== 'ADMIN') {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Only the post owner can do this');
    }
};
const loadExistingPost = (postId) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield post_model_1.Post.findById(postId);
    if (!post || post.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Post not found');
    }
    return post;
});
/**
 * Atomically move the author's single profile pin to `postId` (or remove it).
 * The partial unique index guarantees one pinned post per author; the E11000
 * retry makes concurrent pin requests resolve to a consistent single winner.
 */
const setProfilePinFromDB = (postId, pinned, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield loadExistingPost(postId);
    assertIsOwnerOrAdmin(post, requester);
    if (!pinned) {
        const updated = yield post_model_1.Post.findByIdAndUpdate(postId, { $set: { pinned: false, pinnedAt: null } }, { new: true });
        return updated;
    }
    // Release any other pin held by this author first (sequential correctness
    // even if indexes have not been built yet), then set this one.
    yield post_model_1.Post.updateMany({ user: post.user, pinned: true, _id: { $ne: postId } }, { $set: { pinned: false, pinnedAt: null } });
    const attempt = () => post_model_1.Post.findOneAndUpdate({ _id: postId }, { $set: { pinned: true, pinnedAt: new Date() } }, { new: true });
    try {
        const updated = yield attempt();
        if (!updated)
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Post not found');
        return updated;
    }
    catch (error) {
        const isDuplicate = error instanceof Error &&
            'code' in error &&
            error.code === 11000;
        if (!isDuplicate)
            throw error;
        // Another post of this author currently holds the pin slot — release it
        // and retry once (the latest writer wins).
        yield post_model_1.Post.updateMany({ user: post.user, pinned: true, _id: { $ne: postId } }, { $set: { pinned: false, pinnedAt: null } });
        const updated = yield attempt();
        if (!updated)
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Post not found');
        return updated;
    }
});
/** Move the author's single profile highlight/feature to `postId` (or clear). */
const setProfileFeatureFromDB = (postId, featured, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield loadExistingPost(postId);
    assertIsOwnerOrAdmin(post, requester);
    if (!featured) {
        const updated = yield post_model_1.Post.findByIdAndUpdate(postId, { $set: { featured: false, featuredAt: null } }, { new: true });
        return updated;
    }
    // Same release-then-set pattern as profile pinning.
    yield post_model_1.Post.updateMany({ user: post.user, featured: true, _id: { $ne: postId } }, { $set: { featured: false, featuredAt: null } });
    const attempt = () => post_model_1.Post.findOneAndUpdate({ _id: postId }, { $set: { featured: true, featuredAt: new Date() } }, { new: true });
    try {
        const updated = yield attempt();
        if (!updated)
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Post not found');
        return updated;
    }
    catch (error) {
        const isDuplicate = error instanceof Error &&
            'code' in error &&
            error.code === 11000;
        if (!isDuplicate)
            throw error;
        yield post_model_1.Post.updateMany({ user: post.user, featured: true, _id: { $ne: postId } }, { $set: { featured: false, featuredAt: null } });
        const updated = yield attempt();
        if (!updated)
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Post not found');
        return updated;
    }
});
/**
 * Group pin — separate from profile pinning: requires the `group:moderatePost`
 * permission in the post's community group and is limited to
 * GROUP_PIN_LIMIT simultaneously pinned posts per group.
 */
const setGroupPinFromDB = (postId, pinned, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield loadExistingPost(postId);
    if (!post.group) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Only group posts can be pinned here');
    }
    const { group } = yield group_permissions_1.GroupPermissionService.authorize(String(post.group), requester, 'group:moderatePost');
    if (!pinned) {
        const updated = yield post_model_1.Post.findByIdAndUpdate(postId, { $set: { groupPinnedAt: null } }, { new: true });
        return updated;
    }
    const existingPinned = yield post_model_1.Post.countDocuments({
        group: group._id,
        groupPinnedAt: { $ne: null },
        isDeleted: false,
        _id: { $ne: postId },
    });
    if (existingPinned >= post_constants_1.GROUP_PIN_LIMIT) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, `A group can pin at most ${post_constants_1.GROUP_PIN_LIMIT} posts`);
    }
    const updated = yield post_model_1.Post.findByIdAndUpdate(postId, { $set: { groupPinnedAt: new Date() } }, { new: true });
    if (!updated)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Post not found');
    return updated;
});
/** Hide a post from the caller's own feed (idempotent, scoped to the user). */
const hidePostForUserFromDB = (postId, userId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield post_model_1.Post.findById(postId);
    if (!post || post.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Post not found');
    }
    // Hiding requires read access (never confirm private group content).
    yield (0, postAccess_1.assertCanViewPost)(post, requester);
    yield postHidden_model_1.PostHidden.updateOne({ user: userId, post: postId }, { $setOnInsert: { user: userId, post: postId } }, { upsert: true });
    return { hidden: true };
});
/** Undo a per-user hide. */
const unhidePostForUserFromDB = (postId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    yield postHidden_model_1.PostHidden.deleteOne({ user: userId, post: postId });
    return { hidden: false };
});
/** Persist the post owner's comment ordering + featured-comment policy. */
const updateCommentSettingsFromDB = (postId, payload, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const post = yield loadExistingPost(postId);
    // Group moderation staff may sort, but only the OWNER picks the featured
    // comment (moderators never override the owner's highlight preference).
    assertIsOwnerOrAdmin(post, requester);
    const update = {};
    if (payload.sortMode !== undefined) {
        update['commentSettings.sortMode'] = payload.sortMode;
    }
    if (payload.highlightMode !== undefined) {
        update['commentSettings.highlightMode'] = payload.highlightMode;
        if (payload.highlightMode === 'AUTO') {
            update['commentSettings.highlightedComment'] = null;
        }
    }
    if (payload.highlightedComment !== undefined) {
        if (payload.highlightedComment === null) {
            update['commentSettings.highlightMode'] = 'AUTO';
            update['commentSettings.highlightedComment'] = null;
        }
        else {
            if (!mongoose_1.default.Types.ObjectId.isValid(payload.highlightedComment)) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid comment id');
            }
            const comment = yield comment_model_1.Comment.findById(payload.highlightedComment);
            if (!comment ||
                comment.isDeleted ||
                String((_a = comment.post) !== null && _a !== void 0 ? _a : '') !== postId) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'The featured comment must be a visible comment on this post');
            }
            update['commentSettings.highlightMode'] = 'MANUAL';
            update['commentSettings.highlightedComment'] = comment._id;
        }
    }
    const updated = yield post_model_1.Post.findByIdAndUpdate(postId, update, { new: true });
    if (!updated)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Post not found');
    return updated;
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
    setProfilePinFromDB,
    setProfileFeatureFromDB,
    setGroupPinFromDB,
    hidePostForUserFromDB,
    unhidePostForUserFromDB,
    updateCommentSettingsFromDB,
    getHiddenPostIds,
};
