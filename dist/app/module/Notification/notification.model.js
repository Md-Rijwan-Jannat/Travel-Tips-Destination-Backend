"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notification = void 0;
const mongoose_1 = require("mongoose");
const notificationSchema = new mongoose_1.Schema({
    recipient: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    actor: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    type: {
        type: String,
        required: true,
        trim: true,
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200,
    },
    body: {
        type: String,
        trim: true,
        maxlength: 500,
        default: null,
    },
    // Deep link — must always be an app-relative path (authorization is
    // re-checked when the destination is opened).
    link: {
        type: String,
        trim: true,
        default: null,
    },
    entityType: {
        type: String,
        default: null,
    },
    entityId: {
        type: mongoose_1.Schema.Types.ObjectId,
        default: null,
    },
    groupId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Group",
        default: null,
    },
    readAt: {
        type: Date,
        default: null,
    },
}, { timestamps: true });
// Hot-path indexes: inbox listing and unread badge counts.
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, readAt: 1 });
// Deduplication key for retryable operations (optional, sparse).
notificationSchema.index({ recipient: 1, type: 1, entityId: 1 }, { partialFilterExpression: { entityId: { $type: "objectId" } } });
exports.Notification = (0, mongoose_1.model)("Notification", notificationSchema);
