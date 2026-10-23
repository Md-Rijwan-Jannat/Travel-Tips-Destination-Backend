"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Message = void 0;
const mongoose_1 = require("mongoose");
const react_interface_1 = require("../Reacts/react.interface");
const message_interface_1 = require("../Messages/message.interface");
const messageSchema = new mongoose_1.Schema({
    sender: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
    },
    content: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: "",
    },
    chat: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Chat",
    },
    readBy: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "User",
        },
    ],
    // Rich type; missing on legacy documents (reads as TEXT).
    messageType: {
        type: String,
        enum: [...message_interface_1.MESSAGE_TYPE_VALUES],
        default: message_interface_1.MESSAGE_TYPE.TEXT,
    },
    // https-only media URL (uploaded client-side, same pattern as posts).
    mediaUrl: {
        type: String,
        maxlength: 2000,
        default: null,
    },
    mediaMeta: {
        _id: false,
        type: {
            durationSeconds: { type: Number },
            width: { type: Number },
            height: { type: Number },
            thumbnailUrl: { type: String, maxlength: 2000 },
        },
        default: null,
    },
    location: {
        _id: false,
        type: {
            lat: { type: Number },
            lng: { type: Number },
            label: { type: String, maxlength: 200 },
        },
        default: null,
    },
    // LIVE_LOCATION sessions: server-set window; position updates refresh
    // `location` until this expires.
    liveLocation: {
        _id: false,
        type: {
            expiresAt: { type: Date },
        },
        default: null,
    },
    // Message being replied to (null for regular messages). Stored as a flat
    // reference; history responses embed a small sanitized preview.
    replyTo: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Message",
        default: null,
    },
    // One entry per reacting user (switching type replaces, never stacks).
    reactions: [
        {
            _id: false,
            user: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
            type: { type: String, enum: [...react_interface_1.REACTION_TYPES], required: true },
        },
    ],
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    // View-once: the URL is returned exactly once through the consume
    // endpoint and never again from history.
    viewOnceConsumedAt: { type: Date, default: null },
    viewOnceConsumedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });
// Hot-path index: message history is always fetched per chat.
messageSchema.index({ chat: 1 });
exports.Message = (0, mongoose_1.model)("Message", messageSchema);
