import httpStatus from "http-status";
import { Request } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { GroupService } from "./group.service";
import { GroupFeedService } from "./groupFeed.service";
import { TGroupRole } from "./group.constants";

const MODAL_VERB: Record<string, string> = {
  approve: "approved",
  reject: "rejected",
  remove: "removed",
  restore: "restored",
};

const requesterOf = (req: Request): { id: string; role: string } => ({
  id: String(req.user.id),
  role: String(req.user.role),
});

/* ----------------------------- Groups ----------------------------- */

const createGroup = catchAsync(async (req, res) => {
  const group = await GroupService.createGroupIntoDB(req.body, req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Group created successfully",
    data: group,
  });
});

const getAllGroups = catchAsync(async (req, res) => {
  const { result, meta } = await GroupService.getAllGroupsFromDB(
    req.query as Record<string, unknown>,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Groups retrieved successfully",
    meta,
    data: result,
  });
});

const getSingleGroup = catchAsync(async (req, res) => {
  const { group, membership } = await GroupService.getSingleGroupFromDB(
    req.params.id,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Group retrieved successfully",
    data: { group, membership },
  });
});

const updateGroup = catchAsync(async (req, res) => {
  const group = await GroupService.updateGroupIntoDB(
    req.params.id,
    req.body,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Group updated successfully",
    data: group,
  });
});

const deleteGroup = catchAsync(async (req, res) => {
  await GroupService.deleteGroupFromDB(req.params.id, requesterOf(req));
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Group deleted successfully",
  });
});

/* --------------------------- Membership --------------------------- */

const joinGroup = catchAsync(async (req, res) => {
  const result = await GroupService.joinGroupIntoDB(req.params.id, requesterOf(req));
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message:
      result.status === "APPROVED"
        ? "You joined the group"
        : "Join request submitted",
    data: result,
  });
});

const leaveGroup = catchAsync(async (req, res) => {
  const result = await GroupService.leaveGroupIntoDB(req.params.id, requesterOf(req));
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "You left the group",
    data: result,
  });
});

const listMembers = catchAsync(async (req, res) => {
  const { result, meta } = await GroupService.listMembersFromDB(
    req.params.id,
    req.query as Record<string, unknown>,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Members retrieved successfully",
    meta,
    data: result,
  });
});

const reviewJoinRequest = catchAsync(async (req, res) => {
  const result = await GroupService.reviewJoinRequestIntoDB(
    req.params.id,
    req.body.userId,
    req.body.decision,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Request ${result.status === "APPROVED" ? "approved" : "rejected"}`,
    data: result,
  });
});

/* ------------------------------ Roles ----------------------------- */

const changeMemberRole = catchAsync(async (req, res) => {
  const result = await GroupService.changeMemberRoleIntoDB(
    req.params.id,
    req.body.userId,
    req.body.role as TGroupRole,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Member role updated",
    data: result,
  });
});

const transferOwnership = catchAsync(async (req, res) => {
  const result = await GroupService.transferOwnershipIntoDB(
    req.params.id,
    req.body.userId,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Ownership transferred",
    data: result,
  });
});

const removeMember = catchAsync(async (req, res) => {
  await GroupService.removeMemberIntoDB(
    req.params.id,
    req.body.userId,
    requesterOf(req),
    { ban: req.body.ban === true },
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: req.body.ban === true ? "Member banned" : "Member removed",
  });
});

const unbanMember = catchAsync(async (req, res) => {
  await GroupService.unbanMemberIntoDB(req.params.id, req.body.userId, requesterOf(req));
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Member unbanned",
  });
});

const setMemberMuted = catchAsync(async (req, res) => {
  await GroupFeedService.setMemberMutedIntoDB(
    req.params.id,
    req.body.userId,
    req.body.muted === true,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: req.body.muted === true ? "Member muted" : "Member unmuted",
  });
});

/* ------------------------------ Chat ------------------------------ */

const getGroupConversation = catchAsync(async (req, res) => {
  const chat = await GroupService.getOrCreateGroupConversation(
    req.params.id,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Group conversation ready",
    data: chat,
  });
});

/* ----------------------------- Invites ---------------------------- */

const createInvite = catchAsync(async (req, res) => {
  const { invite, token } = await GroupService.createInviteIntoDB(
    req.params.id,
    req.body,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Invite link created",
    data: { invite, token },
  });
});

const listInvites = catchAsync(async (req, res) => {
  const invites = await GroupService.listInvitesFromDB(req.params.id, requesterOf(req));
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    data: invites,
  });
});

const revokeInvite = catchAsync(async (req, res) => {
  const invite = await GroupService.revokeInviteIntoDB(
    req.params.id,
    req.params.inviteId,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Invite revoked",
    data: invite,
  });
});

const previewInvite = catchAsync(async (req, res) => {
  const data = await GroupService.previewInvite(req.params.token);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    data,
  });
});

const redeemInvite = catchAsync(async (req, res) => {
  const data = await GroupService.redeemInviteIntoDB(
    req.params.token,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message:
      data.status === "APPROVED"
        ? "You joined the group"
        : "Your request to join was submitted",
    data,
  });
});

/* ------------------------------ Feed ------------------------------ */

const getGroupFeed = catchAsync(async (req, res) => {
  const { result, meta, context } = await GroupFeedService.getGroupFeedFromDB(
    req.params.id,
    req.query as Record<string, unknown>,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Group feed retrieved",
    meta,
    data: { posts: result, context },
  });
});

const createGroupPost = catchAsync(async (req, res) => {
  const post = await GroupFeedService.createGroupPostIntoDB(
    req.params.id,
    req.body,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Post created successfully",
    data: post,
  });
});

const getModerationQueue = catchAsync(async (req, res) => {
  const { result, meta } = await GroupFeedService.getModerationQueueFromDB(
    req.params.id,
    req.query as Record<string, unknown>,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Moderation queue retrieved",
    meta,
    data: result,
  });
});

const moderatePost = catchAsync(async (req, res) => {
  const post = await GroupFeedService.moderatePostIntoDB(
    req.params.id,
    req.params.postId,
    req.params.action as "approve" | "reject" | "remove" | "restore",
    req.body?.reason,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Post ${MODAL_VERB[req.params.action as "approve"] ?? "updated"}`,
    data: post,
  });
});

/* ------------------------- Shorts / audit ------------------------- */

const getGroupShorts = catchAsync(async (req, res) => {
  const { result, meta } = await GroupFeedService.getShortsFromDB(
    req.params.id,
    req.query as Record<string, unknown>,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Group shorts retrieved",
    meta,
    data: result,
  });
});

const getAuditLog = catchAsync(async (req, res) => {
  const { result, meta } = await GroupService.getAuditLogFromDB(
    req.params.id,
    req.query as Record<string, unknown>,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Activity log retrieved",
    meta,
    data: result,
  });
});

export const GroupControllers = {
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

