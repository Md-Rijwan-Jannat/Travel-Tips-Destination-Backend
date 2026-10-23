"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupRoutes = void 0;
const express_1 = __importDefault(require("express"));
const auth_1 = __importDefault(require("../../middlewares/auth"));
const validateRequest_1 = __importDefault(require("../../middlewares/validateRequest"));
const user_constants_1 = require("../User/user.constants");
const group_controller_1 = require("./group.controller");
const group_validation_1 = require("./group.validation");
const rateLimiter_1 = require("../../middlewares/rateLimiter");
const router = express_1.default.Router();
/* ------------------- Invite flow (registered first) ------------------- */
// Public: branded invite landing preview. Rate-limited; only intentionally
// public group fields are ever returned (no members/posts/messages).
router.get("/invites/:token/preview", rateLimiter_1.inviteFlowLimiter, group_controller_1.GroupControllers.previewInvite);
// Authenticated redemption — server-side validation of expiry, revocation,
// usage limits and membership happens in the service (never client-side).
router.post("/invites/:token/redeem", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), rateLimiter_1.inviteFlowLimiter, group_controller_1.GroupControllers.redeemInvite);
/* ---------------------------- Discovery ---------------------------- */
router.get("/", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), group_controller_1.GroupControllers.getAllGroups);
router.post("/", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), rateLimiter_1.groupActionLimiter, (0, validateRequest_1.default)(group_validation_1.GroupValidation.createGroupValidationSchema), group_controller_1.GroupControllers.createGroup);
/* ---------------------------- Single group ------------------------- */
router.get("/:id", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), group_controller_1.GroupControllers.getSingleGroup);
router.patch("/:id", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), (0, validateRequest_1.default)(group_validation_1.GroupValidation.updateGroupValidationSchema), group_controller_1.GroupControllers.updateGroup);
router.delete("/:id", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), group_controller_1.GroupControllers.deleteGroup);
/* ---------------------------- Membership --------------------------- */
router.post("/:id/join", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), rateLimiter_1.groupActionLimiter, group_controller_1.GroupControllers.joinGroup);
router.post("/:id/leave", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), group_controller_1.GroupControllers.leaveGroup);
router.get("/:id/members", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), group_controller_1.GroupControllers.listMembers);
router.post("/:id/members/review", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), (0, validateRequest_1.default)(group_validation_1.GroupValidation.reviewRequestValidationSchema), group_controller_1.GroupControllers.reviewJoinRequest);
router.patch("/:id/members/role", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), (0, validateRequest_1.default)(group_validation_1.GroupValidation.changeRoleValidationSchema), group_controller_1.GroupControllers.changeMemberRole);
router.post("/:id/members/remove", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), (0, validateRequest_1.default)(group_validation_1.GroupValidation.memberActionValidationSchema), group_controller_1.GroupControllers.removeMember);
router.post("/:id/members/unban", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), (0, validateRequest_1.default)(group_validation_1.GroupValidation.memberActionValidationSchema), group_controller_1.GroupControllers.unbanMember);
router.post("/:id/members/mute", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), (0, validateRequest_1.default)(group_validation_1.GroupValidation.memberActionValidationSchema), group_controller_1.GroupControllers.setMemberMuted);
router.post("/:id/transfer-ownership", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), (0, validateRequest_1.default)(group_validation_1.GroupValidation.transferOwnershipValidationSchema), group_controller_1.GroupControllers.transferOwnership);
/* ------------------------------- Chat ------------------------------ */
router.get("/:id/chat", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), group_controller_1.GroupControllers.getGroupConversation);
/* ------------------------------ Invites ---------------------------- */
router.get("/:id/invites", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), group_controller_1.GroupControllers.listInvites);
router.post("/:id/invites", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), (0, validateRequest_1.default)(group_validation_1.GroupValidation.createInviteValidationSchema), group_controller_1.GroupControllers.createInvite);
router.delete("/:id/invites/:inviteId", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), group_controller_1.GroupControllers.revokeInvite);
/* ------------------------------- Feed ------------------------------ */
router.get("/:id/posts", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), group_controller_1.GroupControllers.getGroupFeed);
router.post("/:id/posts", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), rateLimiter_1.groupActionLimiter, (0, validateRequest_1.default)(group_validation_1.GroupValidation.createGroupPostValidationSchema), group_controller_1.GroupControllers.createGroupPost);
/* ---------------------------- Moderation --------------------------- */
router.get("/:id/moderation/posts", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), (0, validateRequest_1.default)(group_validation_1.GroupValidation.moderationListValidationSchema), group_controller_1.GroupControllers.getModerationQueue);
router.post("/:id/moderation/posts/:postId/:action", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), (0, validateRequest_1.default)(group_validation_1.GroupValidation.moderationActionValidationSchema), group_controller_1.GroupControllers.moderatePost);
/* --------------------------- Shorts / log -------------------------- */
router.get("/:id/shorts", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), group_controller_1.GroupControllers.getGroupShorts);
router.get("/:id/audit", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), group_controller_1.GroupControllers.getAuditLog);
exports.GroupRoutes = router;
