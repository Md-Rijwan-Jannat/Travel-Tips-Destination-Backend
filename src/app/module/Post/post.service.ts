import { QueryObj, TPost, TReport } from './post.interface';
import { Post } from './post.model';
import { PostHidden } from './postHidden.model';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';
import QueryBuilder from '../../builder/QueryBuilder';
import {
  GROUP_PIN_LIMIT,
  postSearchFields,
} from './post.constants';
import mongoose from 'mongoose';
import { Group } from '../Group/group.model';
import { GroupPermissionService as GPerm } from '../Group/group.permissions';
import { GROUP_MODERATION_STATUS, GROUP_ROLE } from '../Group/group.constants';
import { isStaffRole } from '../Group/group.permissions';
import { isGloballyVisibleFilter, assertCanViewPost } from './postAccess';
import { NotificationService } from '../Notification/notification.service';
import { Comment } from '../Comment/comment.model';

type TRequesterShape = { id: string; role: string };

/**
 * Post ids the caller hid from their OWN feed. Hiding is scoped to the user
 * and never modifies the original post for anyone else.
 */
const getHiddenPostIds = async (
  userId: string,
): Promise<mongoose.Types.ObjectId[]> => {
  const rows = await PostHidden.find({ user: userId })
    .select('post')
    .lean();
  return rows.map((row) => row.post as mongoose.Types.ObjectId);
};

// Create a new post. When `group` is present the request is authorized
// against the community permission layer: membership, role, posting
// settings and post-approval (moderation) state are all decided server-side.
const createPostIntoDB = async (
  payload: TPost,
  userId: string,
  requester?: TRequesterShape,
): Promise<TPost> => {
  const req: TRequesterShape = requester ?? { id: userId, role: 'USER' };

  const { group: rawGroup, ...rest } = payload as TPost & {
    group?: unknown;
  };

  if (!rawGroup) {
    const post = await Post.create({ ...rest, user: userId });
    return post;
  }

  const group = await GPerm.loadGroup(String(rawGroup));
  const membership = await GPerm.getMembership(group._id, userId);

  if (!GPerm.canViewGroup(group, membership, req)) {
    throw new AppError(httpStatus.NOT_FOUND, 'Group not found');
  }
  if (GPerm.isBanned(membership)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You are banned from this group');
  }

  // Membership + `group:post` permission (member-only posting, mute/ban).
  GPerm.assert(group, membership, req, 'group:post');

  if (group.mutedUsers.some((id) => String(id) === userId)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You are muted in this group');
  }

  const isStaff =
    req.role === 'ADMIN' ||
    (membership !== null &&
      isStaffRole(membership.role) &&
      GPerm.isActiveMember(membership));

  // Posting-roles policy: ADMINS-only groups reject ordinary members.
  if (group.postPermission === 'ADMINS' && !isStaff) {
    throw new AppError(httpStatus.FORBIDDEN, 'Only admins can post in this group');
  }

  // Approval toggle decides the moderation state. Staff posts publish
  // immediately; ordinary member posts become PENDING when approval is ON.
  const moderationStatus =
    group.postApprovalEnabled && !isStaff
      ? GROUP_MODERATION_STATUS.PENDING
      : GROUP_MODERATION_STATUS.APPROVED;

  const post = await Post.create({
    ...rest,
    user: userId,
    group: group._id,
    groupVisibility: group.visibility,
    moderationStatus,
  });

  if (moderationStatus === GROUP_MODERATION_STATUS.APPROVED) {
    await notifyGroupOfNewPost(group._id, userId, post);
  }

  return post;
};

// Fan-out: notify approved members of a newly published group post,
// respecting the group-level notification preference. Capped to avoid
// write storms in very large groups.
const notifyGroupOfNewPost = async (
  groupId: mongoose.Types.ObjectId,
  authorId: string,
  post: TPost,
): Promise<void> => {
  const group = await Group.findById(groupId)
    .select('name slug notifyOnNewPost memberCount');
  if (!group || !group.notifyOnNewPost) return;

  const { GroupMembership } = await import('../Group/groupMembership.model');
  const recipients = await GroupMembership.find({
    group: groupId,
    status: 'APPROVED',
    user: { $ne: authorId },
    mutedNotifications: { $ne: true },
  })
    .limit(100)
    .distinct('user');

  await Promise.all(
    recipients.map((recipient) =>
      NotificationService.createNotificationIntoDB({
        recipient: String(recipient),
        actor: authorId,
        type: 'group.new_post',
        title: `New post in ${group.name}`,
        body: post.title,
        link: `/groups/${group.slug}?post=${String(post._id)}`,
        entityType: 'post',
        entityId: String(post._id),
        groupId: String(groupId),
      }),
    ),
  );
};

