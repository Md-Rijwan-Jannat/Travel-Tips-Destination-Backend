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
exports.ShortService = void 0;
const http_status_1 = __importDefault(require("http-status"));
const mongoose_1 = require("mongoose");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const config_1 = __importDefault(require("../../../config"));
const short_model_1 = require("./short.model");
const group_constants_1 = require("../Group/group.constants");
const group_permissions_1 = require("../Group/group.permissions");
const groupMembership_model_1 = require("../Group/groupMembership.model");
const notification_service_1 = require("../Notification/notification.service");
const group_service_1 = require("../Group/group.service");
const group_constants_2 = require("../Group/group.constants");
const user_model_1 = require("../User/user.model");
const post_model_1 = require("../Post/post.model");
const comment_model_1 = require("../Comment/comment.model");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const allowedHosts = () => String(config_1.default.short_allowed_media_hosts)
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
/**
 * Server-side video asset validation. Trusts more than a file extension:
 * the URL must be https, on an allow-listed media host, and (for
 * Cloudinary) must carry the `/video/upload/` RESOURCE-TYPE marker that
 * Cloudinary only assigns to assets uploaded as videos.
 */
const assertVideoUrl = (url) => {
    if (typeof url !== "string" || url.length > 2000) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "A valid video URL is required");
    }
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch (_a) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "A valid video URL is required");
    }
    if (parsed.protocol !== "https:") {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Video must be served over HTTPS");
    }
    const host = parsed.hostname.toLowerCase();
    if (!allowedHosts().some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Video host is not allowed for uploads");
    }
    // Cloudinary marks resource type in the path — videos must be `/video/upload/`.
    if (host.endsWith("cloudinary.com") && !/\/video\/upload\//i.test(parsed.pathname)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "URL must point to a video asset (not an image or other file)");
    }
    return url;
};
const assertImageUrl = (url) => {
    if (url === null || url === undefined || url === "")
        return;
    if (typeof url !== "string" || url.length > 2000) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid cover image URL");
    }
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch (_a) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid cover image URL");
    }
    if (parsed.protocol !== "https:") {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Cover image must be served over HTTPS");
    }
    const host = parsed.hostname.toLowerCase();
    if (!allowedHosts().some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Cover image host is not allowed");
    }
};
/**
 * Optional origin verification (SHORT_REMOTE_VERIFY=true). Confirms the
 * asset actually exists, is a video, and respects the configured size cap.
 * A Short can never leave PROCESSING with a failed or pending verification.
 */
const verifyRemoteVideo = (url) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const maxBytes = (config_1.default.short_max_size_mb || 100) * 1024 * 1024;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
        const response = yield fetch(url, {
            method: "HEAD",
            redirect: "follow",
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new AppError_1.default(http_status_1.default.UNPROCESSABLE_ENTITY, "Uploaded video could not be verified at the origin");
        }
        const contentType = ((_a = response.headers.get("content-type")) !== null && _a !== void 0 ? _a : "").toLowerCase();
        if (contentType && !contentType.startsWith("video/")) {
            throw new AppError_1.default(http_status_1.default.UNPROCESSABLE_ENTITY, "Uploaded asset is not a video");
        }
        const length = Number((_b = response.headers.get("content-length")) !== null && _b !== void 0 ? _b : 0);
        if (length && length > maxBytes) {
            throw new AppError_1.default(http_status_1.default.UNPROCESSABLE_ENTITY, "Video exceeds the maximum allowed size");
        }
    }
    catch (err) {
        if (err instanceof AppError_1.default)
            throw err;
        throw new AppError_1.default(http_status_1.default.UNPROCESSABLE_ENTITY, "Video verification failed, please re-upload");
    }
    finally {
        clearTimeout(timer);
    }
});
/* ------------------------------------------------------------------ */
/* Access helpers (shared with comments/reactions)                     */
/* ------------------------------------------------------------------ */
const audienceAllows = (short, requester, isFollowing) => {
    if (String(short.user) === requester.id)
        return true;
    if (short.audience === group_constants_1.SHORT_AUDIENCE.PUBLIC)
        return true;
    if (short.audience === group_constants_1.SHORT_AUDIENCE.FOLLOWERS)
        return isFollowing;
    return false; // PRIVATE
};
const isFollowingAuthor = (authorId, viewerId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const author = yield user_model_1.User.findById(authorId).select("follower").lean();
    if (!author)
        return false;
    return ((_a = author.follower) !== null && _a !== void 0 ? _a : []).some((id) => String(id) === viewerId);
});
/**
 * Group shorts are visible ONLY to current approved members of the owning
 * group (plus platform admins). Former members lose access — membership is
 * re-checked on every read.
 */
