"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupMembership = void 0;
const mongoose_1 = require("mongoose");
const group_constants_1 = require("./group.constants");
const groupMembershipSchema = new mongoose_1.Schema({
    group: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Group",
        required: true,
    },
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    role: {
        type: String,
        enum: Object.values(group_constants_1.GROUP_ROLE),
        default: group_constants_1.GROUP_ROLE.MEMBER,
    },
    status: {
        type: String,
        enum: Object.values(group_constants_1.GROUP_MEMBERSHIP_STATUS),
        default: group_constants_1.GROUP_MEMBERSHIP_STATUS.NONE,
    },
    joinedAt: {
        type: Date,
        default: null,
    },
    requestedAt: {
        type: Date,
        default: null,
    },
    reviewedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    reviewedAt: {
        type: Date,
        default: null,
    },
    bannedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    bannedAt: {
        type: Date,
        default: null,
    },
    // Per-member notification preference for this group (new posts + chat
    // activity). Independent from the platform-wide mute (mutedUsers).
    mutedNotifications: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });
// Uniqueness: one membership row per (group, user) — authoritative
// guard against duplicate joins under concurrent requests.
groupMembershipSchema.index({ group: 1, user: 1 }, { unique: true });
// Hot-path index: pending-request queue and member lists.
groupMembershipSchema.index({ group: 1, status: 1 });
groupMembershipSchema.index({ user: 1, status: 1 });
exports.GroupMembership = (0, mongoose_1.model)("GroupMembership", groupMembershipSchema);