// Get a post by ID (private group posts and non-approved posts are hidden
// from unauthorized requesters with the same 404 as a missing post).
const getPostByIdFromDB = async (
  postId: string,
  requester?: TRequesterShape,
): Promise<TPost | null> => {
  const post = await Post.findById(postId).populate('user comments');
  if (!post || post.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Post not found');
  }
  if (requester) {
    await assertCanViewPost(post, requester);
  }
  return post;
};

// Get all posts for normal posts
const getAllPostsNormalForAnalytics = async (query: Record<string, unknown>) => {
  const postQueryBuilder = new QueryBuilder(
    Post.find({ isDeleted: false, status: 'FREE' })
      .populate({
        path: 'user',
      })
      .populate({
        path: 'comments',
        populate: {
          path: 'user',
          model: 'User',
        },
      }),
    query
  )
    .search(postSearchFields)
    .sort()
    .fields()
    .filter()
    .paginate();

  const result = await postQueryBuilder.modelQuery;
  const meta = await postQueryBuilder.countTotal();

  // Return meta only if the role is ADMIN
  return { result: result, meta: meta };
};

// Get all posts for premium posts
const getAllPostsPremiumForAnalytics = async (query: Record<string, unknown>) => {
  const postQueryBuilder = new QueryBuilder(
    Post.find({ isDeleted: false, status: 'PREMIUM' })
      .populate({
        path: 'user',
      })
      .populate({
        path: 'comments',
        populate: {
          path: 'user',
          model: 'User',
        },
      }),
    query
  )
    .search(postSearchFields)
    .sort()
    .fields()
    .filter()
    .paginate();

  const result = await postQueryBuilder.modelQuery;
  const meta = await postQueryBuilder.countTotal();

  // Return meta only if the role is ADMIN
  return { result: result, meta: meta };
};

// Get all posts (with optional filters). `requester` scopes the feed so
// posts the caller hid from their own feed are excluded (the original post
// stays visible to everyone else).
const getAllPostsFromDB = async (
  query: Record<string, unknown>,
  requester?: TRequesterShape,
) => {
  const { categories } = query;

  // Global feed never exposes private-group posts or unapproved group posts.
  let queryObj = {
    isDeleted: false,
    status: 'FREE',
    ...isGloballyVisibleFilter,
  } as unknown as QueryObj;

  if (categories) {
    queryObj = {
      ...queryObj,
      category: { $in: categories as string[] },
    };
  }

  const hiddenIds = requester ? await getHiddenPostIds(requester.id) : [];
  if (hiddenIds.length > 0) {
    queryObj._id = { $nin: hiddenIds } as unknown as QueryObj['_id'];
  }

  // Build the post query
  const postQueryBuilder = new QueryBuilder(
    Post.find(queryObj as mongoose.FilterQuery<TPost>)
      .populate({
        path: 'user',
      })
      .populate({
        path: 'comments',
        populate: {
          path: 'user',
          model: 'User',
        },
      }),
    query
  )
    .search(postSearchFields)
    .sort()
    .fields()
    .filter()
    .paginate();

  // Execute the query
  const result = await postQueryBuilder.modelQuery;
  const meta = await postQueryBuilder.countTotal();

  // Return result and meta (meta only if the role is ADMIN)
  return { result, meta };
};

// Get all premium posts (with optional filters)
const getAllPremiumPostsFromDB = async (
  query: Record<string, unknown>,
  requester?: TRequesterShape,
) => {
  const { categories } = query;

  let queryObj = {
    isDeleted: false,
    status: 'PREMIUM',
    ...isGloballyVisibleFilter,
  } as unknown as QueryObj;

  if (categories) {
    queryObj = {
      ...queryObj,
      category: { $in: categories as string[] },
    };
  }

  const hiddenIds = requester ? await getHiddenPostIds(requester.id) : [];
  if (hiddenIds.length > 0) {
    queryObj._id = { $nin: hiddenIds } as unknown as QueryObj['_id'];
  }

  // Build the post query
  const postQueryBuilder = new QueryBuilder(
    Post.find(queryObj as mongoose.FilterQuery<TPost>)
      .populate({
        path: 'user',
      })
      .populate({
        path: 'comments',
        populate: {
          path: 'user',
          model: 'User',
        },
      }),
    query
  )
    .search(postSearchFields)
    .sort()
    .fields()
    .filter()
    .paginate();

  // Execute the query
  const result = await postQueryBuilder.modelQuery;
  const meta = await postQueryBuilder.countTotal();

  // Return result and meta (meta only if the role is ADMIN)
  return { result, meta };
};

