"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Call = void 0;
const mongoose_1 = require("mongoose");
const call_interface_1 = require("./call.interface");
const callSchema = new mongoose_1.Schema({
    chat: { type: mongoose_1.Schema.Types.ObjectId, ref: "Chat", required: true },
    caller: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    // DM only — group calls have no single callee.
    callee: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", default: null },
    isGroupCall: { type: Boolean, default: false },
    // Live mesh roster (starter from invite; acceptors as they join).
    participants: {
        type: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "User" }],
        default: [],
    },
    mediaType: {
        type: String,
        enum: [...call_interface_1.CALL_MEDIA_TYPE_VALUES],
        required: true,
    },
    status: {
        type: String,
        enum: [...call_interface_1.CALL_STATUS_VALUES],
        default: call_interface_1.CALL_STATUS.RINGING,
        index: true,
    },
    startedAt: { type: Date, default: Date.now },
    answeredAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0 },
}, { timestamps: true });
// Call history is always per chat / per participant, newest first.
callSchema.index({ chat: 1, createdAt: -1 });
callSchema.index({ caller: 1, createdAt: -1 });
callSchema.index({ callee: 1, createdAt: -1 });
exports.Call = (0, mongoose_1.model)("Call", callSchema);
