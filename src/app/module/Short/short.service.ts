import httpStatus from "http-status";
import { Types } from "mongoose";
import AppError from "../../errors/AppError";
import config from "../../../config";
import { Short } from "./short.model";
import {
  GROUP_MODERATION_STATUS,
  SHORT_AUDIENCE,
  SHORT_STATUS,
} from "../Group/group.constants";
import { IShort, TRequester } from "../Group/group.interface";
import { GroupPermissionService as GPerm, isStaffRole } from "../Group/group.permissions";
import { GroupMembership } from "../Group/groupMembership.model";
import { NotificationService } from "../Notification/notification.service";
import { logGroupActivity } from "../Group/group.service";
import { GROUP_ACTIVITY_ACTION } from "../Group/group.constants";
import { User } from "../User/user.model";
import { Post } from "../Post/post.model";
import { Comment } from "../Comment/comment.model";

type TQuery = Record<string, unknown>;

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const allowedHosts = (): string[] =>
  String(config.short_allowed_media_hosts)
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

/**
 * Server-side video asset validation. Trusts more than a file extension:
 * the URL must be https, on an allow-listed media host, and (for
 * Cloudinary) must carry the `/video/upload/` RESOURCE-TYPE marker that
 * Cloudinary only assigns to assets uploaded as videos.
 */
const assertVideoUrl = (url: unknown): string => {
  if (typeof url !== "string" || url.length > 2000) {
    throw new AppError(httpStatus.BAD_REQUEST, "A valid video URL is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError(httpStatus.BAD_REQUEST, "A valid video URL is required");
  }

  if (parsed.protocol !== "https:") {
    throw new AppError(httpStatus.BAD_REQUEST, "Video must be served over HTTPS");
  }

  const host = parsed.hostname.toLowerCase();
  if (!allowedHosts().some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Video host is not allowed for uploads",
    );
  }

  // Cloudinary marks resource type in the path — videos must be `/video/upload/`.
  if (host.endsWith("cloudinary.com") && !/\/video\/upload\//i.test(parsed.pathname)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "URL must point to a video asset (not an image or other file)",
    );
  }

  return url;
};

const assertImageUrl = (url: unknown): void => {
  if (url === null || url === undefined || url === "") return;
  if (typeof url !== "string" || url.length > 2000) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid cover image URL");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid cover image URL");
  }
  if (parsed.protocol !== "https:") {
    throw new AppError(httpStatus.BAD_REQUEST, "Cover image must be served over HTTPS");
  }
  const host = parsed.hostname.toLowerCase();
  if (!allowedHosts().some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    throw new AppError(httpStatus.BAD_REQUEST, "Cover image host is not allowed");
  }
};

/**
 * Optional origin verification (SHORT_REMOTE_VERIFY=true). Confirms the
 * asset actually exists, is a video, and respects the configured size cap.
 * A Short can never leave PROCESSING with a failed or pending verification.
 */
const verifyRemoteVideo = async (url: string): Promise<void> => {
  const maxBytes = (config.short_max_size_mb || 100) * 1024 * 1024;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AppError(
        httpStatus.UNPROCESSABLE_ENTITY,
        "Uploaded video could not be verified at the origin",
      );
    }
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (contentType && !contentType.startsWith("video/")) {
      throw new AppError(
        httpStatus.UNPROCESSABLE_ENTITY,
        "Uploaded asset is not a video",
      );
    }
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length && length > maxBytes) {
      throw new AppError(
        httpStatus.UNPROCESSABLE_ENTITY,
        "Video exceeds the maximum allowed size",
      );
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      httpStatus.UNPROCESSABLE_ENTITY,
      "Video verification failed, please re-upload",
    );
  } finally {
    clearTimeout(timer);
  }
};

/* ------------------------------------------------------------------ */
/* Access helpers (shared with comments/reactions)                     */
/* ------------------------------------------------------------------ */

const audienceAllows = (short: IShort, requester: TRequester, isFollowing: boolean) => {
  if (String(short.user) === requester.id) return true;
  if (short.audience === SHORT_AUDIENCE.PUBLIC) return true;
  if (short.audience === SHORT_AUDIENCE.FOLLOWERS) return isFollowing;
  return false; // PRIVATE
};

const isFollowingAuthor = async (authorId: string, viewerId: string): Promise<boolean> => {
  const author = await User.findById(authorId).select("follower").lean();
  if (!author) return false;
  return (author.follower ?? []).some((id) => String(id) === viewerId);
};

