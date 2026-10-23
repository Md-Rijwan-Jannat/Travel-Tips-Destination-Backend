import httpStatus from "http-status";
import { Types } from "mongoose";
import { Group } from "./group.model";
import { GroupMembership } from "./groupMembership.model";
import { GroupInvite, generateInviteToken, hashInviteToken } from "./groupInvite.model";
import { GroupActivityLog } from "./groupActivityLog.model";
import AppError from "../../errors/AppError";
import QueryBuilder from "../../builder/QueryBuilder";
import {
  GROUP_ACTIVITY_ACTION,
  GROUP_CATEGORY,
  GROUP_INVITE_STATUS,
  GROUP_JOIN_POLICY,
  GROUP_MEMBERSHIP_STATUS,
  GROUP_ROLE,
  GROUP_VISIBILITY,
  groupSearchFields,
  TGroupRole,
} from "./group.constants";
import { IGroup, TRequester } from "./group.interface";
import { GroupPermissionService as GPerm } from "./group.permissions";
import { Chat } from "../Chat/chat.model";
import { User } from "../User/user.model";
import { NotificationService } from "../Notification/notification.service";
import { Post } from "../Post/post.model";
import { removeUserFromRoom } from "../../utils/socketRegistry";

const SLUG_REGEX = /[^a-z0-9]+/g;