const assertCanViewShort = (short, requester) => __awaiter(void 0, void 0, void 0, function* () {
    if (short.isDeleted || short.status === group_constants_1.SHORT_STATUS.REMOVED) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    }
    if (short.group) {
        // Group-attached shorts are member-only content, even inside PUBLIC
        // groups: viewing requires an approved membership (staff/ADMIN exempt).
        const group = yield group_permissions_1.GroupPermissionService.loadGroup(String(short.group));
        const membership = yield group_permissions_1.GroupPermissionService.getMembership(group._id, requester.id);
        const allowed = requester.role === "ADMIN" ||
            group_permissions_1.GroupPermissionService.isActiveMember(membership) ||
            (String(short.user) === requester.id && !group_permissions_1.GroupPermissionService.isBanned(membership));
        if (!allowed) {
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
        }
    }
    if (String(short.user) === requester.id)
        return;
    if (short.status !== group_constants_1.SHORT_STATUS.PUBLISHED) {
        // Pending/processing/failed shorts: author + staff only.
        let staff = requester.role === "ADMIN";
        if (short.group && !staff) {
            const membership = yield group_permissions_1.GroupPermissionService.getMembership(new mongoose_1.Types.ObjectId(String(short.group)), requester.id);
            staff = group_permissions_1.GroupPermissionService.isStaff(membership, requester);
        }
        if (!staff)
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    }
    const following = yield isFollowingAuthor(String(short.user), requester.id);
    if (!audienceAllows(short, requester, following)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    }
});
/** Write access (comment/like/report) — view + membership + not muted. */
const assertCanInteractWithShort = (short, requester) => __awaiter(void 0, void 0, void 0, function* () {
    yield assertCanViewShort(short, requester);
    if (short.group) {
        const group = yield group_permissions_1.GroupPermissionService.loadGroup(String(short.group));
        const membership = yield group_permissions_1.GroupPermissionService.getMembership(group._id, requester.id);
        if (!group_permissions_1.GroupPermissionService.isActiveMember(membership) && requester.role !== "ADMIN") {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Join the group to interact with its shorts");
        }
        if (group_permissions_1.GroupPermissionService.isBanned(membership)) {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are banned from this group");
        }
        if (group_permissions_1.GroupPermissionService.isActiveMember(membership) && group.mutedUsers.some((id) => String(id) === requester.id)) {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are muted in this group");
        }
    }
});
/* ------------------------------------------------------------------ */
/* Creation                                                            */
/* ------------------------------------------------------------------ */
const createShortIntoDB = (payload, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const video = assertVideoUrl(payload.video);
    assertImageUrl(payload.coverImage);
    const declaredDuration = payload.duration === undefined || payload.duration === null
        ? null
        : Number(payload.duration);
    if (declaredDuration !== null) {
        if (!Number.isFinite(declaredDuration) || declaredDuration < 0) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid video duration");
        }
        if (declaredDuration > (config_1.default.short_max_duration_seconds || 180)) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, `Video must be shorter than ${config_1.default.short_max_duration_seconds || 180} seconds`);
        }
    }
    const declaredSizeBytes = payload.sizeBytes === undefined || payload.sizeBytes === null
        ? null
        : Number(payload.sizeBytes);
    if (declaredSizeBytes !== null) {
        const maxBytes = (config_1.default.short_max_size_mb || 100) * 1024 * 1024;
        if (!Number.isFinite(declaredSizeBytes) || declaredSizeBytes <= 0) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid video size");
        }
        if (declaredSizeBytes > maxBytes) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, `Video must be smaller than ${config_1.default.short_max_size_mb || 100}MB`);
        }
    }
    const audienceValues = Object.values(group_constants_1.SHORT_AUDIENCE);
    const audience = audienceValues.includes(payload.audience)
        ? payload.audience
        : group_constants_1.SHORT_AUDIENCE.PUBLIC;
    const hashtags = Array.isArray(payload.hashtags)
        ? payload.hashtags
            .slice(0, 15)
            .map((t) => String(t).replace(/^#/, "").trim().slice(0, 40))
            .filter(Boolean)
        : [];
    let group = null;
    let groupDoc = null;
    let isStaff = requester.role === "ADMIN";
    if (payload.group) {
        groupDoc = yield group_permissions_1.GroupPermissionService.loadGroup(String(payload.group));
        const membership = yield group_permissions_1.GroupPermissionService.getMembership(groupDoc._id, requester.id);
        if (!group_permissions_1.GroupPermissionService.canViewGroup(groupDoc, membership, requester)) {
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Group not found");
        }
        group_permissions_1.GroupPermissionService.assert(groupDoc, membership, requester, "group:post");
        if (group_permissions_1.GroupPermissionService.isBanned(membership)) {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are banned from this group");
        }
        if (groupDoc.mutedUsers.some((id) => String(id) === requester.id)) {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are muted in this group");
        }
        if (membership &&
            (0, group_permissions_1.isStaffRole)(membership.role) &&
            group_permissions_1.GroupPermissionService.isActiveMember(membership)) {
            isStaff = true;
        }
        if (groupDoc.postPermission === "ADMINS" && !isStaff) {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Only admins can post in this group");
        }
        group = groupDoc._id;
    }
    // Group post-approval rules also govern shorts submitted as group posts.
    const pendingGroupApproval = !!groupDoc && groupDoc.postApprovalEnabled && !isStaff;
    let status = group_constants_1.SHORT_STATUS.PUBLISHED;
    if (pendingGroupApproval) {
        status = group_constants_1.SHORT_STATUS.PENDING;
    }
    else if (config_1.default.short_remote_verify) {
        status = group_constants_1.SHORT_STATUS.PROCESSING;
    }
    const short = yield short_model_1.Short.create({
        user: requester.id,
        group,
        title: payload.title ? String(payload.title) : null,
        caption: payload.caption ? String(payload.caption) : null,
        video,
        coverImage: (_a = payload.coverImage) !== null && _a !== void 0 ? _a : null,
        duration: declaredDuration,
        location: payload.location ? String(payload.location) : null,
        hashtags,
        audience,
        status,
        moderationStatus: group_constants_1.GROUP_MODERATION_STATUS.APPROVED,
    });
    if (status === group_constants_1.SHORT_STATUS.PROCESSING) {
        // Async origin verification; the short only becomes visible on success.
        void finalizeProcessing(String(short._id));
    }
    if (groupDoc) {
        yield (0, group_service_1.logGroupActivity)(groupDoc._id, requester.id, group_constants_2.GROUP_ACTIVITY_ACTION.SETTINGS_UPDATED, {
            targetType: "short",
            targetId: String(short._id),
            metadata: { status },
        });
        if (pendingGroupApproval) {
            const { GroupService } = yield Promise.resolve().then(() => __importStar(require("../Group/group.service")));
            const staffIds = yield GroupService.staffIdsOf(groupDoc);
            yield Promise.all(staffIds.map((id) => notification_service_1.NotificationService.createNotificationIntoDB({
                recipient: id,
                actor: requester.id,
                type: "group.short_pending",
                title: "A new Short awaits review",
                body: `A member submitted a Short to ${groupDoc === null || groupDoc === void 0 ? void 0 : groupDoc.name}.`,
                link: `/groups/${groupDoc === null || groupDoc === void 0 ? void 0 : groupDoc.slug}/moderation`,
                entityType: "short",
                entityId: String(short._id),
                groupId: String(groupDoc === null || groupDoc === void 0 ? void 0 : groupDoc._id),
                dedupe: true,
            })));
        }
    }
    return short;
});
/**
 * Processing pipeline. With SHORT_REMOTE_VERIFY enabled the asset is
 * HEAD-verified at the origin; failures leave the Short in FAILED with a
 * reason (never silently "published"). Without remote verification the
 * synchronous URL validation at creation time is authoritative.
 */