/**
 * Group shorts are visible ONLY to current approved members of the owning
 * group (plus platform admins). Former members lose access — membership is
 * re-checked on every read.
 */
const assertCanViewShort = async (short: IShort, requester: TRequester): Promise<void> => {
  if (short.isDeleted || short.status === SHORT_STATUS.REMOVED) {
    throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  }

  if (short.group) {
    // Group-attached shorts are member-only content, even inside PUBLIC
    // groups: viewing requires an approved membership (staff/ADMIN exempt).
    const group = await GPerm.loadGroup(String(short.group));
    const membership = await GPerm.getMembership(group._id, requester.id);
    const allowed =
      requester.role === "ADMIN" ||
      GPerm.isActiveMember(membership) ||
      (String(short.user) === requester.id && !GPerm.isBanned(membership));
    if (!allowed) {
      throw new AppError(httpStatus.NOT_FOUND, "Short not found");
    }
  }

  if (String(short.user) === requester.id) return;

  if (short.status !== SHORT_STATUS.PUBLISHED) {
    // Pending/processing/failed shorts: author + staff only.
    let staff = requester.role === "ADMIN";
    if (short.group && !staff) {
      const membership = await GPerm.getMembership(
        new Types.ObjectId(String(short.group)),
        requester.id,
      );
      staff = GPerm.isStaff(membership, requester);
    }
    if (!staff) throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  }

  const following = await isFollowingAuthor(String(short.user), requester.id);
  if (!audienceAllows(short, requester, following)) {
    throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  }
};

/** Write access (comment/like/report) — view + membership + not muted. */
const assertCanInteractWithShort = async (
  short: IShort,
  requester: TRequester,
): Promise<void> => {
  await assertCanViewShort(short, requester);

  if (short.group) {
    const group = await GPerm.loadGroup(String(short.group));
    const membership = await GPerm.getMembership(group._id, requester.id);
    if (!GPerm.isActiveMember(membership) && requester.role !== "ADMIN") {
      throw new AppError(httpStatus.FORBIDDEN, "Join the group to interact with its shorts");
    }
    if (GPerm.isBanned(membership)) {
      throw new AppError(httpStatus.FORBIDDEN, "You are banned from this group");
    }
    if (GPerm.isActiveMember(membership) && group.mutedUsers.some((id) => String(id) === requester.id)) {
      throw new AppError(httpStatus.FORBIDDEN, "You are muted in this group");
    }
  }
};

/* ------------------------------------------------------------------ */
/* Creation                                                            */
/* ------------------------------------------------------------------ */

