"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostHidden = void 0;
const mongoose_1 = require("mongoose");
/**
 * Per-user "hide from my feed" state. Kept in its own collection so hiding
 * never mutates the original post (other viewers keep seeing it) and so the
 * post document never accumulates an unbounded `hiddenBy` array.
 */
const postHiddenSchema = new mongoose_1.Schema({
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    post: { type: mongoose_1.Schema.Types.ObjectId, ref: "Post", required: true },
}, { timestamps: true });
// One hide row per (user, post): repeat requests are idempotent.
postHiddenSchema.index({ user: 1, post: 1 }, { unique: true });
// Feed exclusion lookup: every hidden post for one user.
postHiddenSchema.index({ user: 1 });
exports.PostHidden = (0, mongoose_1.model)("PostHidden", postHiddenSchema);
