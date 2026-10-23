import httpStatus from "http-status";
import { Types } from "mongoose";
import AppError from "../../errors/AppError";
import { Group } from "./group.model";
import { GroupMembership } from "./groupMembership.model";
import {
  GROUP_MEMBERSHIP_STATUS,
  GROUP_ROLE,
  GROUP_VISIBILITY,
  TGroupRole,
} from "./group.constants";
import { IGroup, TRequester } from "./group.interface";

export type TPermission =
  | "group:view"
  | "group:viewPrivateContent"
  | "group:post"
  | "group:comment"
  | "group:join"
  | "group:leave"
  | "group:invite"
  | "group:chat"
  | "group:manageGeneral"
  | "group:manageVisibility"
  | "group:manageMedia"
  | "group:managePosting"
  | "group:manageApproval"
  | "group:manageMembers"
  | "group:manageRoles"
  | "group:appointModerator"
  | "group:promoteAdmin"
  | "group:manageInvites"
  | "group:moderatePost"
  | "group:moderateReports"
  | "group:viewAuditLog"
  | "group:transferOwnership"
  | "group:delete";

const ROLE_PERMISSIONS: Record<TGroupRole, TPermission[]> = {
  OWNER: [
    "group:view",
    "group:viewPrivateContent",
    "group:post",
    "group:comment",
    "group:join",
    "group:leave",
    "group:invite",
    "group:chat",
    "group:manageGeneral",
    "group:manageVisibility",
    "group:manageMedia",
    "group:managePosting",
    "group:manageApproval",
    "group:manageMembers",
    "group:manageRoles",
    "group:appointModerator",
    "group:promoteAdmin",
    "group:manageInvites",
    "group:moderatePost",
    "group:moderateReports",
    "group:viewAuditLog",
    "group:transferOwnership",
    "group:delete",
  ],
  ADMIN: [
    "group:view",
    "group:viewPrivateContent",
    "group:post",
    "group:comment",
    "group:join",
    "group:leave",
    "group:invite",
    "group:chat",
    "group:manageGeneral",
    "group:manageVisibility",
    "group:manageMedia",
    "group:managePosting",
    "group:manageApproval",
    "group:manageMembers",
    "group:manageRoles",
    "group:appointModerator",
    "group:promoteAdmin",
    "group:manageInvites",
    "group:moderatePost",
    "group:moderateReports",
    "group:viewAuditLog",
  ],
  MODERATOR: [
    "group:view",
    "group:viewPrivateContent",
    "group:post",
    "group:comment",
    "group:join",
    "group:leave",
    "group:invite",
    "group:chat",
    "group:moderatePost",
    "group:moderateReports",
  ],
  MEMBER: [
    "group:view",
    "group:viewPrivateContent",
    "group:post",
    "group:comment",
    "group:join",
    "group:leave",
    "group:invite",
    "group:chat",
  ],
};

// Staff roles above MEMBER.
const STAFF_ROLES: TGroupRole[] = [
  GROUP_ROLE.OWNER,
  GROUP_ROLE.ADMIN,
  GROUP_ROLE.MODERATOR,
];

// Roles that ordinary staff management may not touch (ownership guard).
const OWNER_ONLY_ACTIONS = ["group:transferOwnership", "group:delete"];

export const isStaffRole = (role: TGroupRole | undefined | null): boolean =>
  !!role && STAFF_ROLES.includes(role);

export const roleHasPermission = (
  role: TGroupRole | undefined | null,
  permission: TPermission,
): boolean => {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
};

export interface IAccessContext {
  group: IGroup;
  membership: (IGroupMembershipLike | null) | undefined;
}

interface IGroupMembershipLike {
  role: TGroupRole;
  status: (typeof GROUP_MEMBERSHIP_STATUS)[keyof typeof GROUP_MEMBERSHIP_STATUS];
}

/**
 * Centralized authorization layer. Backend is the source of truth for every
 * protected group action: authenticate (via route Auth) → load group →
 * verify membership + role + visibility + settings → verify resource
 * belongs to the group → validate payload (zod) → audit.
 */
export class GroupPermissionService {
  static async loadGroup(groupIdOrSlug: string): Promise<IGroup> {
    const isObjectId = Types.ObjectId.isValid(groupIdOrSlug);
    const query = isObjectId
      ? { _id: groupIdOrSlug }
      : { slug: groupIdOrSlug.toLowerCase() };

    const group = await Group.findOne({ ...query, isDeleted: false });
    if (!group) {
      throw new AppError(httpStatus.NOT_FOUND, "Group not found");
    }
    return group;
  }

  static async getMembership(
    groupId: Types.ObjectId,
    userId: string,
  ): Promise<IGroupMembershipLike | null> {
    if (!Types.ObjectId.isValid(userId)) return null;
    const membership = await GroupMembership.findOne({
      group: groupId,
      user: userId,
    }).lean();
    if (!membership) return null;
    return { role: membership.role, status: membership.status };
  }

  static isActiveMember(membership: IGroupMembershipLike | null | undefined) {
    return membership?.status === GROUP_MEMBERSHIP_STATUS.APPROVED;
  }

  static isBanned(membership: IGroupMembershipLike | null | undefined) {
    return membership?.status === GROUP_MEMBERSHIP_STATUS.BANNED;
  }

