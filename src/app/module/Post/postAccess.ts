import httpStatus from "http-status";
import { Group } from "../Group/group.model";
import AppError from "../../errors/AppError";
import { GroupPermissionService as GPerm } from "../Group/group.permissions";
import { GROUP_VISIBILITY } from "../Group/group.constants";
import { TRequester } from "../Group/group.interface";

type TPostLike = {
  group?: unknown;
  groupVisibility?: string | null;
  moderationStatus?: string | null;
  user: unknown;
  isDeleted?: boolean;
  reportCount?: number;
};

const staffMembershipOf = async (groupId: unknown, userId: string) => {
  const membership = await GPerm.getMembership(
    groupId as Parameters<typeof GPerm.getMembership>[0],
    userId,
  );
  return membership;
};

/**
 * Shared authorization for reading a post entity (post detail, comment list,
 * reactions). A group post is only readable when the requester may view the
 * owning group AND the post's moderation state allows it (pending/rejected
 * posts are visible only to their author and group staff).
 *
 * Throws 404 for missing/invisible resources so private content cannot be
 * probed by ID.
 */
export const assertCanViewPost = async (
  post: TPostLike,
  requester: TRequester,
): Promise<void> => {
  if (post.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Post not found");
  }

  if (!post.group) {
    // Classic global post — but never expose un-moderated group-less content
    // states that shouldn't exist; treat pending/rejected as hidden.
    if (post.moderationStatus && post.moderationStatus !== "APPROVED") {
      throw new AppError(httpStatus.NOT_FOUND, "Post not found");
    }
    return;
  }

  const group = await Group.findById(String(post.group));
  if (!group || group.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Post not found");
  }

  const membership = await staffMembershipOf(group._id, requester.id);

  if (!GPerm.canViewGroup(group, membership, requester)) {
    throw new AppError(httpStatus.NOT_FOUND, "Post not found");
  }

  if (post.moderationStatus && post.moderationStatus !== "APPROVED") {
    const isAuthor = String(post.user) === requester.id;
    const isStaff = GPerm.isStaff(membership, requester);
    if (!isAuthor && !isStaff) {
      throw new AppError(httpStatus.NOT_FOUND, "Post not found");
    }
  }
};

/**
 * Write access (comment/react) on a group post requires active membership —
 * public visibility only grants read access.
 */
export const assertCanInteractWithPost = async (
  post: TPostLike,
  requester: TRequester,
): Promise<void> => {
  await assertCanViewPost(post, requester);

  if (!post.group) return;

  const group = await Group.findById(String(post.group));
  if (!group) throw new AppError(httpStatus.NOT_FOUND, "Post not found");

  const membership = await staffMembershipOf(group._id, requester.id);
  if (!GPerm.isActiveMember(membership) && requester.role !== "ADMIN") {
    throw new AppError(httpStatus.FORBIDDEN, "Join the group to interact with its posts");
  }
  if (GPerm.isBanned(membership)) {
    throw new AppError(httpStatus.FORBIDDEN, "You are banned from this group");
  }
};

/** True when the post may appear in the public/global feed. */
export const isGloballyVisibleFilter = {
  $or: [
    // Non-group posts (missing or null `group`).
    { group: null },
    // Only group posts from public groups can surface globally.
    { groupVisibility: GROUP_VISIBILITY.PUBLIC },
  ],
  $and: [
    {
      $or: [{ moderationStatus: "APPROVED" }, { moderationStatus: null }],
    },
  ],
};