const buildSlug = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(SLUG_REGEX, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "group";

const uniqueSlug = async (base: string): Promise<string> => {
  let candidate = base;
  let suffix = 1;
  for (let i = 0; i < 50; i += 1) {
    const exists = await Group.exists({ slug: candidate });
    if (!exists) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return `${base}-${Date.now().toString(36)}`;
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Append-only audit trail. Never stores secrets — fire-and-forget. */
const logGroupActivity = async (
  group: Types.ObjectId | string,
  actor: string,
  action: (typeof GROUP_ACTIVITY_ACTION)[keyof typeof GROUP_ACTIVITY_ACTION],
  extra?: { targetType?: string; targetId?: string; metadata?: Record<string, unknown> },
): Promise<void> => {
  try {
    await GroupActivityLog.create({
      group,
      actor,
      action,
      targetType: extra?.targetType ?? null,
      targetId: extra?.targetId ?? null,
      metadata: extra?.metadata ?? null,
    });
  } catch {
    // Auditing must never break the primary operation.
  }
};

const staffIdsOf = async (group: IGroup): Promise<string[]> => {
  const ids = await GroupMembership.find({
    group: group._id,
    status: GROUP_MEMBERSHIP_STATUS.APPROVED,
    role: { $in: [GROUP_ROLE.OWNER, GROUP_ROLE.ADMIN, GROUP_ROLE.MODERATOR] },
  }).distinct("user");
  return ids.map(String);
};

/* ------------------------------------------------------------------ */
/* Chat integration (reuses the existing Messenger infra)              */
/* ------------------------------------------------------------------ */

/**
 * Keeps the group's Messenger conversation participants in sync with group
 * membership. Former members lose socket room access and message-fetch
 * access because every Chat/Message check is based on `Chat.users`.
 */
const syncChatMembership = async (
  group: IGroup,
  userId: string,
  op: "add" | "remove",
): Promise<void> => {
  try {
    let chatId = group.chat;
    if (!chatId) {
      const found = await Chat.findOne({ groupCommunity: group._id }).select("_id");
      chatId = found?._id;
    }
    if (!chatId) return;
    await Chat.updateOne(
      { _id: chatId },
      op === "add"
        ? { $addToSet: { users: new Types.ObjectId(userId) } }
        : { $pull: { users: new Types.ObjectId(userId) } },
    );
    // Immediately drop any live room subscription of a removed/banned member.
    if (op === "remove") {
      removeUserFromRoom(userId, String(chatId));
    }
  } catch {
    // Chat sync must not block membership changes.
  }
};

/**
 * Returns the group's Messenger conversation, creating it on first request.
 * A unique sparse index on Chat.groupCommunity guarantees a single
 * conversation even under concurrent first-clicks (the loser of the race
 * re-reads the winner's document).
 */
const getOrCreateGroupConversation = async (
  groupIdOrSlug: string,
  requester: TRequester,
) => {
  const { group } = await GPerm.authorize(groupIdOrSlug, requester, "group:chat");

  const existing = await Chat.findOne({ groupCommunity: group._id });
  if (existing) return existing;

  const memberIds = await GroupMembership.find({
    group: group._id,
    status: GROUP_MEMBERSHIP_STATUS.APPROVED,
  }).distinct("user");

  try {
    const chat = await Chat.create({
      chatName: group.name,
      user: new Types.ObjectId(requester.id),
      isGroupChat: true,
      users: memberIds.length ? memberIds : [new Types.ObjectId(requester.id)],
      groupAdmin: group.owner,
      groupCommunity: group._id,
    });
    await Group.updateOne({ _id: group._id }, { chat: chat._id });
    return chat;
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 11000) {
      const winner = await Chat.findOne({ groupCommunity: group._id });
      if (winner) {
        await Group.updateOne({ _id: group._id }, { chat: winner._id });
        return winner;
      }
    }
    throw err;
  }
};

/* ------------------------------------------------------------------ */
/* Create / read / update                                              */
/* ------------------------------------------------------------------ */

const createGroupIntoDB = async (
  payload: Record<string, unknown>,
  userId: string,
): Promise<IGroup> => {
  const name = String(payload.name ?? "").trim();
  if (!name) throw new AppError(httpStatus.BAD_REQUEST, "Group name is required");
  if (!payload.description || !String(payload.description).trim()) {
    throw new AppError(httpStatus.BAD_REQUEST, "Group description is required");
  }
  if (!GROUP_CATEGORY.includes(payload.category as (typeof GROUP_CATEGORY)[number])) {
    throw new AppError(httpStatus.BAD_REQUEST, "Please provide a valid group category");
  }

  let requestedSlug = "";
  if (payload.slug) {
    requestedSlug = String(payload.slug)
      .toLowerCase()
      .trim()
      .replace(SLUG_REGEX, "-")
      .replace(/^-+|-+$/g, "");
    if (!requestedSlug) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid group slug");
    }
  }

  const slug = requestedSlug
    ? await uniqueSlug(requestedSlug)
    : await uniqueSlug(buildSlug(name));

  const visibility =
    payload.visibility === GROUP_VISIBILITY.PRIVATE
      ? GROUP_VISIBILITY.PRIVATE
      : GROUP_VISIBILITY.PUBLIC;

  const group = await Group.create({
    name,
    slug,
    description: String(payload.description),
    purpose: payload.purpose ?? null,
    category: payload.category,
    visibility,
    image: payload.image ?? null,
    coverImage: payload.coverImage ?? null,
    location: payload.location ?? null,
    rules: Array.isArray(payload.rules)
      ? (payload.rules as unknown[]).slice(0, 30).map((r) => String(r))
      : [],
    joinPolicy:
      payload.joinPolicy &&
      Object.values(GROUP_JOIN_POLICY).includes(
        payload.joinPolicy as (typeof GROUP_JOIN_POLICY)[keyof typeof GROUP_JOIN_POLICY],
      )
        ? payload.joinPolicy
        : visibility === GROUP_VISIBILITY.PRIVATE
          ? GROUP_JOIN_POLICY.REQUEST
          : GROUP_JOIN_POLICY.OPEN,
    owner: userId,
    memberCount: 1,
    // Defaults: members publish immediately; chat on; new-post fanout on.
    postApprovalEnabled: payload.postApprovalEnabled === true,
    chatEnabled: payload.chatEnabled !== false,
    notifyOnNewPost: payload.notifyOnNewPost !== false,
  });

  // Creator becomes the initial Owner + approved member.
  await GroupMembership.create({
    group: group._id,
    user: userId,
    role: GROUP_ROLE.OWNER,
    status: GROUP_MEMBERSHIP_STATUS.APPROVED,
    joinedAt: new Date(),
    requestedAt: new Date(),
  });

  await logGroupActivity(group._id, userId, GROUP_ACTIVITY_ACTION.GROUP_CREATED, {
    targetType: "group",
    targetId: String(group._id),
    metadata: { visibility },
  });

  // Every group starts with a Messenger conversation so members can chat
  // immediately (unique sparse index on groupCommunity keeps it single).
  try {
    const chat = await Chat.create({
      chatName: group.name,
      isGroupChat: true,
      users: [new Types.ObjectId(userId)],
      groupAdmin: [new Types.ObjectId(userId)],
      groupCommunity: group._id,
    });
    group.chat = chat._id as typeof group.chat;
    await group.save({ validateBeforeSave: false });
  } catch {
    // Lazy fallback: GET /groups/:id/chat will create it on first request.
  }

  return group;
};

const getSingleGroupFromDB = async (
  groupIdOrSlug: string,
  requester: TRequester,
): Promise<{ group: IGroup; membership: unknown }> => {
  const group = await GPerm.loadGroup(groupIdOrSlug);
  const membership = await GPerm.getMembership(group._id, requester.id);
  if (!GPerm.canViewGroup(group, membership, requester)) {
    // Same response as a missing group — no existence oracle for private groups.
    throw new AppError(httpStatus.NOT_FOUND, "Group not found");
  }
  return { group, membership };
};

const getAllGroupsFromDB = async (
  query: Record<string, unknown>,
  requester: TRequester,
) => {
  const myApprovedIds = await GroupMembership.find({
    user: requester.id,
    status: GROUP_MEMBERSHIP_STATUS.APPROVED,
  }).distinct("group");

  const filter: Record<string, unknown> = {
    isDeleted: false,
    $or: [{ visibility: GROUP_VISIBILITY.PUBLIC }, { _id: { $in: myApprovedIds } }],
  };

  if (query.category) filter.category = query.category;
  if (
    query.visibility &&
    Object.values(GROUP_VISIBILITY).includes(
      query.visibility as (typeof GROUP_VISIBILITY)[keyof typeof GROUP_VISIBILITY],
    )
  ) {
    filter.visibility = query.visibility;
  }
  if (query.location && typeof query.location === "string") {
    filter.location = { $regex: escapeRegex(query.location), $options: "i" };
  }
  if (query.tab === "mine") {
    filter._id = { $in: myApprovedIds };
  }

  // Search is applied via $and so it composes with the privacy $or above
  // (QueryBuilder.search would overwrite a pre-existing $or filter).
  if (query.searchTerm && typeof query.searchTerm === "string") {
    const safeTerm = escapeRegex(query.searchTerm);
    filter.$and = [
      {
        $or: groupSearchFields.map((field) => ({
          [field]: { $regex: safeTerm, $options: "i" },
        })),
      },
    ];
  }

  const qb = new QueryBuilder(
    Group.find(filter).populate("owner", "name image email"),
    query,
  )
    .sort()
    .fields()
    .paginate();

  if (query.tab === "popular" || query.sort === "popular") {
    qb.modelQuery = qb.modelQuery.sort("-memberCount");
  }

  const result = await qb.modelQuery;
  const meta = await qb.countTotal();

  const ids = result.map((g) => g._id);
  const myMemberships = await GroupMembership.find({
    group: { $in: ids },
    user: requester.id,
  }).lean();
  const membershipMap = new Map(myMemberships.map((m) => [String(m.group), m]));

  const data = result.map((g) => {
    const m = membershipMap.get(String(g._id));
    return {
      ...(g.toObject() as unknown as Record<string, unknown>),
      myStatus: m?.status ?? GROUP_MEMBERSHIP_STATUS.NONE,
      myRole: m?.role ?? null,
    };
  });

  return { result: data, meta };
};

const updateGroupIntoDB = async (
  groupIdOrSlug: string,
  payload: Record<string, unknown>,
  requester: TRequester,
): Promise<IGroup> => {
  const group = await GPerm.loadGroup(groupIdOrSlug);
  const membership = await GPerm.getMembership(group._id, requester.id);
  if (!GPerm.canViewGroup(group, membership, requester)) {
    throw new AppError(httpStatus.NOT_FOUND, "Group not found");
  }
  GPerm.assert(group, membership, requester, "group:manageGeneral");

  const update: Record<string, unknown> = {};
  const changed: string[] = [];

  const simpleFields = ["name", "description", "purpose", "category", "location"] as const;
  for (const key of simpleFields) {
    if (payload[key] !== undefined) {
      update[key] = payload[key];
      changed.push(key);
    }
  }

  if (payload.rules !== undefined) {
    if (!Array.isArray(payload.rules)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Rules must be a list");
    }
    update.rules = payload.rules.slice(0, 30).map((r) => String(r));
    changed.push("rules");
  }

  if (payload.image !== undefined || payload.coverImage !== undefined) {
    GPerm.assert(group, membership, requester, "group:manageMedia");
    if (payload.image !== undefined) update.image = payload.image;
    if (payload.coverImage !== undefined) update.coverImage = payload.coverImage;
    changed.push("media");
  }

  const postingFields = ["joinPolicy", "postPermission", "postApprovalEnabled"] as const;
  for (const key of postingFields) {
    if (payload[key] !== undefined) {
      GPerm.assert(group, membership, requester, "group:managePosting");
      update[key] = payload[key];
      changed.push(key);
    }
  }

  if (payload.chatEnabled !== undefined) {
    GPerm.assert(group, membership, requester, "group:manageGeneral");
    update.chatEnabled = payload.chatEnabled === true;
    changed.push("chatEnabled");
  }

  if (payload.notifyOnNewPost !== undefined) {
    GPerm.assert(group, membership, requester, "group:manageGeneral");
    update.notifyOnNewPost = payload.notifyOnNewPost === true;
    changed.push("notifyOnNewPost");
  }

  // Visibility changes are staff sensitive and must be reflected on existing
  // group posts so the global feed never leaks private content.
  if (
    payload.visibility !== undefined &&
    payload.visibility !== group.visibility &&
    Object.values(GROUP_VISIBILITY).includes(
      payload.visibility as (typeof GROUP_VISIBILITY)[keyof typeof GROUP_VISIBILITY],
    )
  ) {
    GPerm.assert(group, membership, requester, "group:manageVisibility");
    update.visibility = payload.visibility;
    changed.push("visibility");
    await Post.updateMany(
      { group: group._id, isDeleted: false },
      { groupVisibility: payload.visibility },
    );
  }

  if (Object.keys(update).length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, "No valid fields to update");
  }

  const updated = await Group.findByIdAndUpdate(group._id, update, {
    new: true,
    runValidators: true,
  });
  if (!updated) throw new AppError(httpStatus.NOT_FOUND, "Group not found");

  if (payload.postApprovalEnabled !== undefined) {
    await logGroupActivity(group._id, requester.id, GROUP_ACTIVITY_ACTION.APPROVAL_TOGGLED, {
      targetType: "group",
      targetId: String(group._id),
      metadata: { enabled: payload.postApprovalEnabled === true },
    });
  }

  await logGroupActivity(group._id, requester.id, GROUP_ACTIVITY_ACTION.SETTINGS_UPDATED, {
    targetType: "group",
    targetId: String(group._id),
    metadata: { fields: changed },
  });

  return updated;
};

