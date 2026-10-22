"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Message = void 0;
const mongoose_1 = require("mongoose");
const messageSchema = new mongoose_1.Schema({
    sender: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
    },
    content: {
        type: String,
        trim: true,
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
}, { timestamps: true });
// Hot-path index: message history is always fetched per chat.
messageSchema.index({ chat: 1 });
exports.Message = (0, mongoose_1.model)("Message", messageSchema);
