"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authLimiter = exports.globalLimiter = exports.createRateLimiter = void 0;
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
// Strict budget for credential endpoints (login/register/password reset) and
// payment initiation — brute-force protection.
exports.authLimiter = (0, exports.createRateLimiter)({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: {
        success: false,
        statusCode: 429,
        message: "Too many attempts, please try again later.",
    },
});