const deleteGroupFromDB = async (groupIdOrSlug: string, requester: TRequester) => {
  const { group } = await GPerm.authorize(groupIdOrSlug, requester, "group:delete");
  group.isDeleted = true;
  await group.save();
  await logGroupActivity(group._id, requester.id, GROUP_ACTIVITY_ACTION.GROUP_DELETED);
  await NotificationService.createNotificationIntoDB({
    recipient: String(group.owner),
    actor: requester.id,
    type: "group.deleted",
    title: `${group.name} was deleted`,
    link: "/groups",
    entityType: "group",
    entityId: String(group._id),
  });
};

/* ------------------------------------------------------------------ */
/* Membership                                                          */
/* ------------------------------------------------------------------ */

const resolveMembershipOutcome = async (
  group: IGroup,
  userId: string,
  inviteRequiresApproval: boolean,
  viaInvite = false,
): Promise<{ status: string }> => {
  const existing = await GroupMembership.findOne({ group: group._id, user: userId });

  if (existing?.status === GROUP_MEMBERSHIP_STATUS.BANNED) {
    throw new AppError(httpStatus.FORBIDDEN, "You are banned from this group");
  }

  if (existing?.status === GROUP_MEMBERSHIP_STATUS.APPROVED) {
    return { status: GROUP_MEMBERSHIP_STATUS.APPROVED };
  }

  // A valid invite link is itself the authorization for CLOSED/REQUEST
  // groups — that is the point of an invite. Otherwise the normal
  // open-join rules apply.
  const openJoin =
    !inviteRequiresApproval &&
    (viaInvite ||
      (group.joinPolicy === GROUP_JOIN_POLICY.OPEN &&
        group.visibility === GROUP_VISIBILITY.PUBLIC));

  if (openJoin) {
    if (existing) {
      existing.status = GROUP_MEMBERSHIP_STATUS.APPROVED;
      existing.joinedAt = new Date();
      existing.requestedAt = existing.requestedAt ?? new Date();
      existing.reviewedAt = new Date();
      existing.reviewedBy = null;
      await existing.save({ validateBeforeSave: false });
    } else {
      await GroupMembership.create({
        group: group._id,
        user: userId,
        role: GROUP_ROLE.MEMBER,
        status: GROUP_MEMBERSHIP_STATUS.APPROVED,
        joinedAt: new Date(),
        requestedAt: new Date(),
      });
    }

    await Group.updateOne({ _id: group._id }, { $inc: { memberCount: 1 } });
    await syncChatMembership(group, userId, "add");
    await logGroupActivity(group._id, userId, GROUP_ACTIVITY_ACTION.MEMBER_JOINED);
    await NotificationService.createNotificationIntoDB({
      recipient: String(group.owner),
      actor: userId,
      type: "group.member_joined",
      title: "New member joined your group",
      body: `A new member joined ${group.name}.`,
      link: `/groups/${group.slug}/members`,
      entityType: "group",
      entityId: String(group._id),
      groupId: String(group._id),
      dedupe: true,
    });
    return { status: GROUP_MEMBERSHIP_STATUS.APPROVED };
  }

  // Request-to-join path (private groups / request policy / invite approval).
  if (existing && existing.status === GROUP_MEMBERSHIP_STATUS.PENDING) {
    return { status: GROUP_MEMBERSHIP_STATUS.PENDING };
  }

  if (existing) {
    existing.status = GROUP_MEMBERSHIP_STATUS.PENDING;
    existing.requestedAt = new Date();
    existing.reviewedAt = null;
    existing.reviewedBy = null;
    await existing.save({ validateBeforeSave: false });
  } else {
    await GroupMembership.create({
      group: group._id,
      user: userId,
      role: GROUP_ROLE.MEMBER,
      status: GROUP_MEMBERSHIP_STATUS.PENDING,
      requestedAt: new Date(),
    });
  }

  await Group.updateOne({ _id: group._id }, { $inc: { pendingCount: 1 } });
  await logGroupActivity(group._id, userId, GROUP_ACTIVITY_ACTION.MEMBER_REQUESTED);

  const staff = await staffIdsOf(group);
  await Promise.all(
    staff.map((id) =>
      NotificationService.createNotificationIntoDB({
        recipient: id,
        actor: userId,
        type: "group.join_request",
        title: "New join request",
        body: `Someone requested to join ${group.name}.`,
        link: `/groups/${group.slug}/members?tab=pending`,
        entityType: "group",
        entityId: String(group._id),
        groupId: String(group._id),
        dedupe: true,
      }),
    ),
  );

  return { status: GROUP_MEMBERSHIP_STATUS.PENDING };
};

