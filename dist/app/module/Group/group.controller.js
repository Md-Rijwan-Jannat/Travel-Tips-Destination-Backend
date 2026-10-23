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
exports.GroupControllers = void 0;
const http_status_1 = __importDefault(require("http-status"));
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const group_service_1 = require("./group.service");
const groupFeed_service_1 = require("./groupFeed.service");
const MODAL_VERB = {
    approve: "approved",
    reject: "rejected",
    remove: "removed",
    restore: "restored",
};
const requesterOf = (req) => ({
    id: String(req.user.id),
    role: String(req.user.role),
});
/* ----------------------------- Groups ----------------------------- */
const createGroup = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const group = yield group_service_1.GroupService.createGroupIntoDB(req.body, req.user.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: "Group created successfully",
        data: group,
    });
}));
const getAllGroups = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { result, meta } = yield group_service_1.GroupService.getAllGroupsFromDB(req.query, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Groups retrieved successfully",
        meta,
        data: result,
    });
}));
const getSingleGroup = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { group, membership } = yield group_service_1.GroupService.getSingleGroupFromDB(req.params.id, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Group retrieved successfully",
        data: { group, membership },
    });
}));
const updateGroup = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const group = yield group_service_1.GroupService.updateGroupIntoDB(req.params.id, req.body, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Group updated successfully",
        data: group,
    });
}));
const deleteGroup = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield group_service_1.GroupService.deleteGroupFromDB(req.params.id, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Group deleted successfully",
    });
}));
/* --------------------------- Membership --------------------------- */
const joinGroup = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield group_service_1.GroupService.joinGroupIntoDB(req.params.id, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: result.status === "APPROVED"
            ? "You joined the group"
            : "Join request submitted",
        data: result,
    });
}));
const leaveGroup = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield group_service_1.GroupService.leaveGroupIntoDB(req.params.id, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "You left the group",
        data: result,
    });
}));
const listMembers = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { result, meta } = yield group_service_1.GroupService.listMembersFromDB(req.params.id, req.query, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Members retrieved successfully",
        meta,
        data: result,
    });
}));
const reviewJoinRequest = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield group_service_1.GroupService.reviewJoinRequestIntoDB(req.params.id, req.body.userId, req.body.decision, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: `Request ${result.status === "APPROVED" ? "approved" : "rejected"}`,
        data: result,
    });
}));
/* ------------------------------ Roles ----------------------------- */
const changeMemberRole = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield group_service_1.GroupService.changeMemberRoleIntoDB(req.params.id, req.body.userId, req.body.role, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Member role updated",
        data: result,
    });
}));
const transferOwnership = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield group_service_1.GroupService.transferOwnershipIntoDB(req.params.id, req.body.userId, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Ownership transferred",
        data: result,
    });
}));
const removeMember = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield group_service_1.GroupService.removeMemberIntoDB(req.params.id, req.body.userId, requesterOf(req), { ban: req.body.ban === true });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: req.body.ban === true ? "Member banned" : "Member removed",
    });
}));
const unbanMember = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield group_service_1.GroupService.unbanMemberIntoDB(req.params.id, req.body.userId, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Member unbanned",
    });
}));
const setMemberMuted = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield groupFeed_service_1.GroupFeedService.setMemberMutedIntoDB(req.params.id, req.body.userId, req.body.muted === true, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: req.body.muted === true ? "Member muted" : "Member unmuted",
    });
}));
/* ------------------------------ Chat ------------------------------ */
const getGroupConversation = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const chat = yield group_service_1.GroupService.getOrCreateGroupConversation(req.params.id, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Group conversation ready",
        data: chat,
    });
}));
/* ----------------------------- Invites ---------------------------- */
const createInvite = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { invite, token } = yield group_service_1.GroupService.createInviteIntoDB(req.params.id, req.body, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: "Invite link created",
        data: { invite, token },
    });
}));
const listInvites = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const invites = yield group_service_1.GroupService.listInvitesFromDB(req.params.id, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        data: invites,
    });
}));
const revokeInvite = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const invite = yield group_service_1.GroupService.revokeInviteIntoDB(req.params.id, req.params.inviteId, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Invite revoked",
        data: invite,
    });
}));
const previewInvite = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield group_service_1.GroupService.previewInvite(req.params.token);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        data,
    });
}));
const redeemInvite = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield group_service_1.GroupService.redeemInviteIntoDB(req.params.token, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: data.status === "APPROVED"
            ? "You joined the group"
            : "Your request to join was submitted",
        data,
    });
}));
/* ------------------------------ Feed ------------------------------ */
const getGroupFeed = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { result, meta, context } = yield groupFeed_service_1.GroupFeedService.getGroupFeedFromDB(req.params.id, req.query, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Group feed retrieved",
        meta,
        data: { posts: result, context },
    });
}));
const createGroupPost = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const post = yield groupFeed_service_1.GroupFeedService.createGroupPostIntoDB(req.params.id, req.body, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: "Post created successfully",
        data: post,
    });
}));
const getModerationQueue = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { result, meta } = yield groupFeed_service_1.GroupFeedService.getModerationQueueFromDB(req.params.id, req.query, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Moderation queue retrieved",
        meta,
        data: result,
    });
}));
const moderatePost = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const post = yield groupFeed_service_1.GroupFeedService.moderatePostIntoDB(req.params.id, req.params.postId, req.params.action, (_a = req.body) === null || _a === void 0 ? void 0 : _a.reason, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: `Post ${(_b = MODAL_VERB[req.params.action]) !== null && _b !== void 0 ? _b : "updated"}`,
        data: post,
    });
}));
/* ------------------------- Shorts / audit ------------------------- */
const getGroupShorts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { result, meta } = yield groupFeed_service_1.GroupFeedService.getShortsFromDB(req.params.id, req.query, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Group shorts retrieved",
        meta,
        data: result,
    });
}));
const getAuditLog = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { result, meta } = yield group_service_1.GroupService.getAuditLogFromDB(req.params.id, req.query, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Activity log retrieved",
        meta,
        data: result,
    });
}));
exports.GroupControllers = {
    createGroup,
    getAllGroups,
    getSingleGroup,
    updateGroup,
    deleteGroup,
    joinGroup,
    leaveGroup,
    listMembers,
    reviewJoinRequest,
    changeMemberRole,
    transferOwnership,
    removeMember,
    unbanMember,
    setMemberMuted,
    getGroupConversation,
    createInvite,
    listInvites,
    revokeInvite,
    previewInvite,
    redeemInvite,
    getGroupFeed,
    createGroupPost,
    getModerationQueue,
    moderatePost,
    getGroupShorts,
    getAuditLog,
};