const finalizeProcessing = (shortId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const short = yield short_model_1.Short.findById(shortId);
        if (!short || short.status !== group_constants_1.SHORT_STATUS.PROCESSING)
            return;
        yield verifyRemoteVideo(short.video);
        const groupDoc = short.group ? yield group_permissions_1.GroupPermissionService.loadGroup(String(short.group)) : null;
        const shouldStayPending = !!groupDoc && groupDoc.postApprovalEnabled;
        short.status = shouldStayPending ? group_constants_1.SHORT_STATUS.PENDING : group_constants_1.SHORT_STATUS.PUBLISHED;
        yield short.save();
    }
    catch (err) {
        yield short_model_1.Short.updateOne({ _id: shortId, status: group_constants_1.SHORT_STATUS.PROCESSING }, {
            status: group_constants_1.SHORT_STATUS.FAILED,
            rejectionReason: err instanceof AppError_1.default
                ? err.message
                : "Video processing failed — please re-upload",
        });
    }
});
/* ------------------------------------------------------------------ */
/* Feed / read                                                         */
/* ------------------------------------------------------------------ */
/**
 * Global Shorts feed. Rules:
 *  - Only PUBLISHED, non-deleted shorts.
 *  - Group shorts are visible ONLY to current members of that group.
 *  - Audience: PUBLIC (anyone), FOLLOWERS (viewer follows author), PRIVATE (author).
 *  - The viewer's own shorts are always visible to them (within accessible groups).
 */