const joinGroupIntoDB = async (
  groupIdOrSlug: string,
  requester: TRequester,
): Promise<{ status: string }> => {
  const group = await GPerm.loadGroup(groupIdOrSlug);
  const membership = await GPerm.getMembership(group._id, requester.id);

  if (GPerm.isBanned(membership)) {
    throw new AppError(httpStatus.FORBIDDEN, "You are banned from this group");
  }
  if (membership?.status === GROUP_MEMBERSHIP_STATUS.APPROVED) {
    return { status: GROUP_MEMBERSHIP_STATUS.APPROVED };
  }
  return resolveMembershipOutcome(group, requester.id, false);
};

const leaveGroupIntoDB = async (groupIdOrSlug: string, requester: TRequester) => {
  const group = await GPerm.loadGroup(groupIdOrSlug);
  const membership = await GPerm.getMembership(group._id, requester.id);
  if (!membership || membership.status !== GROUP_MEMBERSHIP_STATUS.APPROVED) {
    throw new AppError(httpStatus.FORBIDDEN, "You are not a member of this group");
  }
  if (String(group.owner) === requester.id) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Transfer ownership before leaving the group",
    );
  }

  await GroupMembership.updateOne(
    { group: group._id, user: requester.id },
    { status: GROUP_MEMBERSHIP_STATUS.LEFT, joinedAt: null },
  );
  await Group.updateOne({ _id: group._id }, { $inc: { memberCount: -1 } });
  await syncChatMembership(group, requester.id, "remove");
  await logGroupActivity(group._id, requester.id, GROUP_ACTIVITY_ACTION.MEMBER_LEFT);
  return { status: GROUP_MEMBERSHIP_STATUS.LEFT };
};