// Fields an owner may change through the update endpoint. Ownership/integrity
// fields (user, reportCount, isDeleted, ...) are never writable by the client.
const EDITABLE_POST_FIELDS = [
  'title',
  'description',
  'images',
  'category',
  'status',
  'location',
  'tags',
  'mediaLayout',
] as const;

// Content fields whose change marks the post as edited.
const EDIT_MARKER_FIELDS = [
  'title',
  'description',
  'images',
  'location',
  'tags',
  'mediaLayout',
] as const;

type TRequester = { id: string; role: string };

const assertCanModifyPost = async (
  post: { user: unknown; group?: unknown },
  requester: TRequester,
) => {
  const isOwner = String(post.user) === requester.id;
  if (isOwner || requester.role === 'ADMIN') return;

  // Group staff may edit posts inside their group.
  if (post.group) {
    const group = await Group.findById(String(post.group));
    if (group && !group.isDeleted) {
      const membership = await GPerm.getMembership(group._id, requester.id);
      if (
        GPerm.isActiveMember(membership) &&
        membership &&
        (membership.role === GROUP_ROLE.OWNER ||
          membership.role === GROUP_ROLE.ADMIN ||
          membership.role === GROUP_ROLE.MODERATOR)
      ) {
        return;
      }
    }
  }

  throw new AppError(
    httpStatus.FORBIDDEN,
    'You are not allowed to modify this post',
  );
};

// Update a post by ID (owner or admin only)
const updatePostIntoDB = async (
  postId: string,
  payload: Partial<TPost>,
  requester: TRequester,
): Promise<TPost | null> => {
  const existing = await Post.findById(postId);
  if (!existing || existing.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Post not found');
  }
  await assertCanModifyPost(existing, requester);

  const allowed: Record<string, unknown> = {};
  for (const field of EDITABLE_POST_FIELDS) {
    if (payload[field] !== undefined) {
      allowed[field] = payload[field];
    }
  }

  // Content changes are marked as edited (caption/media/layout) so readers
  // see an honest "Edited" indicator. Pure metadata (category/status) is not
  // an edit of the visible content.
  const contentChanged = EDIT_MARKER_FIELDS.some(
    (field) => payload[field] !== undefined,
  );
  if (contentChanged) {
    allowed.isEdited = true;
    allowed.editedAt = new Date();
  }

  const post = await Post.findByIdAndUpdate(postId, allowed, { new: true });
  if (!post) {
    throw new AppError(httpStatus.NOT_FOUND, 'Post not found');
  }
  return post;
};

// Delete a post by ID (soft delete, owner or admin only)
const deletePostFromDB = async (
  postId: string,
  requester: TRequester,
): Promise<TPost | null> => {
  const existing = await Post.findById(postId);
  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, 'Post not found');
  }
  await assertCanModifyPost(existing, requester);

  const post = await Post.findByIdAndUpdate(
    postId,
    { isDeleted: true },
    { new: true }
  );
  if (!post) {
    throw new AppError(httpStatus.NOT_FOUND, 'Post not found');
  }
  return post;
};

// Delete a post by ID (soft delete)
const recoverPostFromDB = async (postId: string): Promise<TPost | null> => {
  const post = await Post.findByIdAndUpdate(
    postId,
    { isDeleted: false },
    { new: true }
  );
  if (!post) {
    throw new AppError(httpStatus.NOT_FOUND, 'Post not found');
  }
  return post;
};

const reportPostFromDB = async (
  postId: string,
  payload: TReport,
  userId: string,
  requester?: TRequesterShape
): Promise<TPost | null> => {
  if (!mongoose.Types.ObjectId.isValid(postId)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid Post ID');
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid User ID');
  }

  // Find the post first to check the reportCount
  const post = await Post.findById(postId);

  if (!post) {
    throw new AppError(httpStatus.NOT_FOUND, 'Post not found');
  }

  // Reporting requires read access (never confirm private group content).
  await assertCanViewPost(post, requester ?? { id: userId, role: 'USER' });

  // Increment the report count
  const updatedReportCount = post.reportCount + 1;

  // If reportCount reaches 5, soft delete the post
  const isSoftDeleted = updatedReportCount >= 5;

  // Update the post with new report and report count
  const updatedPost = await Post.findByIdAndUpdate(
    postId,
    {
      $push: {
        report: {
          report: payload.report,
          user: userId,
          post: postId,
        },
      },
      reportCount: updatedReportCount,
      isDeleted: isSoftDeleted,
    },
    { new: true }
  );

  return updatedPost;
};

