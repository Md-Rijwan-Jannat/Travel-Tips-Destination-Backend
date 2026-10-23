"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Post = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const post_constants_1 = require("./post.constants");
// Report Schema
const reportSchema = new mongoose_1.Schema({
    report: {
        type: String,
        required: true,
    },
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    post: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Post",
        required: true,
    },
}, {
    timestamps: true,
});
// Post Schema
const postSchema = new mongoose_1.Schema({
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    images: {
        type: [String],
        default: [],
    },
    title: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        required: true,
    },
    comments: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "Comment",
        },
    ],
    category: {
        type: String,
        enum: post_constants_1.CategoryEnum,
        required: true,
    },
    status: {
        type: String,
        enum: [post_constants_1.POST_STATUS.FREE, post_constants_1.POST_STATUS.PREMIUM],
    },
    report: [reportSchema],
    reportCount: {
        type: Number,
        default: 0,
    },
    likes: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "User",
        },
    ],
    dislikes: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "User",
        },
    ],
    isDeleted: {
        type: Boolean,
        default: false,
    },
    location: {
        type: String,
        default: null,
        trim: true,
    },
    tags: [
        {
            type: String,
            trim: true,
        },
    ],
    group: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Group",
        default: null,
    },
    groupVisibility: {
        type: String,
        enum: ["PUBLIC", "PRIVATE", null],
        default: null,
    },
    moderationStatus: {
        type: String,
        enum: ["PENDING", "APPROVED", "REJECTED", "REMOVED"],
        default: "APPROVED",
    },
    moderationReason: {
        type: String,
        default: null,
    },
    moderatedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    moderatedAt: {
        type: Date,
        default: null,
    },
    // Author-selected multi-image grid layout. AUTO lets readers pick the
    // automatic layout for the image count (back-compat for old documents).
    mediaLayout: {
        type: String,
        enum: [...post_constants_1.MEDIA_LAYOUT_LIST],
        default: post_constants_1.MEDIA_LAYOUT.AUTO,
    },
    // Edited marker shown beside the post once the owner changes it.
    isEdited: {
        type: Boolean,
        default: false,
    },
    editedAt: {
        type: Date,
        default: null,
    },
    // Profile pin — at most ONE pinned post per author (partial unique
    // index below). Only ever set by the owner (or a platform admin).
    pinned: {
        type: Boolean,
        default: false,
    },
    pinnedAt: {
        type: Date,
        default: null,
    },
    // Profile highlight/feature — at most ONE featured post per author.
    featured: {
        type: Boolean,
        default: false,
    },
    featuredAt: {
        type: Date,
        default: null,
    },
    // Group pin — a separate concept scoped to a community group (set by
    // group staff). Never touches the author's profile pin slot.
    groupPinnedAt: {
        type: Date,
        default: null,
    },
    // Comment ordering + featured-comment policy. Stored on the post so it
    // survives reloads and applies to every viewer of this post's comments.
    commentSettings: {
        sortMode: {
            type: String,
            enum: post_constants_1.COMMENT_SORT_MODES,
            default: "TOP",
        },
        highlightMode: {
            type: String,
            enum: post_constants_1.COMMENT_HIGHLIGHT_MODES,
            default: "AUTO",
        },
        highlightedComment: {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "Comment",
            default: null,
        },
    },
}, {
    timestamps: true,
});
// Hot-path indexes: feed/profile lookups by author and by
// (status, isDeleted) feed filters.
postSchema.index({ user: 1 });
postSchema.index({ status: 1, isDeleted: 1 });
// Community: group feed + moderation queue + global-feed privacy filter.
postSchema.index({ group: 1, moderationStatus: 1, createdAt: -1 });
postSchema.index({ group: 1, reportCount: -1 });
postSchema.index({ groupVisibility: 1, moderationStatus: 1 });
// Profile ordering: pinned/featured posts sort to the top of the author's
// profile; group pins sort inside their group feed.
postSchema.index({ user: 1, pinnedAt: -1 });
postSchema.index({ user: 1, featuredAt: -1 });
postSchema.index({ group: 1, groupPinnedAt: -1 });
// One pinned post per author / one featured post per author — enforced at
// the database level so concurrent requests cannot both win. Explicit names
// avoid colliding with the plain `{ user: 1 }` index above.
postSchema.index({ user: 1 }, {
    name: "user_pin_unique",
    unique: true,
    partialFilterExpression: { pinned: true },
});
postSchema.index({ user: 1 }, {
    name: "user_feature_unique",
    unique: true,
    partialFilterExpression: { featured: true },
});
exports.Post = mongoose_1.default.model("Post", postSchema);