const reviewJoinRequestIntoDB = async (
  groupIdOrSlug: string,
  targetUserId: string,
  decision: "APPROVED" | "REJECTED",
  requester: TRequester,
): Promise<{ status: string }> => {
  const { group } = await GPerm.authorize(groupIdOrSlug, requester, "group:manageMembers");

  const membership = await GroupMembership.findOne({
    group: group._id,
    user: targetUserId,
  });
  if (!membership || membership.status !== GROUP_MEMBERSHIP_STATUS.PENDING) {
    throw new AppError(httpStatus.NOT_FOUND, "No pending join request found");
  }

  membership.status = decision;
  membership.reviewedBy = new Types.ObjectId(requester.id);
  membership.reviewedAt = new Date();
  if (decision === GROUP_MEMBERSHIP_STATUS.APPROVED) {
    membership.joinedAt = new Date();
  }
  await membership.save({ validateBeforeSave: false });

  await Group.updateOne(
    { _id: group._id },
    decision === GROUP_MEMBERSHIP_STATUS.APPROVED
      ? { $inc: { memberCount: 1, pendingCount: -1 } }
      : { $inc: { pendingCount: -1 } },
  );

  if (decision === GROUP_MEMBERSHIP_STATUS.APPROVED) {
    await syncChatMembership(group, targetUserId, "add");
  }

  await logGroupActivity(
    group._id,
    requester.id,
    decision === GROUP_MEMBERSHIP_STATUS.APPROVED
      ? GROUP_ACTIVITY_ACTION.MEMBER_APPROVED
      : GROUP_ACTIVITY_ACTION.MEMBER_REJECTED,
    { targetType: "user", targetId: targetUserId },
  );

  await NotificationService.createNotificationIntoDB({
    recipient: targetUserId,
    actor: requester.id,
    type: "group.join_request_result",
    title:
      decision === GROUP_MEMBERSHIP_STATUS.APPROVED
        ? "Your join request was approved"
        : "Your join request was declined",
    body:
      decision === GROUP_MEMBERSHIP_STATUS.APPROVED
        ? `Welcome to ${group.name}!`
        : `Your request to join ${group.name} was declined.`,
    link: `/groups/${group.slug}`,
    entityType: "group",
    entityId: String(group._id),
    groupId: String(group._id),
  });

  return { status: decision };
};

const listMembersFromDB = async (
  groupIdOrSlug: string,
  query: Record<string, unknown>,
  requester: TRequester,
) => {
  const group = await GPerm.loadGroup(groupIdOrSlug);
  const membership = await GPerm.getMembership(group._id, requester.id);
  if (!GPerm.canViewGroup(group, membership, requester)) {
    throw new AppError(httpStatus.NOT_FOUND, "Group not found");
  }
  // Private member rosters are member-only information.
  if (
    group.visibility === GROUP_VISIBILITY.PRIVATE &&
    !GPerm.isActiveMember(membership) &&
    requester.role !== "ADMIN"
  ) {
    throw new AppError(httpStatus.FORBIDDEN, "Join the group to see its members");
  }

  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? "20"), 10) || 20));
  const status = String(query.status ?? GROUP_MEMBERSHIP_STATUS.APPROVED);

  const filter: Record<string, unknown> = { group: group._id, status };
  if (query.role && Object.values(GROUP_ROLE).includes(query.role as TGroupRole)) {
    filter.role = query.role;
  }
  if (query.search && typeof query.search === "string") {
    const userIds = await User.find({
      name: { $regex: escapeRegex(String(query.search)), $options: "i" },
    }).distinct("_id");
    filter.user = { $in: userIds };
  }

  const [items, total] = await Promise.all([
    GroupMembership.find(filter)
      .sort({ role: 1, joinedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user", "name image email country"),
    GroupMembership.countDocuments(filter),
  ]);

  return {
    result: items,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) || 1 },
  };
};

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

const changeMemberRoleIntoDB = async (
  groupIdOrSlug: string,
  targetUserId: string,
  newRole: TGroupRole,
  requester: TRequester,
) => {
  const { group, membership } = await GPerm.authorize(
    groupIdOrSlug,
    requester,
    "group:manageRoles",
  );

  if (!Object.values(GROUP_ROLE).includes(newRole) || newRole === GROUP_ROLE.OWNER) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid role");
  }

  const target = await GroupMembership.findOne({
    group: group._id,
    user: targetUserId,
  });
  if (!target || target.status !== GROUP_MEMBERSHIP_STATUS.APPROVED) {
    throw new AppError(httpStatus.NOT_FOUND, "Member not found in this group");
  }
  if (targetUserId === requester.id) {
    throw new AppError(httpStatus.BAD_REQUEST, "You cannot change your own role");
  }

  const targetCurrentRole = target.role as TGroupRole;
  GPerm.assertCanManageRole(group, membership, requester, targetCurrentRole, newRole);

  const previousRole = target.role;
  target.role = newRole;
  await target.save({ validateBeforeSave: false });

  await logGroupActivity(group._id, requester.id, GROUP_ACTIVITY_ACTION.ROLE_CHANGED, {
    targetType: "user",
    targetId: targetUserId,
    metadata: { from: previousRole, to: newRole },
  });

  await NotificationService.createNotificationIntoDB({
    recipient: targetUserId,
    actor: requester.id,
    type: "group.role_changed",
    title: `Your role changed in ${group.name}`,
    body: `You are now ${newRole === GROUP_ROLE.MODERATOR ? "a moderator" : newRole === GROUP_ROLE.ADMIN ? "an admin" : "a member"}.`,
    link: `/groups/${group.slug}`,
    entityType: "group",
    entityId: String(group._id),
    groupId: String(group._id),
  });

  return { role: newRole, previousRole };
};

