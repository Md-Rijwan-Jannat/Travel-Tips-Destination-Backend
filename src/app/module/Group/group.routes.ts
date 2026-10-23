import express from "express";
import Auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLE } from "../User/user.constants";
import { GroupControllers } from "./group.controller";
import { GroupValidation } from "./group.validation";
import { groupActionLimiter, inviteFlowLimiter } from "../../middlewares/rateLimiter";

const router = express.Router();

/* ------------------- Invite flow (registered first) ------------------- */

// Public: branded invite landing preview. Rate-limited; only intentionally
// public group fields are ever returned (no members/posts/messages).
router.get(
  "/invites/:token/preview",
  inviteFlowLimiter,
  GroupControllers.previewInvite,
);

// Authenticated redemption — server-side validation of expiry, revocation,
// usage limits and membership happens in the service (never client-side).
router.post(
  "/invites/:token/redeem",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  inviteFlowLimiter,
  GroupControllers.redeemInvite,
);

/* ---------------------------- Discovery ---------------------------- */

router.get(
  "/",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  GroupControllers.getAllGroups,
);

router.post(
  "/",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  groupActionLimiter,
  validateRequest(GroupValidation.createGroupValidationSchema),
  GroupControllers.createGroup,
);

/* ---------------------------- Single group ------------------------- */

router.get("/:id", Auth(USER_ROLE.USER, USER_ROLE.ADMIN), GroupControllers.getSingleGroup);

router.patch(
  "/:id",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(GroupValidation.updateGroupValidationSchema),
  GroupControllers.updateGroup,
);

router.delete("/:id", Auth(USER_ROLE.USER, USER_ROLE.ADMIN), GroupControllers.deleteGroup);

/* ---------------------------- Membership --------------------------- */

router.post(
  "/:id/join",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  groupActionLimiter,
  GroupControllers.joinGroup,
);

router.post(
  "/:id/leave",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  GroupControllers.leaveGroup,
);

router.get(
  "/:id/members",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  GroupControllers.listMembers,
);

router.post(
  "/:id/members/review",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(GroupValidation.reviewRequestValidationSchema),
  GroupControllers.reviewJoinRequest,
);

router.patch(
  "/:id/members/role",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(GroupValidation.changeRoleValidationSchema),
  GroupControllers.changeMemberRole,
);

router.post(
  "/:id/members/remove",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(GroupValidation.memberActionValidationSchema),
  GroupControllers.removeMember,
);

router.post(
  "/:id/members/unban",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(GroupValidation.memberActionValidationSchema),
  GroupControllers.unbanMember,
);

router.post(
  "/:id/members/mute",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(GroupValidation.memberActionValidationSchema),
  GroupControllers.setMemberMuted,
);

router.post(
  "/:id/transfer-ownership",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(GroupValidation.transferOwnershipValidationSchema),
  GroupControllers.transferOwnership,
);

/* ------------------------------- Chat ------------------------------ */

router.get("/:id/chat", Auth(USER_ROLE.USER, USER_ROLE.ADMIN), GroupControllers.getGroupConversation);

/* ------------------------------ Invites ---------------------------- */

router.get("/:id/invites", Auth(USER_ROLE.USER, USER_ROLE.ADMIN), GroupControllers.listInvites);

router.post(
  "/:id/invites",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(GroupValidation.createInviteValidationSchema),
  GroupControllers.createInvite,
);

router.delete(
  "/:id/invites/:inviteId",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  GroupControllers.revokeInvite,
);

/* ------------------------------- Feed ------------------------------ */

router.get("/:id/posts", Auth(USER_ROLE.USER, USER_ROLE.ADMIN), GroupControllers.getGroupFeed);

router.post(
  "/:id/posts",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  groupActionLimiter,
  validateRequest(GroupValidation.createGroupPostValidationSchema),
  GroupControllers.createGroupPost,
);

/* ---------------------------- Moderation --------------------------- */

router.get(
  "/:id/moderation/posts",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(GroupValidation.moderationListValidationSchema),
  GroupControllers.getModerationQueue,
);

router.post(
  "/:id/moderation/posts/:postId/:action",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(GroupValidation.moderationActionValidationSchema),
  GroupControllers.moderatePost,
);

/* --------------------------- Shorts / log -------------------------- */

router.get("/:id/shorts", Auth(USER_ROLE.USER, USER_ROLE.ADMIN), GroupControllers.getGroupShorts);

router.get("/:id/audit", Auth(USER_ROLE.USER, USER_ROLE.ADMIN), GroupControllers.getAuditLog);

export const GroupRoutes = router;