export { notifyGroupOfNewPost };

/* ------------------------------------------------------------------ */
/* Profile pin / highlight / hide / comment settings                   */
/* ------------------------------------------------------------------ */

/** Profile pin & feature are owner-scoped (or platform admin) only. */
const assertIsOwnerOrAdmin = (post: { user: unknown }, requester: TRequesterShape): void => {
  const isOwner = String(post.user) === requester.id;
  if (!isOwner && requester.role !== 'ADMIN') {
    throw new AppError(httpStatus.FORBIDDEN, 'Only the post owner can do this');
  }
};

const loadExistingPost = async (postId: string): Promise<TPost> => {
  const post = await Post.findById(postId);
  if (!post || post.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Post not found');
  }
  return post;
};

/**
 * Atomically move the author's single profile pin to `postId` (or remove it).
 * The partial unique index guarantees one pinned post per author; the E11000
 * retry makes concurrent pin requests resolve to a consistent single winner.
 */
const setProfilePinFromDB = async (
  postId: string,
  pinned: boolean,
  requester: TRequesterShape,
): Promise<TPost> => {
  const post = await loadExistingPost(postId);
  assertIsOwnerOrAdmin(post, requester);

  if (!pinned) {
    const updated = await Post.findByIdAndUpdate(
      postId,
      { $set: { pinned: false, pinnedAt: null } },
      { new: true },
    );
    return updated as TPost;
  }

  // Release any other pin held by this author first (sequential correctness
  // even if indexes have not been built yet), then set this one.
  await Post.updateMany(
    { user: post.user, pinned: true, _id: { $ne: postId } },
    { $set: { pinned: false, pinnedAt: null } },
  );

  const attempt = () =>
    Post.findOneAndUpdate(
      { _id: postId },
      { $set: { pinned: true, pinnedAt: new Date() } },
      { new: true },
    );

  try {
    const updated = await attempt();
    if (!updated) throw new AppError(httpStatus.NOT_FOUND, 'Post not found');
    return updated;
  } catch (error) {
    const isDuplicate =
      error instanceof Error &&
      'code' in error &&
      (error as { code?: number }).code === 11000;
    if (!isDuplicate) throw error;
    // Another post of this author currently holds the pin slot — release it
    // and retry once (the latest writer wins).
    await Post.updateMany(
      { user: post.user, pinned: true, _id: { $ne: postId } },
      { $set: { pinned: false, pinnedAt: null } },
    );
    const updated = await attempt();
    if (!updated) throw new AppError(httpStatus.NOT_FOUND, 'Post not found');
    return updated;
  }
};

/** Move the author's single profile highlight/feature to `postId` (or clear). */
const setProfileFeatureFromDB = async (
  postId: string,
  featured: boolean,
  requester: TRequesterShape,
): Promise<TPost> => {
  const post = await loadExistingPost(postId);
  assertIsOwnerOrAdmin(post, requester);

  if (!featured) {
    const updated = await Post.findByIdAndUpdate(
      postId,
      { $set: { featured: false, featuredAt: null } },
      { new: true },
    );
    return updated as TPost;
  }

  // Same release-then-set pattern as profile pinning.
  await Post.updateMany(
    { user: post.user, featured: true, _id: { $ne: postId } },
    { $set: { featured: false, featuredAt: null } },
  );

  const attempt = () =>
    Post.findOneAndUpdate(
      { _id: postId },
      { $set: { featured: true, featuredAt: new Date() } },
      { new: true },
    );

  try {
    const updated = await attempt();
    if (!updated) throw new AppError(httpStatus.NOT_FOUND, 'Post not found');
    return updated;
  } catch (error) {
    const isDuplicate =
      error instanceof Error &&
      'code' in error &&
      (error as { code?: number }).code === 11000;
    if (!isDuplicate) throw error;
    await Post.updateMany(
      { user: post.user, featured: true, _id: { $ne: postId } },
      { $set: { featured: false, featuredAt: null } },
    );
    const updated = await attempt();
    if (!updated) throw new AppError(httpStatus.NOT_FOUND, 'Post not found');
    return updated;
  }
};

/**
 * Group pin — separate from profile pinning: requires the `group:moderatePost`
 * permission in the post's community group and is limited to
 * GROUP_PIN_LIMIT simultaneously pinned posts per group.
 */
