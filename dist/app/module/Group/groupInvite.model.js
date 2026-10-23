"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupInvite = exports.hashInviteToken = exports.generateInviteToken = void 0;
const crypto_1 = require("crypto");
const mongoose_1 = require("mongoose");
const group_constants_1 = require("./group.constants");
// Cryptographically secure, unguessable invite token (256 bits). Only the
// SHA-256 hash is persisted — a DB leak cannot replay invitations.
const generateInviteToken = () => (0, crypto_1.randomBytes)(32).toString("base64url");
exports.generateInviteToken = generateInviteToken;
const hashInviteToken = (token) => (0, crypto_1.createHash)("sha256").update(token).digest("hex");
exports.hashInviteToken = hashInviteToken;
const groupInviteSchema = new mongoose_1.Schema({
    group: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Group",
        required: true,
    },
    tokenHash: {
        type: String,
        required: true,
        unique: true,
    },
    createdBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    label: {
        type: String,
        trim: true,
        maxlength: 100,
        default: null,
    },
    status: {
        type: String,
        enum: Object.values(group_constants_1.GROUP_INVITE_STATUS),
        default: group_constants_1.GROUP_INVITE_STATUS.ACTIVE,
    },
    maxUses: {
        type: Number,
        min: 1,
        default: null,
    },
    usedCount: {
        type: Number,
        default: 0,
        min: 0,
    },
    requiresApproval: {
        type: Boolean,
        default: false,
    },
    expiresAt: {
        type: Date,
        default: null,
    },
    revokedAt: {
        type: Date,
        default: null,
    },
    revokedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
}, { timestamps: true });
// Hot-path index: redeem lookups by group for admin listings.
groupInviteSchema.index({ group: 1, status: 1 });
exports.GroupInvite = (0, mongoose_1.model)("GroupInvite", groupInviteSchema);
