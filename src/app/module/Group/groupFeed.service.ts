import httpStatus from "http-status";
import { Types } from "mongoose";
import AppError from "../../errors/AppError";
import { Post } from "../Post/post.model";
import { PostService, notifyGroupOfNewPost } from "../Post/post.service";
import {
  GROUP_ACTIVITY_ACTION,
  GROUP_MODERATION_STATUS,
  GROUP_ROLE,
} from "./group.constants";
import { TRequester } from "./group.interface";
import { GroupPermissionService as GPerm, isStaffRole } from "./group.permissions";
import { logGroupActivity } from "./group.service";
import { TPost } from "../Post/post.interface";
import { NotificationService } from "../Notification/notification.service";
import { GroupMembership } from "./groupMembership.model";
import { Group } from "./group.model";

type TQuery = Record<string, unknown>;

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isStaffOf = (
  membership: { role: string } | null,
  requester: TRequester,
): boolean => {
  if (requester.role === "ADMIN") return true;
  if (!membership) return false;
  return isStaffRole(membership.role as (typeof GROUP_ROLE)[keyof typeof GROUP_ROLE]);
};

/**
 * Group feed. Approved posts are visible to anyone who may view the group;
 * pending/rejected posts are visible ONLY to their author and group staff.
 */
const getGroupFeedFromDB = async (
  groupIdOrSlug: string,
  query: TQuery,
  requester: TRequester,
) => {
  const group = await GPerm.loadGroup(groupIdOrSlug);
  const membership = await GPerm.getMembership(group._id, requester.id);
  if (!GPerm.canViewGroup(group, membership, requester)) {
    throw new AppError(httpStatus.NOT_FOUND, "Group not found");
  }

  const staff = isStaffOf(membership, requester);
  const approvedClause: Record<string, unknown> = {
    moderationStatus: GROUP_MODERATION_STATUS.APPROVED,
  };
  const authorClause: Record<string, unknown> = {
    moderationStatus: {
      $in: [GROUP_MODERATION_STATUS.PENDING, GROUP_MODERATION_STATUS.REJECTED],
    },
    user: requester.id,
  };
  const staffClause: Record<string, unknown> = {
    moderationStatus: {
      $in: [
        GROUP_MODERATION_STATUS.PENDING,
        GROUP_MODERATION_STATUS.REJECTED,
        GROUP_MODERATION_STATUS.REMOVED,
      ],
    },
  };

  const base: Record<string, unknown> = {
    group: group._id,
    isDeleted: false,
    $or: staff ? [approvedClause, authorClause, staffClause] : [approvedClause, authorClause],
  };

  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(query.limit ?? "10"), 10) || 10));

  const filter: Record<string, unknown> = { ...base };
  if (query.category) filter.category = query.category;
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

  const [items, total] = await Promise.all([
    Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user", "name image email verified")
      .populate({
        path: "comments",
        populate: { path: "user", select: "name image" },
      }),
    Post.countDocuments(filter),
  ]);

  return {
    result: items,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) || 1 },
    context: {
      myRole: membership?.role ?? null,
      myStatus: membership?.status ?? null,
      isStaff: staff,
      postApprovalEnabled: group.postApprovalEnabled,
      postPermission: group.postPermission,
      chatEnabled: group.chatEnabled,
      visibility: group.visibility,
      canPost: !!membership && membership.status === "APPROVED",
    },
  };
};

/** Create a post inside a group (delegates to the shared Post pipeline). */
const createGroupPostIntoDB = async (
  groupIdOrSlug: string,
  payload: Record<string, unknown>,
  requester: TRequester,
) => {
  // Fail fast with the same 404 as an unknown group before delegating.
  const group = await GPerm.loadGroup(groupIdOrSlug);

  const post = await PostService.createPostIntoDB(
    {
      title: payload.title,
      description: payload.description,
      images: payload.images,
      // Group posts default to a neutral travel category; group discovery
      // uses the group's own category instead.
      category: (payload.category as TPost["category"]) ?? "Other",
      status: "FREE",
      location: payload.location ? String(payload.location) : null,
      tags: Array.isArray(payload.tags)
        ? (payload.tags as unknown[]).slice(0, 20).map((t) => String(t))
        : [],
      // Delegation must know which group the post belongs to — this is what
      // triggers the membership/approval pipeline in createPostIntoDB.
      group: String(group._id),
    } as unknown as TPost,
    requester.id,
    requester,
  );

  return post;
};

/** Moderation queue: PENDING / APPROVED / REJECTED / REMOVED / REPORTED. */
const getModerationQueueFromDB = async (
  groupIdOrSlug: string,
  query: TQuery,
  requester: TRequester,
) => {
  const { group, membership } = await GPerm.authorize(
    groupIdOrSlug,
    requester,
    "group:moderatePost",
  );
  void membership;

  const status = String(query.status ?? GROUP_MODERATION_STATUS.PENDING);
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? "20"), 10) || 20));

  const filter: Record<string, unknown> = { group: group._id, isDeleted: false };

  if (status === "REPORTED") {
    filter.reportCount = { $gt: 0 };
  } else if (
    Object.values(GROUP_MODERATION_STATUS).includes(
      status as (typeof GROUP_MODERATION_STATUS)[keyof typeof GROUP_MODERATION_STATUS],
    )
  ) {
    filter.moderationStatus = status;
  } else {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid moderation status filter");
  }

  const [items, total] = await Promise.all([
    Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user", "name image email")
      .populate({ path: "comments", populate: { path: "user", select: "name image" } }),
    Post.countDocuments(filter),
  ]);

  return {
    result: items,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) || 1 },
  };
};

type TModAction = "approve" | "reject" | "remove" | "restore";

