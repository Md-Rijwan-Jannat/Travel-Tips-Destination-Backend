import { QueryObj, TPost, TReport } from './post.interface';
import { Post } from './post.model';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';
import QueryBuilder from '../../builder/QueryBuilder';
import { postSearchFields } from './post.constants';
import mongoose from 'mongoose';
import { Group } from '../Group/group.model';
import { GroupPermissionService as GPerm } from '../Group/group.permissions';
import { GROUP_MODERATION_STATUS, GROUP_ROLE } from '../Group/group.constants';
import { isStaffRole } from '../Group/group.permissions';
import { isGloballyVisibleFilter, assertCanViewPost } from './postAccess';
import { NotificationService } from '../Notification/notification.service';

type TRequesterShape = { id: string; role: string };

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

// Get all posts (with optional filters)
const getAllPostsFromDB = async (query: Record<string, unknown>) => {
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
const getAllPremiumPostsFromDB = async (query: Record<string, unknown>) => {
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
};