const transferOwnershipIntoDB = async (
  groupIdOrSlug: string,
  targetUserId: string,
  requester: TRequester,
) => {
  const { group } = await GPerm.authorize(groupIdOrSlug, requester, "group:transferOwnership");

  if (targetUserId === requester.id) {
    throw new AppError(httpStatus.BAD_REQUEST, "You already own this group");
  }

  const target = await GroupMembership.findOne({
    group: group._id,
    user: targetUserId,
    status: GROUP_MEMBERSHIP_STATUS.APPROVED,
  });
  if (!target) {
    throw new AppError(httpStatus.BAD_REQUEST, "Target must be an approved member");
  }

  // Explicit, atomic-ish two-step ownership handover.
  target.role = GROUP_ROLE.OWNER;
  await target.save({ validateBeforeSave: false });

  const myMembership = await GroupMembership.findOne({
    group: group._id,
    user: requester.id,
  });
  if (myMembership && String(myMembership._id) !== String(target._id)) {
    myMembership.role = GROUP_ROLE.ADMIN;
    await myMembership.save({ validateBeforeSave: false });
  }

  group.owner = new Types.ObjectId(targetUserId);
  await group.save();

  await logGroupActivity(group._id, requester.id, GROUP_ACTIVITY_ACTION.OWNERSHIP_TRANSFERRED, {
    targetType: "user",
    targetId: targetUserId,
    metadata: { previousOwner: requester.id, newOwner: targetUserId },
  });

  await NotificationService.createNotificationIntoDB({
    recipient: targetUserId,
    actor: requester.id,
    type: "group.ownership_transferred",
    title: `You are now the owner of ${group.name}`,
    link: `/groups/${group.slug}/settings`,
    entityType: "group",
    entityId: String(group._id),
    groupId: String(group._id),
  });

  return { owner: targetUserId };
};

const removeMemberIntoDB = async (
  groupIdOrSlug: string,
  targetUserId: string,
  requester: TRequester,
  opts: { ban?: boolean } = {},
) => {
  const { group, membership } = await GPerm.authorize(
    groupIdOrSlug,
    requester,
    "group:manageMembers",
  );

  if (targetUserId === requester.id) {
    throw new AppError(httpStatus.BAD_REQUEST, "Use the leave-group action for yourself");
  }
  if (targetUserId === String(group.owner)) {
    throw new AppError(httpStatus.FORBIDDEN, "The owner cannot be removed");
  }

  const target = await GroupMembership.findOne({
    group: group._id,
    user: targetUserId,
  });
  if (!target || target.status === GROUP_MEMBERSHIP_STATUS.NONE) {
    throw new AppError(httpStatus.NOT_FOUND, "Member not found in this group");
  }

  // Admins may not remove other admins — only the owner can.
  const targetRole = target.role as TGroupRole;
  const actorRole = membership?.role ?? GROUP_ROLE.ADMIN;
  if (
    targetRole === GROUP_ROLE.ADMIN &&
    actorRole !== GROUP_ROLE.OWNER &&
    String(group.owner) !== requester.id
  ) {
    throw new AppError(httpStatus.FORBIDDEN, "Only the owner can remove an admin");
  }
  if (targetRole === GROUP_ROLE.OWNER) {
    throw new AppError(httpStatus.FORBIDDEN, "The owner cannot be removed");
  }

  const wasApproved = target.status === GROUP_MEMBERSHIP_STATUS.APPROVED;
  const wasPending = target.status === GROUP_MEMBERSHIP_STATUS.PENDING;

  target.status = opts.ban
    ? GROUP_MEMBERSHIP_STATUS.BANNED
    : GROUP_MEMBERSHIP_STATUS.REMOVED;
  target.bannedBy = opts.ban ? new Types.ObjectId(requester.id) : null;
  target.bannedAt = opts.ban ? new Date() : null;
  if (wasApproved) target.joinedAt = null;
  await target.save({ validateBeforeSave: false });

  const inc: Record<string, number> = {};
  if (wasApproved) inc.memberCount = -1;
  if (wasPending) inc.pendingCount = -1;
  if (Object.keys(inc).length) await Group.updateOne({ _id: group._id }, { $inc: inc });

  if (wasApproved) await syncChatMembership(group, targetUserId, "remove");

  if (opts.ban) {
    await Group.updateOne(
      { _id: group._id },
      { $addToSet: { bannedUsers: new Types.ObjectId(targetUserId) } },
    );
  }

  await logGroupActivity(
    group._id,
    requester.id,
    opts.ban ? GROUP_ACTIVITY_ACTION.MEMBER_BANNED : GROUP_ACTIVITY_ACTION.MEMBER_REMOVED,
    { targetType: "user", targetId: targetUserId },
  );

  await NotificationService.createNotificationIntoDB({
    recipient: targetUserId,
    actor: requester.id,
    type: opts.ban ? "group.banned" : "group.removed",
    title: opts.ban
      ? `You were banned from ${group.name}`
      : `Your membership in ${group.name} ended`,
    body: opts.ban ? undefined : "You are no longer a member of this group.",
    link: `/groups/${group.slug}`,
    entityType: "group",
    entityId: String(group._id),
    groupId: String(group._id),
  });
};