const createShortIntoDB = async (
  payload: Record<string, unknown>,
  requester: TRequester,
): Promise<IShort> => {
  const video = assertVideoUrl(payload.video);
  assertImageUrl(payload.coverImage);

  const declaredDuration =
    payload.duration === undefined || payload.duration === null
      ? null
      : Number(payload.duration);

  if (declaredDuration !== null) {
    if (!Number.isFinite(declaredDuration) || declaredDuration < 0) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid video duration");
    }
    if (declaredDuration > (config.short_max_duration_seconds || 180)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Video must be shorter than ${config.short_max_duration_seconds || 180} seconds`,
      );
    }
  }

  const declaredSizeBytes =
    payload.sizeBytes === undefined || payload.sizeBytes === null
      ? null
      : Number(payload.sizeBytes);
  if (declaredSizeBytes !== null) {
    const maxBytes = (config.short_max_size_mb || 100) * 1024 * 1024;
    if (!Number.isFinite(declaredSizeBytes) || declaredSizeBytes <= 0) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid video size");
    }
    if (declaredSizeBytes > maxBytes) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Video must be smaller than ${config.short_max_size_mb || 100}MB`,
      );
    }
  }

  const audienceValues = Object.values(SHORT_AUDIENCE);
  const audience = audienceValues.includes(
    payload.audience as (typeof SHORT_AUDIENCE)[keyof typeof SHORT_AUDIENCE],
  )
    ? (payload.audience as IShort["audience"])
    : SHORT_AUDIENCE.PUBLIC;

  const hashtags = Array.isArray(payload.hashtags)
    ? (payload.hashtags as unknown[])
        .slice(0, 15)
        .map((t) => String(t).replace(/^#/, "").trim().slice(0, 40))
        .filter(Boolean)
    : [];

  let group: Types.ObjectId | null = null;
  let groupDoc: Awaited<ReturnType<typeof GPerm.loadGroup>> | null = null;
  let isStaff = requester.role === "ADMIN";

  if (payload.group) {
    groupDoc = await GPerm.loadGroup(String(payload.group));
    const membership = await GPerm.getMembership(groupDoc._id, requester.id);
    if (!GPerm.canViewGroup(groupDoc, membership, requester)) {
      throw new AppError(httpStatus.NOT_FOUND, "Group not found");
    }
    GPerm.assert(groupDoc, membership, requester, "group:post");
    if (GPerm.isBanned(membership)) {
      throw new AppError(httpStatus.FORBIDDEN, "You are banned from this group");
    }
    if (groupDoc.mutedUsers.some((id) => String(id) === requester.id)) {
      throw new AppError(httpStatus.FORBIDDEN, "You are muted in this group");
    }
    if (
      membership &&
      isStaffRole(membership.role) &&
      GPerm.isActiveMember(membership)
    ) {
      isStaff = true;
    }
    if (groupDoc.postPermission === "ADMINS" && !isStaff) {
      throw new AppError(httpStatus.FORBIDDEN, "Only admins can post in this group");
    }
    group = groupDoc._id;
  }

  // Group post-approval rules also govern shorts submitted as group posts.
  const pendingGroupApproval = !!groupDoc && groupDoc.postApprovalEnabled && !isStaff;

  let status: IShort["status"] = SHORT_STATUS.PUBLISHED;
  if (pendingGroupApproval) {
    status = SHORT_STATUS.PENDING;
  } else if (config.short_remote_verify) {
    status = SHORT_STATUS.PROCESSING;
  }

  const short = await Short.create({
    user: requester.id,
    group,
    title: payload.title ? String(payload.title) : null,
    caption: payload.caption ? String(payload.caption) : null,
    video,
    coverImage: payload.coverImage ?? null,
    duration: declaredDuration,
    location: payload.location ? String(payload.location) : null,
    hashtags,
    audience,
    status,
    moderationStatus: GROUP_MODERATION_STATUS.APPROVED,
  });

  if (status === SHORT_STATUS.PROCESSING) {
    // Async origin verification; the short only becomes visible on success.
    void finalizeProcessing(String(short._id));
  }

  if (groupDoc) {
    await logGroupActivity(groupDoc._id, requester.id, GROUP_ACTIVITY_ACTION.SETTINGS_UPDATED, {
      targetType: "short",
      targetId: String(short._id),
      metadata: { status },
    });
    if (pendingGroupApproval) {
      const { GroupService } = await import("../Group/group.service");
      const staffIds = await GroupService.staffIdsOf(groupDoc);
      await Promise.all(
        staffIds.map((id) =>
          NotificationService.createNotificationIntoDB({
            recipient: id,
            actor: requester.id,
            type: "group.short_pending",
            title: "A new Short awaits review",
            body: `A member submitted a Short to ${groupDoc?.name}.`,
            link: `/groups/${groupDoc?.slug}/moderation`,
            entityType: "short",
            entityId: String(short._id),
            groupId: String(groupDoc?._id),
            dedupe: true,
          }),
        ),
      );
    }
  }

  return short;
};

/**
 * Processing pipeline. With SHORT_REMOTE_VERIFY enabled the asset is
 * HEAD-verified at the origin; failures leave the Short in FAILED with a
 * reason (never silently "published"). Without remote verification the
 * synchronous URL validation at creation time is authoritative.
 */
const finalizeProcessing = async (shortId: string): Promise<void> => {
  try {
    const short = await Short.findById(shortId);
    if (!short || short.status !== SHORT_STATUS.PROCESSING) return;

    await verifyRemoteVideo(short.video);

    const groupDoc = short.group ? await GPerm.loadGroup(String(short.group)) : null;
    const shouldStayPending = !!groupDoc && groupDoc.postApprovalEnabled;
    short.status = shouldStayPending ? SHORT_STATUS.PENDING : SHORT_STATUS.PUBLISHED;
    await short.save();
  } catch (err) {
    await Short.updateOne(
      { _id: shortId, status: SHORT_STATUS.PROCESSING },
      {
        status: SHORT_STATUS.FAILED,
        rejectionReason:
          err instanceof AppError
            ? err.message
            : "Video processing failed — please re-upload",
      },
    );
  }
};

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
const getShortsFeedFromDB = async (query: TQuery, requester: TRequester) => {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const limit = Math.min(30, Math.max(1, parseInt(String(query.limit ?? "10"), 10) || 10));

  const myGroupIds = await GroupMembership.find({
    user: requester.id,
    status: "APPROVED",
  }).distinct("group");

  const accessibleGroups = [null, ...myGroupIds];

  const clauses: Record<string, unknown>[] = [
    // Own shorts inside groups the viewer can still access.
    { user: requester.id, group: { $in: accessibleGroups } },
    // Public audience.
    { audience: SHORT_AUDIENCE.PUBLIC, group: { $in: accessibleGroups } },
  ];

  const following = (await User.findById(requester.id).select("following").lean())
    ?.following;
  if (following && following.length) {
    clauses.push({
      audience: SHORT_AUDIENCE.FOLLOWERS,
      user: { $in: following },
      group: { $in: accessibleGroups },
    });
  }

  const filter: Record<string, unknown> = {
    isDeleted: false,
    status: SHORT_STATUS.PUBLISHED,
    moderationStatus: GROUP_MODERATION_STATUS.APPROVED,
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

  const [items, total] = await Promise.all([
    Short.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user", "name image verified"),
    Short.countDocuments(filter),
  ]);

  const likedSet = new Set(
    items.flatMap((s) =>
      (s.likes ?? []).some((l) => String(l) === requester.id) ? [String(s._id)] : [],
    ),
  );

  return {
    result: items.map((s) => ({
      ...(s.toObject() as unknown as Record<string, unknown>),
      likedByMe: likedSet.has(String(s._id)),
      viewedByMe: (s.views ?? []).some((v) => String(v) === requester.id),
    })),
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) || 1 },
  };
};