const getShortsFeedFromDB = (query, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const page = Math.max(1, parseInt(String((_a = query.page) !== null && _a !== void 0 ? _a : "1"), 10) || 1);
    const limit = Math.min(30, Math.max(1, parseInt(String((_b = query.limit) !== null && _b !== void 0 ? _b : "10"), 10) || 10));
    const myGroupIds = yield groupMembership_model_1.GroupMembership.find({
        user: requester.id,
        status: "APPROVED",
    }).distinct("group");
    const accessibleGroups = [null, ...myGroupIds];
    const clauses = [
        // Own shorts inside groups the viewer can still access.
        { user: requester.id, group: { $in: accessibleGroups } },
        // Public audience.
        { audience: group_constants_1.SHORT_AUDIENCE.PUBLIC, group: { $in: accessibleGroups } },
    ];
    const following = (_c = (yield user_model_1.User.findById(requester.id).select("following").lean())) === null || _c === void 0 ? void 0 : _c.following;
    if (following && following.length) {
        clauses.push({
            audience: group_constants_1.SHORT_AUDIENCE.FOLLOWERS,
            user: { $in: following },
            group: { $in: accessibleGroups },
        });
    }
    const filter = {
        isDeleted: false,
        status: group_constants_1.SHORT_STATUS.PUBLISHED,
        moderationStatus: group_constants_1.GROUP_MODERATION_STATUS.APPROVED,
        $or: clauses,
    };
    if (query.hashtag && typeof query.hashtag === "string") {
        filter.hashtags = escapeRegex(String(query.hashtag).replace(/^#/, ""));
    }
    if (query.location && typeof query.location === "string") {
        filter.location = { $regex: escapeRegex(String(query.location)), $options: "i" };
    }
    if (query.userId && typeof query.userId === "string") {
        filter.user = query.userId;
    }
    if (query.group && typeof query.group === "string") {
        filter.group = query.group;
    }
    const [items, total] = yield Promise.all([
        short_model_1.Short.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("user", "name image verified"),
        short_model_1.Short.countDocuments(filter),
    ]);
    const likedSet = new Set(items.flatMap((s) => { var _a; return ((_a = s.likes) !== null && _a !== void 0 ? _a : []).some((l) => String(l) === requester.id) ? [String(s._id)] : []; }));
    return {
        result: items.map((s) => {
            var _a;
            return (Object.assign(Object.assign({}, s.toObject()), { likedByMe: likedSet.has(String(s._id)), viewedByMe: ((_a = s.views) !== null && _a !== void 0 ? _a : []).some((v) => String(v) === requester.id) }));
        }),
        meta: { page, limit, total, totalPage: Math.ceil(total / limit) || 1 },
    };
});
const getSingleShortFromDB = (shortId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    if (!mongoose_1.Types.ObjectId.isValid(shortId)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    }
    const short = yield short_model_1.Short.findById(shortId).populate("user", "name image verified");
    if (!short)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    yield assertCanViewShort(short, requester);
    return Object.assign(Object.assign({}, short.toObject()), { likedByMe: ((_a = short.likes) !== null && _a !== void 0 ? _a : []).some((l) => String(l) === requester.id), viewedByMe: ((_b = short.views) !== null && _b !== void 0 ? _b : []).some((v) => String(v) === requester.id) });
});
/* ------------------------------------------------------------------ */
/* Engagement                                                          */
/* ------------------------------------------------------------------ */
const viewShortIntoDB = (shortId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    if (!mongoose_1.Types.ObjectId.isValid(shortId)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    }
    const short = yield short_model_1.Short.findById(shortId);
    if (!short)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    yield assertCanViewShort(short, requester);
    // One counted view per viewer (retry-safe / dedup on retries).
    const res = yield short_model_1.Short.updateOne({ _id: short._id, views: { $ne: requester.id } }, { $addToSet: { views: requester.id }, $inc: { viewCount: 1 } });
    return { counted: res.modifiedCount > 0, viewCount: short.viewCount };
});
const likeShortIntoDB = (shortId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    if (!mongoose_1.Types.ObjectId.isValid(shortId)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    }
    const short = yield short_model_1.Short.findById(shortId);
    if (!short)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    yield assertCanInteractWithShort(short, requester);
    const already = ((_a = short.likes) !== null && _a !== void 0 ? _a : []).some((l) => String(l) === requester.id);
    if (!already) {
        yield short_model_1.Short.updateOne({ _id: short._id }, { $addToSet: { likes: new mongoose_1.Types.ObjectId(requester.id) } });
        yield notification_service_1.NotificationService.createNotificationIntoDB({
            recipient: String(short.user),
            actor: requester.id,
            type: "short.liked",
            title: "Someone liked your Short",
            link: `/shorts/${String(short._id)}`,
            entityType: "short",
            entityId: String(short._id),
            groupId: short.group ? String(short.group) : null,
        });
    }
    const updated = yield short_model_1.Short.findById(short._id).select("likes");
    return { likes: (_b = updated === null || updated === void 0 ? void 0 : updated.likes) !== null && _b !== void 0 ? _b : [], liked: true };
});
const unlikeShortIntoDB = (shortId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!mongoose_1.Types.ObjectId.isValid(shortId)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    }
    const short = yield short_model_1.Short.findById(shortId);
    if (!short)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    yield assertCanInteractWithShort(short, requester);
    yield short_model_1.Short.updateOne({ _id: short._id }, { $pull: { likes: new mongoose_1.Types.ObjectId(requester.id) } });
    const updated = yield short_model_1.Short.findById(short._id).select("likes");
    return { likes: (_a = updated === null || updated === void 0 ? void 0 : updated.likes) !== null && _a !== void 0 ? _a : [], liked: false };
});
const reportShortIntoDB = (shortId, reason, requester) => __awaiter(void 0, void 0, void 0, function* () {
    if (!mongoose_1.Types.ObjectId.isValid(shortId)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    }
    const short = yield short_model_1.Short.findById(shortId);
    if (!short)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    yield assertCanViewShort(short, requester);
    const updated = yield short_model_1.Short.findByIdAndUpdate(short._id, { $inc: { reportCount: 1 } }, { new: true });
    void reason;
    return updated;
});
/* ------------------------------------------------------------------ */
/* Author management                                                   */
/* ------------------------------------------------------------------ */
const updateShortIntoDB = (shortId, payload, requester) => __awaiter(void 0, void 0, void 0, function* () {
    if (!mongoose_1.Types.ObjectId.isValid(shortId)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    }
    const short = yield short_model_1.Short.findById(shortId);
    if (!short || short.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    }
    const isOwner = String(short.user) === requester.id;
    if (!isOwner && requester.role !== "ADMIN") {
        // Group staff may edit shorts inside their group.
        if (short.group) {
            const membership = yield group_permissions_1.GroupPermissionService.getMembership(new mongoose_1.Types.ObjectId(String(short.group)), requester.id);
            if (!group_permissions_1.GroupPermissionService.isStaff(membership, requester)) {
                throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Not allowed to edit this short");
            }
        }
        else {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Not allowed to edit this short");
        }
    }
    const update = {};
    if (payload.title !== undefined)
        update.title = String(payload.title);
    if (payload.caption !== undefined)
        update.caption = String(payload.caption);
    if (payload.location !== undefined)
        update.location = String(payload.location);
    if (payload.coverImage !== undefined) {
        assertImageUrl(payload.coverImage);
        update.coverImage = payload.coverImage;
    }
    if (Array.isArray(payload.hashtags)) {
        update.hashtags = payload.hashtags
            .slice(0, 15)
            .map((t) => String(t).replace(/^#/, "").trim().slice(0, 40))
            .filter(Boolean);
    }
    if (payload.audience !== undefined) {
        const audience = payload.audience;
        if (!Object.values(group_constants_1.SHORT_AUDIENCE).includes(audience)) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid audience");
        }
        update.audience = audience;
    }
    if (Object.keys(update).length === 0) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "No valid fields to update");
    }
    const updated = yield short_model_1.Short.findByIdAndUpdate(short._id, update, { new: true });
    return updated;
});
const deleteShortFromDB = (shortId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    if (!mongoose_1.Types.ObjectId.isValid(shortId)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    }
    const short = yield short_model_1.Short.findById(shortId);
    if (!short || short.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    }
    const isOwner = String(short.user) === requester.id;
    if (!isOwner && requester.role !== "ADMIN") {
        if (short.group) {
            const membership = yield group_permissions_1.GroupPermissionService.getMembership(new mongoose_1.Types.ObjectId(String(short.group)), requester.id);
            if (!group_permissions_1.GroupPermissionService.isStaff(membership, requester)) {
                throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Not allowed to delete this short");
            }
        }
        else {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Not allowed to delete this short");
        }
    }
    // Soft delete: media cleanup happens later (purge) once nothing references it.
    yield short_model_1.Short.updateOne({ _id: short._id }, { isDeleted: true, status: group_constants_1.SHORT_STATUS.REMOVED });
    return true;
});
/* ------------------------------------------------------------------ */
/* Group moderation of shorts                                          */
/* ------------------------------------------------------------------ */
const moderateShortIntoDB = (groupRef, shortId, action, reason, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { group } = yield group_permissions_1.GroupPermissionService.authorize(groupRef, requester, "group:moderatePost");
    if (!mongoose_1.Types.ObjectId.isValid(shortId)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    }
    const short = yield short_model_1.Short.findOne({ _id: shortId, group: group._id });
    if (!short)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    if (action === "approve") {
        short.moderationStatus = group_constants_1.GROUP_MODERATION_STATUS.APPROVED;
        short.status = group_constants_1.SHORT_STATUS.PUBLISHED;
        short.rejectionReason = null;
    }
    else if (action === "reject") {
        short.moderationStatus = group_constants_1.GROUP_MODERATION_STATUS.REJECTED;
        short.status = group_constants_1.SHORT_STATUS.REJECTED;
        short.rejectionReason = reason !== null && reason !== void 0 ? reason : "This Short does not meet the group rules.";
    }
    else {
        short.moderationStatus = group_constants_1.GROUP_MODERATION_STATUS.REMOVED;
        short.status = group_constants_1.SHORT_STATUS.REMOVED;
        short.rejectionReason = reason !== null && reason !== void 0 ? reason : "Removed by group staff.";
    }
    yield short.save();
    yield (0, group_service_1.logGroupActivity)(group._id, requester.id, action === "approve"
        ? group_constants_2.GROUP_ACTIVITY_ACTION.POST_APPROVED
        : action === "reject"
            ? group_constants_2.GROUP_ACTIVITY_ACTION.POST_REJECTED
            : group_constants_2.GROUP_ACTIVITY_ACTION.POST_REMOVED, { targetType: "short", targetId: String(short._id), metadata: { action } });
    yield notification_service_1.NotificationService.createNotificationIntoDB({
        recipient: String(short.user),
        actor: requester.id,
        type: `group.short_${action}`,
        title: action === "approve"
            ? "Your Short was approved"
            : action === "reject"
                ? "Your Short was not approved"
                : "Your Short was removed",
        body: (_a = short.rejectionReason) !== null && _a !== void 0 ? _a : undefined,
        link: `/groups/${group.slug}`,
        entityType: "short",
        entityId: String(short._id),
        groupId: String(group._id),
        dedupe: true,
    });
    return short;
});
/* ------------------------------------------------------------------ */
/* Media cleanup (safe purge)                                          */
/* ------------------------------------------------------------------ */
/**
 * Returns every community document (other than the given shortId) that still
 * references the media URL. Cleanup must never destroy media that is still
 * referenced by a post, comment, profile, group, story or another short.
 */