  /** Visibility gate: may this requester even know the group exists/see it? */
  static canViewGroup(
    group: IGroup,
    membership: IGroupMembershipLike | null | undefined,
    requester: TRequester,
  ): boolean {
    if (requester.role === "ADMIN") return true;
    if (group.visibility === GROUP_VISIBILITY.PUBLIC) return true;
    return this.isActiveMember(membership);
  }

  /**
   * Permission gate for a specific action. Platform ADMINs get an emergency
   * bypass for moderation-adjacent actions, but never for ownership
   * actions (transfer/delete), which are bound to the group owner only.
   */
  static assert(
    group: IGroup,
    membership: IGroupMembershipLike | null | undefined,
    requester: TRequester,
    permission: TPermission,
  ): void {
    const role = membership?.role;

    // Ownership-only actions are never granted via platform role.
    if (OWNER_ONLY_ACTIONS.includes(permission)) {
      if (String(group.owner) !== requester.id) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          "Only the group owner can perform this action",
        );
      }
      if (!this.isActiveMember(membership)) {
        throw new AppError(httpStatus.FORBIDDEN, "You are not a member of this group");
      }
      return;
    }

    // Banned users can never act.
    if (this.isBanned(membership)) {
      throw new AppError(httpStatus.FORBIDDEN, "You are banned from this group");
    }

    // Platform admins may assist with moderation without group membership.
    if (requester.role === "ADMIN" && roleHasPermission(GROUP_ROLE.ADMIN, permission)) {
      return;
    }

    if (!roleHasPermission(role, permission)) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "You are not allowed to perform this action in this group",
      );
    }

    // Members must actually be approved for member-level actions.
    if (
      !this.isActiveMember(membership) &&
      permission !== "group:join"
    ) {
      throw new AppError(httpStatus.FORBIDDEN, "You are not a member of this group");
    }
  }

  /** Convenience: load + authorize in one call. */
  static async authorize(
    groupIdOrSlug: string,
    requester: TRequester,
    permission: TPermission,
  ): Promise<{ group: IGroup; membership: IGroupMembershipLike | null }> {
    const group = await this.loadGroup(groupIdOrSlug);
    const membership = await this.getMembership(group._id, requester.id);

    if (!this.canViewGroup(group, membership, requester)) {
      throw new AppError(httpStatus.NOT_FOUND, "Group not found");
    }

    this.assert(group, membership, requester, permission);
    return { group, membership };
  }

  /**
   * Admin-to-admin delegation rule (explicit, configurable policy):
   * - OWNER may grant/revoke ADMIN and MODERATOR.
   * - ADMIN may grant MODERATOR, and may grant ADMIN to MEMBER (promotion).
   *   ADMIN may NOT demote or remove another ADMIN or the OWNER (prevents
   *   lateral privilege escalation); only the OWNER can do that.
   * - MODERATOR may not manage roles at all.
   * Platform-level `ADMIN` users follow the same matrix for group roles.
   */
  static assertCanManageRole(
    group: IGroup,
    actorMembership: IGroupMembershipLike | null,
    requester: TRequester,
    targetCurrentRole: TGroupRole,
    targetNewRole: TGroupRole,
  ): void {
    const actorRole: TGroupRole | null =
      actorMembership?.role ??
      (requester.role === "ADMIN" ? GROUP_ROLE.ADMIN : null);

    if (!actorRole || !this.isActiveMemberOrPlatformAdmin(actorMembership, requester)) {
      throw new AppError(httpStatus.FORBIDDEN, "You are not allowed to manage roles");
    }

    // Only the owner may act on the owner's own role / ownership transfer.
    if (targetCurrentRole === GROUP_ROLE.OWNER || targetNewRole === GROUP_ROLE.OWNER) {
      if (String(group.owner) !== requester.id) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          "Only the group owner can change the ownership role",
        );
      }
      return;
    }

    if (actorRole === GROUP_ROLE.MODERATOR) {
      throw new AppError(httpStatus.FORBIDDEN, "Moderators cannot manage roles");
    }

    if (actorRole === GROUP_ROLE.ADMIN) {
      // Admins may not demote/remove another admin (explicit limitation).
      if (
        targetCurrentRole === GROUP_ROLE.ADMIN &&
        targetNewRole !== GROUP_ROLE.ADMIN
      ) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          "Only the group owner can demote an admin",
        );
      }
      // Admins may not demote an admin down to moderator either.
      if (
        targetCurrentRole === GROUP_ROLE.ADMIN &&
        targetNewRole === GROUP_ROLE.MODERATOR
      ) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          "Only the group owner can change an admin's role",
        );
      }
    }

    // Ownership-role changes (target is/becomes OWNER) were fully handled
    // by the owner-only branch at the top of this method.
  }

  private static isActiveMemberOrPlatformAdmin(
    membership: IGroupMembershipLike | null | undefined,
    requester: TRequester,
  ): boolean {
    if (requester.role === "ADMIN") return true;
    return this.isActiveMember(membership);
  }

  /** Staff role check for moderation routes. */
  static isStaff(
    membership: IGroupMembershipLike | null | undefined,
    requester: TRequester,
  ): boolean {
    if (requester.role === "ADMIN") return true;
    if (!membership) return false;
    return isStaffRole(membership.role) && this.isActiveMember(membership);
  }
}