const unbanMemberIntoDB = async (
  groupIdOrSlug: string,
  targetUserId: string,
  requester: TRequester,
) => {
  const { group } = await GPerm.authorize(groupIdOrSlug, requester, "group:manageMembers");
  const target = await GroupMembership.findOne({ group: group._id, user: targetUserId });
  if (!target || target.status !== GROUP_MEMBERSHIP_STATUS.BANNED) {
    throw new AppError(httpStatus.NOT_FOUND, "No banned member found");
  }
  target.status = GROUP_MEMBERSHIP_STATUS.LEFT;
  target.bannedBy = null;
  target.bannedAt = null;
  await target.save({ validateBeforeSave: false });
  await Group.updateOne(
    { _id: group._id },
    { $pull: { bannedUsers: new Types.ObjectId(targetUserId) } },
  );
  await logGroupActivity(group._id, requester.id, GROUP_ACTIVITY_ACTION.MEMBER_UNBANNED, {
    targetType: "user",
    targetId: targetUserId,
  });
};

/* ------------------------------------------------------------------ */
/* Invites                                                             */
/* ------------------------------------------------------------------ */

const createInviteIntoDB = async (
  groupIdOrSlug: string,
  payload: Record<string, unknown>,
  requester: TRequester,
) => {
  const { group } = await GPerm.authorize(groupIdOrSlug, requester, "group:manageInvites");

  let expiresAt: Date | null = null;
  if (payload.expiresAt) {
    const parsed = new Date(String(payload.expiresAt));
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      throw new AppError(httpStatus.BAD_REQUEST, "Expiry must be a future date");
    }
    expiresAt = parsed;
  }

  let maxUses: number | null = null;
  if (payload.maxUses !== undefined && payload.maxUses !== null) {
    const parsed = Number(payload.maxUses);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10000) {
      throw new AppError(httpStatus.BAD_REQUEST, "Max uses must be between 1 and 10000");
    }
    maxUses = Math.floor(parsed);
  }

  const token = generateInviteToken();
  const invite = await GroupInvite.create({
    group: group._id,
    tokenHash: hashInviteToken(token),
    createdBy: new Types.ObjectId(requester.id),
    label: payload.label ? String(payload.label) : null,
    maxUses,
    requiresApproval:
      payload.requiresApproval === true ||
      group.joinPolicy === GROUP_JOIN_POLICY.REQUEST,
    expiresAt,
  });

  await logGroupActivity(group._id, requester.id, GROUP_ACTIVITY_ACTION.INVITE_CREATED, {
    targetType: "invite",
    targetId: String(invite._id),
  });

  // Raw token returned exactly once — only its hash is persisted.
  return { invite, token };
};

const listInvitesFromDB = async (groupIdOrSlug: string, requester: TRequester) => {
  const { group } = await GPerm.authorize(groupIdOrSlug, requester, "group:manageInvites");
  return GroupInvite.find({ group: group._id }).sort({ createdAt: -1 });
};

const revokeInviteIntoDB = async (
  groupIdOrSlug: string,
  inviteId: string,
  requester: TRequester,
) => {
  const { group } = await GPerm.authorize(groupIdOrSlug, requester, "group:manageInvites");
  const invite = await GroupInvite.findOne({ _id: inviteId, group: group._id });
  if (!invite) throw new AppError(httpStatus.NOT_FOUND, "Invite not found");
  invite.status = GROUP_INVITE_STATUS.REVOKED;
  invite.revokedAt = new Date();
  invite.revokedBy = new Types.ObjectId(requester.id);
  await invite.save({ validateBeforeSave: false });
  await logGroupActivity(group._id, requester.id, GROUP_ACTIVITY_ACTION.INVITE_REVOKED, {
    targetType: "invite",
    targetId: String(invite._id),
  });
  return invite;
};

const inviteState = (
  invite: {
    status: string;
    expiresAt?: Date | null;
    maxUses?: number | null;
    usedCount: number;
  },
  group: IGroup,
): string => {
  if (group.isDeleted) return "GROUP_UNAVAILABLE";
  if (invite.status === GROUP_INVITE_STATUS.REVOKED) return "REVOKED";
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return "EXPIRED";
  if (invite.maxUses != null && invite.usedCount >= invite.maxUses) return "EXHAUSTED";
  if (invite.status !== GROUP_INVITE_STATUS.ACTIVE) return "REVOKED";
  return "VALID";
};

/**
 * Public preview for the branded invite landing page. Deliberately exposes
 * only the group fields that are intentionally public (name, description,
 * category, cover, member count) — never members, posts, or conversations.
 */
