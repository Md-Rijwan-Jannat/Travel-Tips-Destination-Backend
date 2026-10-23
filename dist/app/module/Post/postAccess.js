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
exports.isGloballyVisibleFilter = exports.assertCanInteractWithPost = exports.assertCanViewPost = void 0;
const http_status_1 = __importDefault(require("http-status"));
const group_model_1 = require("../Group/group.model");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const group_permissions_1 = require("../Group/group.permissions");
const group_constants_1 = require("../Group/group.constants");
const staffMembershipOf = (groupId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const membership = yield group_permissions_1.GroupPermissionService.getMembership(groupId, userId);
    return membership;
});
/**
 * Shared authorization for reading a post entity (post detail, comment list,
 * reactions). A group post is only readable when the requester may view the
 * owning group AND the post's moderation state allows it (pending/rejected
 * posts are visible only to their author and group staff).
 *
 * Throws 404 for missing/invisible resources so private content cannot be
 * probed by ID.
 */
const assertCanViewPost = (post, requester) => __awaiter(void 0, void 0, void 0, function* () {
    if (post.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
    }
    if (!post.group) {
        // Classic global post — but never expose un-moderated group-less content
        // states that shouldn't exist; treat pending/rejected as hidden.
        if (post.moderationStatus && post.moderationStatus !== "APPROVED") {
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
        }
        return;
    }
    const group = yield group_model_1.Group.findById(String(post.group));
    if (!group || group.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
    }
    const membership = yield staffMembershipOf(group._id, requester.id);
    if (!group_permissions_1.GroupPermissionService.canViewGroup(group, membership, requester)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
    }
    if (post.moderationStatus && post.moderationStatus !== "APPROVED") {
        const isAuthor = String(post.user) === requester.id;
        const isStaff = group_permissions_1.GroupPermissionService.isStaff(membership, requester);
        if (!isAuthor && !isStaff) {
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
        }
    }
});
exports.assertCanViewPost = assertCanViewPost;
/**
 * Write access (comment/react) on a group post requires active membership —
 * public visibility only grants read access.
 */
const assertCanInteractWithPost = (post, requester) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, exports.assertCanViewPost)(post, requester);
    if (!post.group)
        return;
    const group = yield group_model_1.Group.findById(String(post.group));
    if (!group)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Post not found");
    const membership = yield staffMembershipOf(group._id, requester.id);
    if (!group_permissions_1.GroupPermissionService.isActiveMember(membership) && requester.role !== "ADMIN") {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Join the group to interact with its posts");
    }
    if (group_permissions_1.GroupPermissionService.isBanned(membership)) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are banned from this group");
    }
});
exports.assertCanInteractWithPost = assertCanInteractWithPost;
/** True when the post may appear in the public/global feed. */
exports.isGloballyVisibleFilter = {
    $or: [
        // Non-group posts (missing or null `group`).
        { group: null },
        // Only group posts from public groups can surface globally.
        { groupVisibility: group_constants_1.GROUP_VISIBILITY.PUBLIC },
    ],
    $and: [
        {
            $or: [{ moderationStatus: "APPROVED" }, { moderationStatus: null }],
        },
    ],
};