const getSingleShortFromDB = async (shortId: string, requester: TRequester) => {
  if (!Types.ObjectId.isValid(shortId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  }
  const short = await Short.findById(shortId).populate("user", "name image verified");
  if (!short) throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  await assertCanViewShort(short, requester);
  return {
    ...(short.toObject() as unknown as Record<string, unknown>),
    likedByMe: (short.likes ?? []).some((l) => String(l) === requester.id),
    viewedByMe: (short.views ?? []).some((v) => String(v) === requester.id),
  };
};

/* ------------------------------------------------------------------ */
/* Engagement                                                          */
/* ------------------------------------------------------------------ */

const viewShortIntoDB = async (shortId: string, requester: TRequester) => {
  if (!Types.ObjectId.isValid(shortId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  }
  const short = await Short.findById(shortId);
  if (!short) throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  await assertCanViewShort(short, requester);

  // One counted view per viewer (retry-safe / dedup on retries).
  const res = await Short.updateOne(
    { _id: short._id, views: { $ne: requester.id } },
    { $addToSet: { views: requester.id }, $inc: { viewCount: 1 } },
  );
  return { counted: res.modifiedCount > 0, viewCount: short.viewCount };
};

const likeShortIntoDB = async (shortId: string, requester: TRequester) => {
  if (!Types.ObjectId.isValid(shortId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  }
  const short = await Short.findById(shortId);
  if (!short) throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  await assertCanInteractWithShort(short, requester);

  const already = (short.likes ?? []).some((l) => String(l) === requester.id);
  if (!already) {
    await Short.updateOne(
      { _id: short._id },
      { $addToSet: { likes: new Types.ObjectId(requester.id) } },
    );
    await NotificationService.createNotificationIntoDB({
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

  const updated = await Short.findById(short._id).select("likes");
  return { likes: updated?.likes ?? [], liked: true };
};

const unlikeShortIntoDB = async (shortId: string, requester: TRequester) => {
  if (!Types.ObjectId.isValid(shortId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  }
  const short = await Short.findById(shortId);
  if (!short) throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  await assertCanInteractWithShort(short, requester);

  await Short.updateOne(
    { _id: short._id },
    { $pull: { likes: new Types.ObjectId(requester.id) } },
  );
  const updated = await Short.findById(short._id).select("likes");
  return { likes: updated?.likes ?? [], liked: false };
};

const reportShortIntoDB = async (
  shortId: string,
  reason: string,
  requester: TRequester,
) => {
  if (!Types.ObjectId.isValid(shortId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  }
  const short = await Short.findById(shortId);
  if (!short) throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  await assertCanViewShort(short, requester);

  const updated = await Short.findByIdAndUpdate(
    short._id,
    { $inc: { reportCount: 1 } },
    { new: true },
  );
  void reason;
  return updated;
};

/* ------------------------------------------------------------------ */
/* Author management                                                   */
/* ------------------------------------------------------------------ */

const updateShortIntoDB = async (
  shortId: string,
  payload: Record<string, unknown>,
  requester: TRequester,
) => {
  if (!Types.ObjectId.isValid(shortId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  }
  const short = await Short.findById(shortId);
  if (!short || short.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  }

  const isOwner = String(short.user) === requester.id;
  if (!isOwner && requester.role !== "ADMIN") {
    // Group staff may edit shorts inside their group.
    if (short.group) {
      const membership = await GPerm.getMembership(
        new Types.ObjectId(String(short.group)),
        requester.id,
      );
      if (!GPerm.isStaff(membership, requester)) {
        throw new AppError(httpStatus.FORBIDDEN, "Not allowed to edit this short");
      }
    } else {
      throw new AppError(httpStatus.FORBIDDEN, "Not allowed to edit this short");
    }
  }

  const update: Record<string, unknown> = {};
  if (payload.title !== undefined) update.title = String(payload.title);
  if (payload.caption !== undefined) update.caption = String(payload.caption);
  if (payload.location !== undefined) update.location = String(payload.location);
  if (payload.coverImage !== undefined) {
    assertImageUrl(payload.coverImage);
    update.coverImage = payload.coverImage;
  }
  if (Array.isArray(payload.hashtags)) {
    update.hashtags = (payload.hashtags as unknown[])
      .slice(0, 15)
      .map((t) => String(t).replace(/^#/, "").trim().slice(0, 40))
      .filter(Boolean);
  }
  if (payload.audience !== undefined) {
    const audience = payload.audience;
    if (!Object.values(SHORT_AUDIENCE).includes(audience as never)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid audience");
    }
    update.audience = audience;
  }

  if (Object.keys(update).length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, "No valid fields to update");
  }

  const updated = await Short.findByIdAndUpdate(short._id, update, { new: true });
  return updated;
};

const deleteShortFromDB = async (shortId: string, requester: TRequester) => {
  if (!Types.ObjectId.isValid(shortId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  }
  const short = await Short.findById(shortId);
  if (!short || short.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  }

  const isOwner = String(short.user) === requester.id;
  if (!isOwner && requester.role !== "ADMIN") {
    if (short.group) {
      const membership = await GPerm.getMembership(
        new Types.ObjectId(String(short.group)),
        requester.id,
      );
      if (!GPerm.isStaff(membership, requester)) {
        throw new AppError(httpStatus.FORBIDDEN, "Not allowed to delete this short");
      }
    } else {
      throw new AppError(httpStatus.FORBIDDEN, "Not allowed to delete this short");
    }
  }

  // Soft delete: media cleanup happens later (purge) once nothing references it.
  await Short.updateOne({ _id: short._id }, { isDeleted: true, status: SHORT_STATUS.REMOVED });
  return true;
};

/* ------------------------------------------------------------------ */
/* Group moderation of shorts                                          */
/* ------------------------------------------------------------------ */

const moderateShortIntoDB = async (
  groupRef: string,
  shortId: string,
  action: "approve" | "reject" | "remove",
  reason: string | undefined,
  requester: TRequester,
) => {
  const { group } = await GPerm.authorize(groupRef, requester, "group:moderatePost");
  if (!Types.ObjectId.isValid(shortId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  }
  const short = await Short.findOne({ _id: shortId, group: group._id });
  if (!short) throw new AppError(httpStatus.NOT_FOUND, "Short not found");

  if (action === "approve") {
    short.moderationStatus = GROUP_MODERATION_STATUS.APPROVED;
    short.status = SHORT_STATUS.PUBLISHED;
    short.rejectionReason = null;
  } else if (action === "reject") {
    short.moderationStatus = GROUP_MODERATION_STATUS.REJECTED;
    short.status = SHORT_STATUS.REJECTED;
    short.rejectionReason = reason ?? "This Short does not meet the group rules.";
  } else {
    short.moderationStatus = GROUP_MODERATION_STATUS.REMOVED;
    short.status = SHORT_STATUS.REMOVED;
    short.rejectionReason = reason ?? "Removed by group staff.";
  }
  await short.save();

  await logGroupActivity(
    group._id,
    requester.id,
    action === "approve"
      ? GROUP_ACTIVITY_ACTION.POST_APPROVED
      : action === "reject"
        ? GROUP_ACTIVITY_ACTION.POST_REJECTED
        : GROUP_ACTIVITY_ACTION.POST_REMOVED,
    { targetType: "short", targetId: String(short._id), metadata: { action } },
  );

  await NotificationService.createNotificationIntoDB({
    recipient: String(short.user),
    actor: requester.id,
    type: `group.short_${action}`,
    title:
      action === "approve"
        ? "Your Short was approved"
        : action === "reject"
          ? "Your Short was not approved"
          : "Your Short was removed",
    body: short.rejectionReason ?? undefined,
    link: `/groups/${group.slug}`,
    entityType: "short",
    entityId: String(short._id),
    groupId: String(group._id),
    dedupe: true,
  });

  return short;
};

/* ------------------------------------------------------------------ */
/* Media cleanup (safe purge)                                          */
/* ------------------------------------------------------------------ */

/**
 * Returns every community document (other than the given shortId) that still
 * references the media URL. Cleanup must never destroy media that is still
 * referenced by a post, comment, profile, group, story or another short.
 */
const findMediaReferences = async (
  mediaUrl: string,
  excludeShortId: string,
): Promise<{ collection: string; count: number }[]> => {
  const results: { collection: string; count: number }[] = [];
  const notSelf = { $ne: new Types.ObjectId(excludeShortId) };

  const [posts, comments, shorts, users, groups, stories] = await Promise.all([
    Post.countDocuments({ images: mediaUrl, isDeleted: false }),
    Comment.countDocuments({ images: mediaUrl, isDeleted: false }),
    Short.countDocuments({ $or: [{ video: mediaUrl }, { coverImage: mediaUrl }], _id: notSelf }),
    User.countDocuments({ $or: [{ image: mediaUrl }, { coverImage: mediaUrl }] }),
    // Groups store media on image/coverImage fields.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    (await import("../Group/group.model")).Group.countDocuments({
      $or: [{ image: mediaUrl }, { coverImage: mediaUrl }],
    }),
    (await import("../Story/story.model")).Story.countDocuments({ media: mediaUrl }),
  ]);

  if (posts) results.push({ collection: "posts", count: posts });
  if (comments) results.push({ collection: "comments", count: comments });
  if (shorts) results.push({ collection: "shorts", count: shorts });
  if (users) results.push({ collection: "users", count: users });
  if (groups) results.push({ collection: "groups", count: groups });
  if (stories) results.push({ collection: "stories", count: stories });
  return results;
};

const purgeShortFromDB = async (shortId: string, requester: TRequester) => {
  if (!Types.ObjectId.isValid(shortId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Short not found");
  }
  const short = await Short.findById(shortId);
  if (!short) throw new AppError(httpStatus.NOT_FOUND, "Short not found");

  const isOwner = String(short.user) === requester.id;
  if (!isOwner && requester.role !== "ADMIN") {
    throw new AppError(httpStatus.FORBIDDEN, "Not allowed to purge this short");
  }

  const references = await findMediaReferences(short.video, String(short._id));
  if (references.length > 0) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Media is still referenced elsewhere and cannot be removed",
    );
  }

  // Best-effort remote destroy (only when Cloudinary is configured).
  try {
    if (config.cloudinary_cloud_name && config.cloudinary_api_key && config.cloudinary_api_secret) {
      // Lazy require keeps startup light and avoids failing without creds.
      const cloudinary = (await import("cloudinary")).v2;
      cloudinary.config({
        cloud_name: config.cloudinary_cloud_name,
        api_key: config.cloudinary_api_key,
        api_secret: config.cloudinary_api_secret,
      });
      const publicId = extractCloudinaryPublicId(short.video);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId, { resource_type: "video" });
      }
    }
  } catch {
    // Remote cleanup is best-effort; the document removal below is what
    // guarantees the content is no longer served.
  }

  await Short.deleteOne({ _id: short._id });
  return true;
};

const extractCloudinaryPublicId = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/video\/upload\/(?:[^/]+\/)*([^/]+?)(?:\.[a-z0-9]+)?$/i);
    if (!match) return null;
    const candidate = decodeURIComponent(match[1]);
    // Strip leading folder transforms if any.
    return candidate.split("/").pop() ?? candidate;
  } catch {
    return null;
  }
};

export const ShortService = {
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