const previewInvite = async (token: string) => {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) {
    throw new AppError(httpStatus.NOT_FOUND, "Invitation not found");
  }
  const invite = await GroupInvite.findOne({
    tokenHash: hashInviteToken(token),
  }).populate("group", "name slug description category visibility image coverImage memberCount joinPolicy isDeleted");
  if (!invite || !invite.group) {
    throw new AppError(httpStatus.NOT_FOUND, "Invitation not found");
  }
  const group = invite.group as unknown as IGroup;
  const state = inviteState(invite, group);

  return {
    state,
    requiresApproval:
      invite.requiresApproval || group.joinPolicy === GROUP_JOIN_POLICY.REQUEST,
    group: {
      name: group.name,
      slug: group.slug,
      description: group.description,
      category: group.category,
      visibility: group.visibility,
      image: group.image,
      coverImage: group.coverImage,
      memberCount: group.memberCount,
    },
  };
};

const redeemInviteIntoDB = async (
  token: string,
  requester: TRequester,
): Promise<{ status: string; slug: string }> => {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) {
    throw new AppError(httpStatus.NOT_FOUND, "Invitation not found");
  }

  const tokenHash = hashInviteToken(token);

  // Atomically reserve one use, with status/expiry/limit enforced inside
  // the filter so concurrent redemptions of the last use cannot both win.
  const invite = await GroupInvite.findOneAndUpdate(
    {
      tokenHash,
      status: GROUP_INVITE_STATUS.ACTIVE,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      $expr: {
        $or: [{ $eq: ["$maxUses", null] }, { $lt: ["$usedCount", "$maxUses"] }],
      },
    },
    { $inc: { usedCount: 1 } },
    { new: true },
  ).populate("group");

  if (!invite || !invite.group) {
    const anyInvite = await GroupInvite.findOne({ tokenHash });
    if (!anyInvite) throw new AppError(httpStatus.NOT_FOUND, "Invitation not found");
    const groupDoc = await Group.findById(anyInvite.group);
    if (groupDoc) {
      const state = inviteState(anyInvite, groupDoc);
      if (state === "EXHAUSTED") {
        throw new AppError(httpStatus.BAD_REQUEST, "This invitation has been fully used");
      }
      if (state === "EXPIRED") {
        throw new AppError(httpStatus.BAD_REQUEST, "This invitation has expired");
      }
      if (state === "REVOKED") {
        throw new AppError(httpStatus.BAD_REQUEST, "This invitation is no longer valid");
      }
    }
    throw new AppError(httpStatus.BAD_REQUEST, "This invitation is no longer valid");
  }

  const group = invite.group as unknown as IGroup;

  try {
    if (group.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, "Group not found");
    }

    const existing = await GroupMembership.findOne({
      group: group._id,
      user: requester.id,
    });
    if (existing?.status === GROUP_MEMBERSHIP_STATUS.BANNED) {
      throw new AppError(httpStatus.FORBIDDEN, "You are banned from this group");
    }
    if (existing?.status === GROUP_MEMBERSHIP_STATUS.APPROVED) {
      // Already a member: release the reservation so re-redeeming does not
      // burn another use of a limited invite.
      await GroupInvite.updateOne({ _id: invite._id }, { $inc: { usedCount: -1 } });
      return { status: GROUP_MEMBERSHIP_STATUS.APPROVED, slug: group.slug };
    }

    const outcome = await resolveMembershipOutcome(
      group,
      requester.id,
      invite.requiresApproval,
      true,
    );

    await logGroupActivity(group._id, requester.id, GROUP_ACTIVITY_ACTION.INVITE_REDEEMED, {
      targetType: "invite",
      targetId: String(invite._id),
    });

    return { status: outcome.status, slug: group.slug };
  } catch (err) {
    // Refund the reserved use when redemption failed after reservation.
    await GroupInvite.updateOne({ _id: invite._id }, { $inc: { usedCount: -1 } });
    throw err;
  }
};

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

const getAuditLogFromDB = async (
  groupIdOrSlug: string,
  query: Record<string, unknown>,
  requester: TRequester,
) => {
  const { group } = await GPerm.authorize(groupIdOrSlug, requester, "group:viewAuditLog");
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const limit = Math.min(100, parseInt(String(query.limit ?? "20"), 10) || 20);
  const filter: Record<string, unknown> = { group: group._id };
  if (query.action) filter.action = query.action;

  const [items, total] = await Promise.all([
    GroupActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("actor", "name image"),
    GroupActivityLog.countDocuments(filter),
  ]);

  return {
    result: items,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) || 1 },
  };
};

export const GroupService = {
  createGroupIntoDB,
  getSingleGroupFromDB,
  getAllGroupsFromDB,
  updateGroupIntoDB,
  deleteGroupFromDB,
  joinGroupIntoDB,
  leaveGroupIntoDB,
  reviewJoinRequestIntoDB,
  listMembersFromDB,
  changeMemberRoleIntoDB,
  transferOwnershipIntoDB,
  removeMemberIntoDB,
  unbanMemberIntoDB,
  getOrCreateGroupConversation,
  createInviteIntoDB,
  listInvitesFromDB,
  revokeInviteIntoDB,
  previewInvite,
  redeemInviteIntoDB,
  getAuditLogFromDB,
  syncChatMembership,
  staffIdsOf,
};

export { logGroupActivity };
