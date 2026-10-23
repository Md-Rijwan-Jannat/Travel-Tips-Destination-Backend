"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callActionLimiter = exports.messageActionLimiter = exports.commentActionLimiter = exports.socialActionLimiter = exports.inviteFlowLimiter = exports.groupActionLimiter = exports.otpSendLimiter = exports.credentialLimiter = exports.authGeneralLimiter = exports.authLimiter = exports.globalLimiter = exports.createRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const tooManyRequestsMessage = {
    success: false,
    statusCode: 429,
    message: "Too many requests, please try again later.",
};
// Factory so dedicated limiters (and tests) can choose their own budgets.
const createRateLimiter = (options) => {
    var _a;
    return (0, express_rate_limit_1.default)({
        windowMs: options.windowMs,
        limit: options.limit,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        message: (_a = options.message) !== null && _a !== void 0 ? _a : tooManyRequestsMessage,
    });
};
exports.createRateLimiter = createRateLimiter;
// Generous blanket cap: absorbs floods without affecting normal browsing.
exports.globalLimiter = (0, exports.createRateLimiter)({
    windowMs: 15 * 60 * 1000,
    limit: 300,
});
// Strict budget for credential endpoints (login/register/password reset,
// 2FA login verification) and payment initiation — brute-force protection.
exports.authLimiter = (0, exports.createRateLimiter)({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: {
        success: false,
        statusCode: 429,
        message: "Too many attempts, please try again later.",
    },
});
// Moderate budget for authenticated auth actions (session lookup, 2FA status/
// enroll/verify, Google link/unlink). These are legitimate per-page requests
// and must not exhaust the strict credential budget.
exports.authGeneralLimiter = (0, exports.createRateLimiter)({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    message: {
        success: false,
        statusCode: 429,
        message: "Too many requests, please try again later.",
    },
});
// Strict limiter applied per-route on credential endpoints inside
// auth.routes.ts. Skipped under NODE_ENV=test so integration suites can
// exercise login/2FA flows freely (anti-brute-force budgets are a
// production control; the factory stays fully testable via
// createRateLimiter).
exports.credentialLimiter = process.env.NODE_ENV === "test"
    ? (_req, _res, next) => next()
    : exports.authLimiter;
// Per-IP budget for email OTP delivery (login 2FA codes + account email
// verification). Complements the MongoDB-backed per-challenge cooldown and
// per-account send window, which are the authoritative cross-instance
// limits. Skipped under NODE_ENV=test for the same reason as above.
exports.otpSendLimiter = process.env.NODE_ENV === "test"
    ? (_req, _res, next) => next()
    : (0, exports.createRateLimiter)({
        windowMs: 15 * 60 * 1000,
        limit: 15,
        message: {
            success: false,
            statusCode: 429,
            message: "Too many requests, please try again later.",
        },
    });
// Group/community write actions (create group, join, post). Generous so
// normal usage never trips it; still caps automation and spam runs.
exports.groupActionLimiter = process.env.NODE_ENV === "test"
    ? (_req, _res, next) => next()
    : (0, exports.createRateLimiter)({
        windowMs: 15 * 60 * 1000,
        limit: 60,
        message: {
            success: false,
            statusCode: 429,
            message: "Too many requests, please try again later.",
        },
    });
// Invite preview/redemption: strict because these endpoints are guessable
// by token and public previews must not be scraped at scale.
exports.inviteFlowLimiter = process.env.NODE_ENV === "test"
    ? (_req, _res, next) => next()
    : (0, exports.createRateLimiter)({
        windowMs: 15 * 60 * 1000,
        limit: 40,
        message: {
            success: false,
            statusCode: 429,
            message: "Too many requests, please try again later.",
        },
    });
// Social interaction actions (reactions, comments, reports). Generous for
// humans — including long-press reaction-picker drags — while capping
// automation and count-inflation runs. Skipped under NODE_ENV=test.
exports.socialActionLimiter = process.env.NODE_ENV === "test"
    ? (_req, _res, next) => next()
    : (0, exports.createRateLimiter)({
        windowMs: 15 * 60 * 1000,
        limit: 240,
        message: {
            success: false,
            statusCode: 429,
            message: "Too many requests, please try again later.",
        },
    });
// Comment submissions specifically (spam/rapid-fire protection). Tighter
// than the general social budget. Skipped under NODE_ENV=test.
exports.commentActionLimiter = process.env.NODE_ENV === "test"
    ? (_req, _res, next) => next()
    : (0, exports.createRateLimiter)({
        windowMs: 15 * 60 * 1000,
        limit: 60,
        message: {
            success: false,
            statusCode: 429,
            message: "Too many comments, please slow down.",
        },
    });
// Message send + edit/delete budget (per IP; per-socket budgets also exist
// on the realtime channel). Skipped under NODE_ENV=test.
exports.messageActionLimiter = process.env.NODE_ENV === "test"
    ? (_req, _res, next) => next()
    : (0, exports.createRateLimiter)({
        windowMs: 60 * 1000,
        limit: 60,
        message: {
            success: false,
            statusCode: 429,
            message: "Too many messages, please slow down.",
        },
    });
// Call invitation budget (prevents call-spam). Skipped under NODE_ENV=test.
exports.callActionLimiter = process.env.NODE_ENV === "test"
    ? (_req, _res, next) => next()
    : (0, exports.createRateLimiter)({
        windowMs: 15 * 60 * 1000,
        limit: 30,
        message: {
            success: false,
            statusCode: 429,
            message: "Too many call attempts, please try again later.",
        },
    });
