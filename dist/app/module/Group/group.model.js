"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Group = void 0;
const mongoose_1 = require("mongoose");
const group_constants_1 = require("./group.constants");
const groupSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2000,
    },
    purpose: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: null,
    },
    category: {
        type: String,
        enum: group_constants_1.GROUP_CATEGORY,
        required: true,
    },
    visibility: {
        type: String,
        enum: Object.values(group_constants_1.GROUP_VISIBILITY),
        default: group_constants_1.GROUP_VISIBILITY.PUBLIC,
    },
    image: {
        type: String,
        default: null,
    },
    coverImage: {
        type: String,
        default: null,
    },
    location: {
        type: String,
        trim: true,
        maxlength: 200,
        default: null,
    },
    rules: {
        type: [String],
        default: [],
    },
    joinPolicy: {
        type: String,
        enum: Object.values(group_constants_1.GROUP_JOIN_POLICY),
        default: group_constants_1.GROUP_JOIN_POLICY.OPEN,
    },
    postPermission: {
        type: String,
        enum: Object.values(group_constants_1.GROUP_POST_PERMISSION),
        default: group_constants_1.GROUP_POST_PERMISSION.ALL_MEMBERS,
    },
    // Default OFF: members publish immediately unless staff opt into approval.
    postApprovalEnabled: {
        type: Boolean,
        default: false,
    },
    // Group-conversation messaging switch (applied to the linked Messenger
    // conversation for sends — reads stay available to members).
    chatEnabled: {
        type: Boolean,
        default: true,
    },
    // Group-level notification preference for new feed posts.
    notifyOnNewPost: {
        type: Boolean,
        default: true,
    },
    owner: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    chat: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Chat",
        default: null,
    },
    memberCount: {
        type: Number,
        default: 1,
        min: 0,
    },
    pendingCount: {
        type: Number,
        default: 0,
        min: 0,
    },
    bannedUsers: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "User",
        },
    ],
    mutedUsers: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "User",
        },
    ],
    isDeleted: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });
// Hot-path indexes: discovery filters, membership lookups by owner.
groupSchema.index({ visibility: 1, isDeleted: 1, memberCount: -1 });
groupSchema.index({ category: 1, isDeleted: 1 });
groupSchema.index({ owner: 1 });
exports.Group = (0, mongoose_1.model)("Group", groupSchema);