/**
 * Staff-only moderation transition. Every transition is audited and the
 * author is notified (approve/reject/remove). The post MUST belong to the
 * group in the path (resource-in-group check).
 */
const moderatePostIntoDB = async (
  groupIdOrSlug: string,
  postId: string,
  action: TModAction,
  reason: string | undefined,
  requester: TRequester,
) => {
  const { group } = await GPerm.authorize(groupIdOrSlug, requester, "group:moderatePost");

  if (!Types.ObjectId.isValid(postId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Post not found");
  }

  const post = await Post.findOne({ _id: postId, group: group._id, isDeleted: false });
  if (!post) throw new AppError(httpStatus.NOT_FOUND, "Post not found");

  // Only group staff (or a platform admin) reaches this endpoint at all —
  // the route is gated on `group:moderatePost`, so an ordinary author can
  // never approve their own pending post. Staff actions are audited below.
  const now = new Date();
  const previous = post.moderationStatus;

  switch (action) {
    case "approve":
      post.moderationStatus = GROUP_MODERATION_STATUS.APPROVED;
      post.moderationReason = null;
      break;
    case "reject":
      post.moderationStatus = GROUP_MODERATION_STATUS.REJECTED;
      post.moderationReason = reason ?? "This post does not meet the group rules.";
      break;
    case "remove":
      post.moderationStatus = GROUP_MODERATION_STATUS.REMOVED;
      post.moderationReason = reason ?? "Removed by a group moderator.";
      break;
    case "restore":
      post.moderationStatus = GROUP_MODERATION_STATUS.APPROVED;
      post.moderationReason = null;
      break;
    default:
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid moderation action");
  }

  post.moderatedBy = new Types.ObjectId(requester.id);
  post.moderatedAt = now;
  await post.save();

  const actionLog: Record<TModAction, (typeof GROUP_ACTIVITY_ACTION)[keyof typeof GROUP_ACTIVITY_ACTION]> = {
    approve: GROUP_ACTIVITY_ACTION.POST_APPROVED,
    reject: GROUP_ACTIVITY_ACTION.POST_REJECTED,
    remove: GROUP_ACTIVITY_ACTION.POST_REMOVED,
    restore: GROUP_ACTIVITY_ACTION.POST_RESTORED,
  };

  await logGroupActivity(group._id, requester.id, actionLog[action], {
    targetType: "post",
    targetId: String(post._id),
    metadata: { from: previous, to: post.moderationStatus, reason: reason ?? null },
  });

  const notifyAuthor = async (title: string, body?: string) => {
    await NotificationService.createNotificationIntoDB({
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
  };

  if (action === "approve" || action === "restore") {
    await notifyAuthor(
      action === "approve" ? "Your post was approved" : "Your post was restored",
      `Your post is now visible in ${group.name}.`,
    );
    if (previous !== GROUP_MODERATION_STATUS.APPROVED) {
      await notifyGroupOfNewPost(group._id, String(post.user), post);
    }
  } else if (action === "reject") {
    await notifyAuthor(
      "Your post was not approved",
      `${post.moderationReason} — Only you can see this status.`,
    );
  } else if (action === "remove") {
    await notifyAuthor(
      "Your post was removed by group staff",
      post.moderationReason ?? undefined,
    );
  }

  return post;
};

/** Mute/unmute a member (restricted members cannot post or comment). */
const setMemberMutedIntoDB = async (
  groupIdOrSlug: string,
  targetUserId: string,
  muted: boolean,
  requester: TRequester,
) => {
  const { group } = await GPerm.authorize(groupIdOrSlug, requester, "group:manageMembers");
  if (targetUserId === String(group.owner)) {
    throw new AppError(httpStatus.FORBIDDEN, "The owner cannot be muted");
  }
  const membership = await GroupMembership.findOne({
    group: group._id,
    user: targetUserId,
  });
  if (!membership || membership.status !== "APPROVED") {
    throw new AppError(httpStatus.NOT_FOUND, "Member not found in this group");
  }

  if (muted) {
    await Group.updateOne(
      { _id: group._id },
      { $addToSet: { mutedUsers: new Types.ObjectId(targetUserId) } },
    );
  } else {
    await Group.updateOne(
      { _id: group._id },
      { $pull: { mutedUsers: new Types.ObjectId(targetUserId) } },
    );
  }

  await logGroupActivity(group._id, requester.id, GROUP_ACTIVITY_ACTION.SETTINGS_UPDATED, {
    targetType: "user",
    targetId: targetUserId,
    metadata: { muted },
  });

  await NotificationService.createNotificationIntoDB({
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
};

const getShortsFromDB = async (
  groupIdOrSlug: string,
  query: TQuery,
  requester: TRequester,
) => {
  const group = await GPerm.loadGroup(groupIdOrSlug);
  const membership = await GPerm.getMembership(group._id, requester.id);
  if (!GPerm.canViewGroup(group, membership, requester)) {
    throw new AppError(httpStatus.NOT_FOUND, "Group not found");
  }
  // Group shorts are member-only, even in PUBLIC groups (visibility of the
  // group page itself is broader than the short-video content).
  if (
    requester.role !== "ADMIN" &&
    !GPerm.isActiveMember(membership) &&
    !GPerm.isStaff(membership, requester)
  ) {
    throw new AppError(httpStatus.FORBIDDEN, "Join this group to see its shorts");
  }

  const { Short } = await import("../Short/short.model");
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(query.limit ?? "10"), 10) || 10));

  const filter: Record<string, unknown> = {
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

  const [items, total] = await Promise.all([
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
};

export const GroupFeedService = {
  getGroupFeedFromDB,
  createGroupPostIntoDB,
  getModerationQueueFromDB,
  moderatePostIntoDB,
  setMemberMutedIntoDB,
  getShortsFromDB,
};

