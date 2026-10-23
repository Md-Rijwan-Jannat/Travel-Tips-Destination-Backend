"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupActivityLog = void 0;
const mongoose_1 = require("mongoose");
const group_constants_1 = require("./group.constants");
// Append-only moderation/management audit trail. Never store secrets,
// tokens, passwords, or OTP material here.
const groupActivityLogSchema = new mongoose_1.Schema({
    group: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Group",
        required: true,
    },
    actor: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    action: {
        type: String,
        enum: Object.values(group_constants_1.GROUP_ACTIVITY_ACTION),
        required: true,
    },
    targetType: {
        type: String,
        default: null,
    },
    targetId: {
        type: mongoose_1.Schema.Types.ObjectId,
        default: null,
    },
    metadata: {
        type: mongoose_1.Schema.Types.Mixed,
        default: null,
    },
}, { timestamps: true });
groupActivityLogSchema.index({ group: 1, createdAt: -1 });
exports.GroupActivityLog = (0, mongoose_1.model)("GroupActivityLog", groupActivityLogSchema);