const setGroupPinFromDB = async (
  postId: string,
  pinned: boolean,
  requester: TRequesterShape,
): Promise<TPost> => {
  const post = await loadExistingPost(postId);
  if (!post.group) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Only group posts can be pinned here');
  }

  const { group } = await GPerm.authorize(
    String(post.group),
    requester,
    'group:moderatePost',
  );

  if (!pinned) {
    const updated = await Post.findByIdAndUpdate(
      postId,
      { $set: { groupPinnedAt: null } },
      { new: true },
    );
    return updated as TPost;
  }

  const existingPinned = await Post.countDocuments({
    group: group._id,
    groupPinnedAt: { $ne: null },
    isDeleted: false,
    _id: { $ne: postId },
  });
  if (existingPinned >= GROUP_PIN_LIMIT) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `A group can pin at most ${GROUP_PIN_LIMIT} posts`,
    );
  }

  const updated = await Post.findByIdAndUpdate(
    postId,
    { $set: { groupPinnedAt: new Date() } },
    { new: true },
  );
  if (!updated) throw new AppError(httpStatus.NOT_FOUND, 'Post not found');
  return updated;
};

/** Hide a post from the caller's own feed (idempotent, scoped to the user). */
const hidePostForUserFromDB = async (
  postId: string,
  userId: string,
  requester: TRequesterShape,
): Promise<{ hidden: true }> => {
  const post = await Post.findById(postId);
  if (!post || post.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Post not found');
  }
  // Hiding requires read access (never confirm private group content).
  await assertCanViewPost(post, requester);

  await PostHidden.updateOne(
    { user: userId, post: postId },
    { $setOnInsert: { user: userId, post: postId } },
    { upsert: true },
  );
  return { hidden: true };
};

/** Undo a per-user hide. */
const unhidePostForUserFromDB = async (
  postId: string,
  userId: string,
): Promise<{ hidden: false }> => {
  await PostHidden.deleteOne({ user: userId, post: postId });
  return { hidden: false };
};

/** Persist the post owner's comment ordering + featured-comment policy. */
const updateCommentSettingsFromDB = async (
  postId: string,
  payload: {
    sortMode?: 'TOP' | 'NEWEST' | 'OLDEST';
    highlightMode?: 'AUTO' | 'MANUAL';
    highlightedComment?: string | null;
  },
  requester: TRequesterShape,
): Promise<TPost> => {
  const post = await loadExistingPost(postId);
  // Group moderation staff may sort, but only the OWNER picks the featured
  // comment (moderators never override the owner's highlight preference).
  assertIsOwnerOrAdmin(post, requester);

  const update: Record<string, unknown> = {};

  if (payload.sortMode !== undefined) {
    update['commentSettings.sortMode'] = payload.sortMode;
  }

  if (payload.highlightMode !== undefined) {
    update['commentSettings.highlightMode'] = payload.highlightMode;
    if (payload.highlightMode === 'AUTO') {
      update['commentSettings.highlightedComment'] = null;
    }
  }

  if (payload.highlightedComment !== undefined) {
    if (payload.highlightedComment === null) {
      update['commentSettings.highlightMode'] = 'AUTO';
      update['commentSettings.highlightedComment'] = null;
    } else {
      if (!mongoose.Types.ObjectId.isValid(payload.highlightedComment)) {
        throw new AppError(httpStatus.BAD_REQUEST, 'Invalid comment id');
      }
      const comment = await Comment.findById(payload.highlightedComment);
      if (
        !comment ||
        comment.isDeleted ||
        String(comment.post ?? '') !== postId
      ) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'The featured comment must be a visible comment on this post',
        );
      }
      update['commentSettings.highlightMode'] = 'MANUAL';
      update['commentSettings.highlightedComment'] = comment._id;
    }
  }

  const updated = await Post.findByIdAndUpdate(postId, update, { new: true });
  if (!updated) throw new AppError(httpStatus.NOT_FOUND, 'Post not found');
  return updated;
};

export const PostService = {
  createPostIntoDB,
  getPostByIdFromDB,
  getAllPostsPremiumForAnalytics,
  getAllPostsNormalForAnalytics,
  getAllPostsFromDB,
  getAllPremiumPostsFromDB,
  updatePostIntoDB,
  deletePostFromDB,
  recoverPostFromDB,
  reportPostFromDB,
  setProfilePinFromDB,
  setProfileFeatureFromDB,
  setGroupPinFromDB,
  hidePostForUserFromDB,
  unhidePostForUserFromDB,
  updateCommentSettingsFromDB,
  getHiddenPostIds,
};