const findMediaReferences = (mediaUrl, excludeShortId) => __awaiter(void 0, void 0, void 0, function* () {
    const results = [];
    const notSelf = { $ne: new mongoose_1.Types.ObjectId(excludeShortId) };
    const [posts, comments, shorts, users, groups, stories] = yield Promise.all([
        post_model_1.Post.countDocuments({ images: mediaUrl, isDeleted: false }),
        comment_model_1.Comment.countDocuments({ images: mediaUrl, isDeleted: false }),
        short_model_1.Short.countDocuments({ $or: [{ video: mediaUrl }, { coverImage: mediaUrl }], _id: notSelf }),
        user_model_1.User.countDocuments({ $or: [{ image: mediaUrl }, { coverImage: mediaUrl }] }),
        // Groups store media on image/coverImage fields.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        (yield Promise.resolve().then(() => __importStar(require("../Group/group.model")))).Group.countDocuments({
            $or: [{ image: mediaUrl }, { coverImage: mediaUrl }],
        }),
        (yield Promise.resolve().then(() => __importStar(require("../Story/story.model")))).Story.countDocuments({ media: mediaUrl }),
    ]);
    if (posts)
        results.push({ collection: "posts", count: posts });
    if (comments)
        results.push({ collection: "comments", count: comments });
    if (shorts)
        results.push({ collection: "shorts", count: shorts });
    if (users)
        results.push({ collection: "users", count: users });
    if (groups)
        results.push({ collection: "groups", count: groups });
    if (stories)
        results.push({ collection: "stories", count: stories });
    return results;
});
const purgeShortFromDB = (shortId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    if (!mongoose_1.Types.ObjectId.isValid(shortId)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    }
    const short = yield short_model_1.Short.findById(shortId);
    if (!short)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Short not found");
    const isOwner = String(short.user) === requester.id;
    if (!isOwner && requester.role !== "ADMIN") {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Not allowed to purge this short");
    }
    const references = yield findMediaReferences(short.video, String(short._id));
    if (references.length > 0) {
        throw new AppError_1.default(http_status_1.default.CONFLICT, "Media is still referenced elsewhere and cannot be removed");
    }
    // Best-effort remote destroy (only when Cloudinary is configured).
    try {
        if (config_1.default.cloudinary_cloud_name && config_1.default.cloudinary_api_key && config_1.default.cloudinary_api_secret) {
            // Lazy require keeps startup light and avoids failing without creds.
            const cloudinary = (yield Promise.resolve().then(() => __importStar(require("cloudinary")))).v2;
            cloudinary.config({
                cloud_name: config_1.default.cloudinary_cloud_name,
                api_key: config_1.default.cloudinary_api_key,
                api_secret: config_1.default.cloudinary_api_secret,
            });
            const publicId = extractCloudinaryPublicId(short.video);
            if (publicId) {
                yield cloudinary.uploader.destroy(publicId, { resource_type: "video" });
            }
        }
    }
    catch (_a) {
        // Remote cleanup is best-effort; the document removal below is what
        // guarantees the content is no longer served.
    }
    yield short_model_1.Short.deleteOne({ _id: short._id });
    return true;
});
const extractCloudinaryPublicId = (url) => {
    var _a;
    try {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/\/video\/upload\/(?:[^/]+\/)*([^/]+?)(?:\.[a-z0-9]+)?$/i);
        if (!match)
            return null;
        const candidate = decodeURIComponent(match[1]);
        // Strip leading folder transforms if any.
        return (_a = candidate.split("/").pop()) !== null && _a !== void 0 ? _a : candidate;
    }
    catch (_b) {
        return null;
    }
};
exports.ShortService = {
    createShortIntoDB,
    getShortsFeedFromDB,
    getSingleShortFromDB,
    viewShortIntoDB,
    likeShortIntoDB,
    unlikeShortIntoDB,
    reportShortIntoDB,
    updateShortIntoDB,
    deleteShortFromDB,
    moderateShortIntoDB,
    purgeShortFromDB,
    assertCanViewShort,
    assertCanInteractWithShort,
    assertVideoUrl,
    findMediaReferences,
    extractCloudinaryPublicId,
    finalizeProcessing,
};
