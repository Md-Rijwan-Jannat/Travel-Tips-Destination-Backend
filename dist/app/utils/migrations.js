"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCommunityMigrations = void 0;
const post_model_1 = require("../module/Post/post.model");
const short_model_1 = require("../module/Short/short.model");
const group_model_1 = require("../module/Group/group.model");
const groupMembership_model_1 = require("../module/Group/groupMembership.model");
const message_model_1 = require("../module/Messages/message.model");
/**
 * Idempotent, backward-compatible backfills for the community upgrade.
 * Existing production documents keep working because every read path also
 * tolerates missing fields — these migrations only normalize the data.
 * No destructive operations.
 */
const runCommunityMigrations = () => __awaiter(void 0, void 0, void 0, function* () {
    // 1) Classic posts predate the moderation lifecycle → treat as approved.
    yield post_model_1.Post.updateMany({ moderationStatus: { $exists: false } }, { $set: { moderationStatus: "APPROVED" } });
    // 2) Classic posts are not group posts.
    yield post_model_1.Post.updateMany({ group: { $exists: false } }, { $set: { group: null, groupVisibility: null } });
    // 3) Group media counters may drift from membership rows (idempotent
    //    recount; safe on every boot).
    const groups = yield group_model_1.Group.find({ isDeleted: false }).select("_id").lean();
    for (const g of groups) {
        const [members, pending] = yield Promise.all([
            groupMembership_model_1.GroupMembership.countDocuments({ group: g._id, status: "APPROVED" }),
            groupMembership_model_1.GroupMembership.countDocuments({ group: g._id, status: "PENDING" }),
        ]);
        yield group_model_1.Group.updateOne({ _id: g._id }, { $set: { memberCount: members, pendingCount: pending } });
    }
    // 4) Shorts uploaded before the status pipeline existed are considered
    //    published (their media already passed creation-time validation).
    yield short_model_1.Short.updateMany({ status: { $exists: false } }, { $set: { status: "PUBLISHED" } });
    // 5) Social-feed upgrade: normalize new post fields for pre-existing
    //    documents (reads tolerate missing fields too — this just makes the
    //    data explicit). Idempotent and non-destructive.
    yield post_model_1.Post.updateMany({ mediaLayout: { $exists: false } }, { $set: { mediaLayout: "AUTO" } });
    yield post_model_1.Post.updateMany({ pinned: { $exists: false } }, { $set: { pinned: false, pinnedAt: null } });
    yield post_model_1.Post.updateMany({ featured: { $exists: false } }, { $set: { featured: false, featuredAt: null } });
    yield post_model_1.Post.updateMany({ groupPinnedAt: { $exists: false } }, { $set: { groupPinnedAt: null } });
    yield post_model_1.Post.updateMany({ isEdited: { $exists: false } }, { $set: { isEdited: false, editedAt: null } });
    yield post_model_1.Post.updateMany({ "commentSettings.sortMode": { $exists: false } }, {
        $set: {
            "commentSettings.sortMode": "TOP",
            "commentSettings.highlightMode": "AUTO",
            "commentSettings.highlightedComment": null,
        },
    });
    // 6) Rich-message upgrade: pre-existing messages are plain text and carry
    //    no edit/delete/view-once state. Idempotent, non-destructive.
    yield message_model_1.Message.updateMany({ messageType: { $exists: false } }, {
        $set: {
            messageType: "TEXT",
            isEdited: false,
            editedAt: null,
            isDeleted: false,
            deletedAt: null,
            viewOnceConsumedAt: null,
            viewOnceConsumedBy: null,
        },
    });
});
exports.runCommunityMigrations = runCommunityMigrations;
