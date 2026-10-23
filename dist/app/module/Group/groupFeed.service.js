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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupFeedService = void 0;
const http_status_1 = __importDefault(require("http-status"));
const mongoose_1 = require("mongoose");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const post_model_1 = require("../Post/post.model");
const post_service_1 = require("../Post/post.service");
const group_constants_1 = require("./group.constants");
const group_permissions_1 = require("./group.permissions");
const group_service_1 = require("./group.service");
const notification_service_1 = require("../Notification/notification.service");
const groupMembership_model_1 = require("./groupMembership.model");
const group_model_1 = require("./group.model");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isStaffOf = (membership, requester) => {
    if (requester.role === "ADMIN")
        return true;
    if (!membership)
        return false;
    return (0, group_permissions_1.isStaffRole)(membership.role);
};
/**
 * Group feed. Approved posts are visible to anyone who may view the group;
 * pending/rejected posts are visible ONLY to their author and group staff.
 */
const getGroupFeedFromDB = (groupIdOrSlug, query, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const group = yield group_permissions_1.GroupPermissionService.loadGroup(groupIdOrSlug);
    const membership = yield group_permissions_1.GroupPermissionService.getMembership(group._id, requester.id);
    if (!group_permissions_1.GroupPermissionService.canViewGroup(group, membership, requester)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Group not found");
    }
    const staff = isStaffOf(membership, requester);
    const approvedClause = {
        moderationStatus: group_constants_1.GROUP_MODERATION_STATUS.APPROVED,
    };
    const authorClause = {
        moderationStatus: {
            $in: [group_constants_1.GROUP_MODERATION_STATUS.PENDING, group_constants_1.GROUP_MODERATION_STATUS.REJECTED],
        },
        user: requester.id,
    };
    const staffClause = {
        moderationStatus: {
            $in: [
                group_constants_1.GROUP_MODERATION_STATUS.PENDING,
                group_constants_1.GROUP_MODERATION_STATUS.REJECTED,
                group_constants_1.GROUP_MODERATION_STATUS.REMOVED,
            ],
        },
    };
    const base = {
        group: group._id,
        isDeleted: false,
        $or: staff ? [approvedClause, authorClause, staffClause] : [approvedClause, authorClause],
    };
    const page = Math.max(1, parseInt(String((_a = query.page) !== null && _a !== void 0 ? _a : "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String((_b = query.limit) !== null && _b !== void 0 ? _b : "10"), 10) || 10));
    const filter = Object.assign({}, base);
    if (query.category)
        filter.category = query.category;
    if (query.search && typeof query.search === "string") {
        const safe = escapeRegex(String(query.search));
        filter.$and = [
            {
                $or: [
                    { title: { $regex: safe, $options: "i" } },
                    { description: { $regex: safe, $options: "i" } },
                ],
            },
        ];
    }
    const [items, total] = yield Promise.all([
        post_model_1.Post.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("user", "name image email verified")
            .populate({
            path: "comments",
            populate: { path: "user", select: "name image" },
        }),
        post_model_1.Post.countDocuments(filter),
    ]);
    return {
        result: items,
        meta: { page, limit, total, totalPage: Math.ceil(total / limit) || 1 },
        context: {
            myRole: (_c = membership === null || membership === void 0 ? void 0 : membership.role) !== null && _c !== void 0 ? _c : null,
            myStatus: (_d = membership === null || membership === void 0 ? void 0 : membership.status) !== null && _d !== void 0 ? _d : null,
            isStaff: staff,
            postApprovalEnabled: group.postApprovalEnabled,
            postPermission: group.postPermission,
            chatEnabled: group.chatEnabled,
            visibility: group.visibility,
            canPost: !!membership && membership.status === "APPROVED",
        },
    };
});
/** Create a post inside a group (delegates to the shared Post pipeline). */
const createGroupPostIntoDB = (groupIdOrSlug, payload, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // Fail fast with the same 404 as an unknown group before delegating.
    const group = yield group_permissions_1.GroupPermissionService.loadGroup(groupIdOrSlug);
    const post = yield post_service_1.PostService.createPostIntoDB({
        title: payload.title,
        description: payload.description,
        images: payload.images,
        // Group posts default to a neutral travel category; group discovery
        // uses the group's own category instead.
        category: (_a = payload.category) !== null && _a !== void 0 ? _a : "Other",
        status: "FREE",
        location: payload.location ? String(payload.location) : null,
        tags: Array.isArray(payload.tags)
            ? payload.tags.slice(0, 20).map((t) => String(t))
            : [],
        // Delegation must know which group the post belongs to — this is what
        // triggers the membership/approval pipeline in createPostIntoDB.
        group: String(group._id),
    }, requester.id, requester);
    return post;
});
/** Moderation queue: PENDING / APPROVED / REJECTED / REMOVED / REPORTED. */
const getModerationQueueFromDB = (groupIdOrSlug, query, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const { group, membership } = yield group_permissions_1.GroupPermissionService.authorize(groupIdOrSlug, requester, "group:moderatePost");
    void membership;
    const status = String((_a = query.status) !== null && _a !== void 0 ? _a : group_constants_1.GROUP_MODERATION_STATUS.PENDING);
    const page = Math.max(1, parseInt(String((_b = query.page) !== null && _b !== void 0 ? _b : "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String((_c = query.limit) !== null && _c !== void 0 ? _c : "20"), 10) || 20));
    const filter = { group: group._id, isDeleted: false };
    if (status === "REPORTED") {
        filter.reportCount = { $gt: 0 };
    }
    else if (Object.values(group_constants_1.GROUP_MODERATION_STATUS).includes(status)) {
        filter.moderationStatus = status;
    }
    else {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid moderation status filter");
    }
    const [items, total] = yield Promise.all([
        post_model_1.Post.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("user", "name image email")
            .populate({ path: "comments", populate: { path: "user", select: "name image" } }),
        post_model_1.Post.countDocuments(filter),
    ]);
    return {
        result: items,
        meta: { page, limit, total, totalPage: Math.ceil(total / limit) || 1 },
    };
});
/**
 * Staff-only moderation transition. Every transition is audited and the
 * author is notified (approve/reject/remove). The post MUST belong to the
 * group in the path (resource-in-group check).
 */
const moderatePostIntoDB = (groupIdOrSlug, postId, action, reason, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { group } = yield group_permissions_1.GroupPermissionService.authorize(groupIdOrSlug, requester, "group:moderatePost");
    if (!mongoose_1.Types.ObjectId.isValid(postId)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
    }
    const post = yield post_model_1.Post.findOne({ _id: postId, group: group._id, isDeleted: false });
    if (!post)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
    // Only group staff (or a platform admin) reaches this endpoint at all —
    // the route is gated on `group:moderatePost`, so an ordinary author can
    // never approve their own pending post. Staff actions are audited below.
    const now = new Date();
    const previous = post.moderationStatus;
    switch (action) {
        case "approve":
            post.moderationStatus = group_constants_1.GROUP_MODERATION_STATUS.APPROVED;
            post.moderationReason = null;
            break;
        case "reject":
            post.moderationStatus = group_constants_1.GROUP_MODERATION_STATUS.REJECTED;
            post.moderationReason = reason !== null && reason !== void 0 ? reason : "This post does not meet the group rules.";
            break;
        case "remove":
            post.moderationStatus = group_constants_1.GROUP_MODERATION_STATUS.REMOVED;
            post.moderationReason = reason !== null && reason !== void 0 ? reason : "Removed by a group moderator.";
            break;
        case "restore":
            post.moderationStatus = group_constants_1.GROUP_MODERATION_STATUS.APPROVED;
            post.moderationReason = null;
            break;
        default:
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid moderation action");
    }
    post.moderatedBy = new mongoose_1.Types.ObjectId(requester.id);
    post.moderatedAt = now;
    yield post.save();
    const actionLog = {
        approve: group_constants_1.GROUP_ACTIVITY_ACTION.POST_APPROVED,
        reject: group_constants_1.GROUP_ACTIVITY_ACTION.POST_REJECTED,
        remove: group_constants_1.GROUP_ACTIVITY_ACTION.POST_REMOVED,
        restore: group_constants_1.GROUP_ACTIVITY_ACTION.POST_RESTORED,
    };
    yield (0, group_service_1.logGroupActivity)(group._id, requester.id, actionLog[action], {
        targetType: "post",
        targetId: String(post._id),
        metadata: { from: previous, to: post.moderationStatus, reason: reason !== null && reason !== void 0 ? reason : null },
    });
    const notifyAuthor = (title, body) => __awaiter(void 0, void 0, void 0, function* () {
        yield notification_service_1.NotificationService.createNotificationIntoDB({
            recipient: String(post.user),
            actor: requester.id,
            type: `group.post_${action}`,
            title,
            body,
            link: `/groups/${group.slug}?post=${String(post._id)}`,
            entityType: "post",
            entityId: String(post._id),
            groupId: String(group._id),
            dedupe: true,
        });
    });
    if (action === "approve" || action === "restore") {
        yield notifyAuthor(action === "approve" ? "Your post was approved" : "Your post was restored", `Your post is now visible in ${group.name}.`);
        if (previous !== group_constants_1.GROUP_MODERATION_STATUS.APPROVED) {
            yield (0, post_service_1.notifyGroupOfNewPost)(group._id, String(post.user), post);
        }
    }
    else if (action === "reject") {
        yield notifyAuthor("Your post was not approved", `${post.moderationReason} — Only you can see this status.`);
    }
    else if (action === "remove") {
        yield notifyAuthor("Your post was removed by group staff", (_a = post.moderationReason) !== null && _a !== void 0 ? _a : undefined);
    }
    return post;
});
/** Mute/unmute a member (restricted members cannot post or comment). */
const setMemberMutedIntoDB = (groupIdOrSlug, targetUserId, muted, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const { group } = yield group_permissions_1.GroupPermissionService.authorize(groupIdOrSlug, requester, "group:manageMembers");
    if (targetUserId === String(group.owner)) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "The owner cannot be muted");
    }
    const membership = yield groupMembership_model_1.GroupMembership.findOne({
        group: group._id,
        user: targetUserId,
    });
    if (!membership || membership.status !== "APPROVED") {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Member not found in this group");
    }
    if (muted) {
        yield group_model_1.Group.updateOne({ _id: group._id }, { $addToSet: { mutedUsers: new mongoose_1.Types.ObjectId(targetUserId) } });
    }
    else {
        yield group_model_1.Group.updateOne({ _id: group._id }, { $pull: { mutedUsers: new mongoose_1.Types.ObjectId(targetUserId) } });
    }
    yield (0, group_service_1.logGroupActivity)(group._id, requester.id, group_constants_1.GROUP_ACTIVITY_ACTION.SETTINGS_UPDATED, {
        targetType: "user",
        targetId: targetUserId,
        metadata: { muted },
    });
    yield notification_service_1.NotificationService.createNotificationIntoDB({
        recipient: targetUserId,
        actor: requester.id,
        type: muted ? "group.muted" : "group.unmuted",
        title: muted
            ? `You were muted in ${group.name}`
            : `You can post again in ${group.name}`,
        link: `/groups/${group.slug}`,
        entityType: "group",
        entityId: String(group._id),
        groupId: String(group._id),
    });
});
const getShortsFromDB = (groupIdOrSlug, query, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const group = yield group_permissions_1.GroupPermissionService.loadGroup(groupIdOrSlug);
    const membership = yield group_permissions_1.GroupPermissionService.getMembership(group._id, requester.id);
    if (!group_permissions_1.GroupPermissionService.canViewGroup(group, membership, requester)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Group not found");
    }
    // Group shorts are member-only, even in PUBLIC groups (visibility of the
    // group page itself is broader than the short-video content).
    if (requester.role !== "ADMIN" &&
        !group_permissions_1.GroupPermissionService.isActiveMember(membership) &&
        !group_permissions_1.GroupPermissionService.isStaff(membership, requester)) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Join this group to see its shorts");
    }
    const { Short } = yield Promise.resolve().then(() => __importStar(require("../Short/short.model")));
    const page = Math.max(1, parseInt(String((_a = query.page) !== null && _a !== void 0 ? _a : "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String((_b = query.limit) !== null && _b !== void 0 ? _b : "10"), 10) || 10));
    const filter = {
        group: group._id,
        isDeleted: false,
        status: "PUBLISHED",
    };
    // Staff also see their own pending shorts in the group context.
    if (!isStaffOf(membership, requester)) {
        filter.$or = [
            { status: "PUBLISHED" },
            { user: requester.id, status: { $in: ["PENDING", "PROCESSING"] } },
        ];
        delete filter.status;
    }
    const [items, total] = yield Promise.all([
        Short.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("user", "name image verified"),
        Short.countDocuments(filter),
    ]);
    return {
        result: items,
        meta: { page, limit, total, totalPage: Math.ceil(total / limit) || 1 },
    };
});
exports.GroupFeedService = {
    getGroupFeedFromDB,
    createGroupPostIntoDB,
    getModerationQueueFromDB,
    moderatePostIntoDB,
    setMemberMutedIntoDB,
    getShortsFromDB,
};
