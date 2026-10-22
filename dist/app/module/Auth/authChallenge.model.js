"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthChallenge = void 0;
const mongoose_1 = require("mongoose");
const authChallengeSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    type: {
        type: String,
        enum: ['LOGIN_2FA', 'EMAIL_VERIFY', 'ENABLE_EMAIL_2FA'],
        required: true,
    },
    tokenHash: {
        type: String,
        required: true,
        unique: true,
    },
    expiresAt: {
        type: Date,
        required: true,
    },
    consumedAt: {
        type: Date,
        default: null,
    },
    emailOtpHash: {
        type: String,
        default: null,
    },
    emailOtpExpiresAt: {
        type: Date,
        default: null,
    },
    emailOtpSentAt: {
        type: Date,
        default: null,
    },
    emailOtpSendCount: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true,
});
// TTL index: expired challenges are removed by MongoDB in the background.
authChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
exports.AuthChallenge = (0, mongoose_1.model)('AuthChallenge', authChallengeSchema);
