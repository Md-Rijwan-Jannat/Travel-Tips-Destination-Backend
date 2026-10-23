"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupPermissionService = exports.roleHasPermission = exports.isStaffRole = void 0;
const http_status_1 = __importDefault(require("http-status"));
const mongoose_1 = require("mongoose");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const group_model_1 = require("./group.model");
const groupMembership_model_1 = require("./groupMembership.model");
const group_constants_1 = require("./group.constants");
const ROLE_PERMISSIONS = {
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
const STAFF_ROLES = [
    group_constants_1.GROUP_ROLE.OWNER,
    group_constants_1.GROUP_ROLE.ADMIN,
    group_constants_1.GROUP_ROLE.MODERATOR,
];
// Roles that ordinary staff management may not touch (ownership guard).
const OWNER_ONLY_ACTIONS = ["group:transferOwnership", "group:delete"];
const isStaffRole = (role) => !!role && STAFF_ROLES.includes(role);
exports.isStaffRole = isStaffRole;
const roleHasPermission = (role, permission) => {
    var _a, _b;
    if (!role)
        return false;
    return (_b = (_a = ROLE_PERMISSIONS[role]) === null || _a === void 0 ? void 0 : _a.includes(permission)) !== null && _b !== void 0 ? _b : false;
};
exports.roleHasPermission = roleHasPermission;
/**
 * Centralized authorization layer. Backend is the source of truth for every
 * protected group action: authenticate (via route Auth) → load group →
 * verify membership + role + visibility + settings → verify resource
 * belongs to the group → validate payload (zod) → audit.
 */
class GroupPermissionService {
    static loadGroup(groupIdOrSlug) {
        return __awaiter(this, void 0, void 0, function* () {
            const isObjectId = mongoose_1.Types.ObjectId.isValid(groupIdOrSlug);
            const query = isObjectId
                ? { _id: groupIdOrSlug }
                : { slug: groupIdOrSlug.toLowerCase() };
            const group = yield group_model_1.Group.findOne(Object.assign(Object.assign({}, query), { isDeleted: false }));
            if (!group) {
                throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Group not found");
            }
            return group;
        });
    }
    static getMembership(groupId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!mongoose_1.Types.ObjectId.isValid(userId))
                return null;
            const membership = yield groupMembership_model_1.GroupMembership.findOne({
                group: groupId,
                user: userId,
            }).lean();
            if (!membership)
                return null;
            return { role: membership.role, status: membership.status };
        });
    }
    static isActiveMember(membership) {
        return (membership === null || membership === void 0 ? void 0 : membership.status) === group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED;
    }
    static isBanned(membership) {
        return (membership === null || membership === void 0 ? void 0 : membership.status) === group_constants_1.GROUP_MEMBERSHIP_STATUS.BANNED;
    }
    /** Visibility gate: may this requester even know the group exists/see it? */
    static canViewGroup(group, membership, requester) {
        if (requester.role === "ADMIN")
            return true;
        if (group.visibility === group_constants_1.GROUP_VISIBILITY.PUBLIC)
            return true;
        return this.isActiveMember(membership);
    }
    /**
     * Permission gate for a specific action. Platform ADMINs get an emergency
     * bypass for moderation-adjacent actions, but never for ownership
     * actions (transfer/delete), which are bound to the group owner only.
     */
    static assert(group, membership, requester, permission) {
        const role = membership === null || membership === void 0 ? void 0 : membership.role;
        // Ownership-only actions are never granted via platform role.
        if (OWNER_ONLY_ACTIONS.includes(permission)) {
            if (String(group.owner) !== requester.id) {
                throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Only the group owner can perform this action");
            }
            if (!this.isActiveMember(membership)) {
                throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are not a member of this group");
            }
            return;
        }
        // Banned users can never act.
        if (this.isBanned(membership)) {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are banned from this group");
        }
        // Platform admins may assist with moderation without group membership.
        if (requester.role === "ADMIN" && (0, exports.roleHasPermission)(group_constants_1.GROUP_ROLE.ADMIN, permission)) {
            return;
        }
        if (!(0, exports.roleHasPermission)(role, permission)) {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are not allowed to perform this action in this group");
        }
        // Members must actually be approved for member-level actions.
        if (!this.isActiveMember(membership) &&
            permission !== "group:join") {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are not a member of this group");
        }
    }
    /** Convenience: load + authorize in one call. */
    static authorize(groupIdOrSlug, requester, permission) {
        return __awaiter(this, void 0, void 0, function* () {
            const group = yield this.loadGroup(groupIdOrSlug);
            const membership = yield this.getMembership(group._id, requester.id);
            if (!this.canViewGroup(group, membership, requester)) {
                throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Group not found");
            }
            this.assert(group, membership, requester, permission);
            return { group, membership };
        });
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
    static assertCanManageRole(group, actorMembership, requester, targetCurrentRole, targetNewRole) {
        var _a;
        const actorRole = (_a = actorMembership === null || actorMembership === void 0 ? void 0 : actorMembership.role) !== null && _a !== void 0 ? _a : (requester.role === "ADMIN" ? group_constants_1.GROUP_ROLE.ADMIN : null);
        if (!actorRole || !this.isActiveMemberOrPlatformAdmin(actorMembership, requester)) {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are not allowed to manage roles");
        }
        // Only the owner may act on the owner's own role / ownership transfer.
        if (targetCurrentRole === group_constants_1.GROUP_ROLE.OWNER || targetNewRole === group_constants_1.GROUP_ROLE.OWNER) {
            if (String(group.owner) !== requester.id) {
                throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Only the group owner can change the ownership role");
            }
            return;
        }
        if (actorRole === group_constants_1.GROUP_ROLE.MODERATOR) {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Moderators cannot manage roles");
        }
        if (actorRole === group_constants_1.GROUP_ROLE.ADMIN) {
            // Admins may not demote/remove another admin (explicit limitation).
            if (targetCurrentRole === group_constants_1.GROUP_ROLE.ADMIN &&
                targetNewRole !== group_constants_1.GROUP_ROLE.ADMIN) {
                throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Only the group owner can demote an admin");
            }
            // Admins may not demote an admin down to moderator either.
            if (targetCurrentRole === group_constants_1.GROUP_ROLE.ADMIN &&
                targetNewRole === group_constants_1.GROUP_ROLE.MODERATOR) {
                throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Only the group owner can change an admin's role");
            }
        }
        // Ownership-role changes (target is/becomes OWNER) were fully handled
        // by the owner-only branch at the top of this method.
    }
    static isActiveMemberOrPlatformAdmin(membership, requester) {
        if (requester.role === "ADMIN")
            return true;
        return this.isActiveMember(membership);
    }
    /** Staff role check for moderation routes. */
    static isStaff(membership, requester) {
        if (requester.role === "ADMIN")
            return true;
        if (!membership)
            return false;
        return (0, exports.isStaffRole)(membership.role) && this.isActiveMember(membership);
    }
}
exports.GroupPermissionService = GroupPermissionService;
