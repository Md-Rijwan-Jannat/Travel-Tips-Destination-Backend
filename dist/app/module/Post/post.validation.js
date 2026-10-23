"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostValidation = void 0;
const zod_1 = require("zod");
const post_constants_1 = require("./post.constants");
// Media URLs must be plain HTTPS links (prevents javascript:/data: payloads
// from ever reaching renderers). Bytes themselves are validated by the
// storage provider at upload time (the backend never receives file bodies).
const httpsUrl = zod_1.z
    .string()
    .max(2000)
    .refine((value) => /^https:\/\/\S+$/i.test(value), {
    message: "Media URLs must be https:// links",
});
// Category historically arrives as a single string from the composer, but a
// legacy client shape sent a one-element array — both are accepted and the
// stored value is always the single category string the schema expects.
const categoryField = zod_1.z
    .union([
    zod_1.z.string().min(1).max(60),
    zod_1.z.array(zod_1.z.string().min(1).max(60)).min(1).max(5),
])
    .transform((value) => (Array.isArray(value) ? value[0] : value))
    .refine((value) => post_constants_1.CategoryEnum.includes(value), {
    message: "Unknown category",
});
const createPostValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        // The server derives the author from the auth token — a client-supplied
        // `user` id is overridden (kept optional for legacy callers).
        user: zod_1.z.string().optional(),
        // Text-only posts are allowed; image posts validate every URL.
        images: zod_1.z.array(httpsUrl).max(20).optional().default([]),
        title: zod_1.z.string().min(1, "Title is required").max(300),
        description: zod_1.z.string().min(1, "Description is required").max(20000),
        category: categoryField,
        status: zod_1.z.enum([post_constants_1.POST_STATUS.FREE, post_constants_1.POST_STATUS.PREMIUM]),
        mediaLayout: zod_1.z.enum(post_constants_1.MEDIA_LAYOUT_LIST).optional(),
        location: zod_1.z.string().max(300).optional(),
        tags: zod_1.z.array(zod_1.z.string().max(50)).max(20).optional(),
        // Optional community group — membership/permission checks happen in the
        // service (this only whitelists the field so it survives validation).
        group: zod_1.z.string().optional(),
    }),
});
// Update payload whitelist: content fields only. Ownership and integrity
// fields (user, reportCount, likes, dislikes, isDeleted) are not client-
// writable through this endpoint; report/like flows have their own routes —
// unknown keys are stripped by zod before the service runs.
const updatePostValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        images: zod_1.z.array(httpsUrl).max(20).optional(),
        title: zod_1.z.string().min(1).max(300).optional(),
        description: zod_1.z.string().min(1).max(20000).optional(),
        category: categoryField.optional(),
        status: zod_1.z.enum([post_constants_1.POST_STATUS.FREE, post_constants_1.POST_STATUS.PREMIUM]).optional(),
        mediaLayout: zod_1.z.enum(post_constants_1.MEDIA_LAYOUT_LIST).optional(),
        location: zod_1.z.string().max(300).optional(),
        tags: zod_1.z.array(zod_1.z.string().max(50)).max(20).optional(),
    }),
});
// Generic `{ pinned: boolean }` body for pin endpoints.
const setFlagValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        pinned: zod_1.z.boolean(),
    }),
});
// Generic `{ featured: boolean }` body for the highlight/feature endpoint.
const setFeatureFlagValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        featured: zod_1.z.boolean(),
    }),
});
// Post owner's comment ordering + featured-comment policy.
const commentSettingsValidationSchema = zod_1.z.object({
    body: zod_1.z
        .object({
        sortMode: zod_1.z.enum(post_constants_1.COMMENT_SORT_MODES).optional(),
        highlightMode: zod_1.z.enum(post_constants_1.COMMENT_HIGHLIGHT_MODES).optional(),
        highlightedComment: zod_1.z.string().nullable().optional(),
    })
        .refine((value) => value.sortMode !== undefined ||
        value.highlightMode !== undefined ||
        value.highlightedComment !== undefined, { message: "Provide at least one comment setting to update" }),
});
exports.PostValidation = {
    createPostValidationSchema,
    updatePostValidationSchema,
    setFlagValidationSchema,
    setFeatureFlagValidationSchema,
    commentSettingsValidationSchema,
};
