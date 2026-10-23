import { z } from "zod";
import {
  CategoryEnum,
  COMMENT_HIGHLIGHT_MODES,
  COMMENT_SORT_MODES,
  MEDIA_LAYOUT_LIST,
  POST_STATUS,
} from "./post.constants";

// Media URLs must be plain HTTPS links (prevents javascript:/data: payloads
// from ever reaching renderers). Bytes themselves are validated by the
// storage provider at upload time (the backend never receives file bodies).
const httpsUrl = z
  .string()
  .max(2000)
  .refine((value) => /^https:\/\/\S+$/i.test(value), {
    message: "Media URLs must be https:// links",
  });

// Category historically arrives as a single string from the composer, but a
// legacy client shape sent a one-element array — both are accepted and the
// stored value is always the single category string the schema expects.
const categoryField = z
  .union([
    z.string().min(1).max(60),
    z.array(z.string().min(1).max(60)).min(1).max(5),
  ])
  .transform((value) => (Array.isArray(value) ? value[0] : value))
  .refine((value) => CategoryEnum.includes(value), {
    message: "Unknown category",
  });

const createPostValidationSchema = z.object({
  body: z.object({
    // The server derives the author from the auth token — a client-supplied
    // `user` id is overridden (kept optional for legacy callers).
    user: z.string().optional(),
    // Text-only posts are allowed; image posts validate every URL.
    images: z.array(httpsUrl).max(20).optional().default([]),
    title: z.string().min(1, "Title is required").max(300),
    description: z.string().min(1, "Description is required").max(20000),
    category: categoryField,
    status: z.enum([POST_STATUS.FREE, POST_STATUS.PREMIUM]),
    mediaLayout: z.enum(MEDIA_LAYOUT_LIST).optional(),
    location: z.string().max(300).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    // Optional community group — membership/permission checks happen in the
    // service (this only whitelists the field so it survives validation).
    group: z.string().optional(),
  }),
});

// Update payload whitelist: content fields only. Ownership and integrity
// fields (user, reportCount, likes, dislikes, isDeleted) are not client-
// writable through this endpoint; report/like flows have their own routes —
// unknown keys are stripped by zod before the service runs.
const updatePostValidationSchema = z.object({
  body: z.object({
    images: z.array(httpsUrl).max(20).optional(),
    title: z.string().min(1).max(300).optional(),
    description: z.string().min(1).max(20000).optional(),
    category: categoryField.optional(),
    status: z.enum([POST_STATUS.FREE, POST_STATUS.PREMIUM]).optional(),
    mediaLayout: z.enum(MEDIA_LAYOUT_LIST).optional(),
    location: z.string().max(300).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
  }),
});

// Generic `{ pinned: boolean }` body for pin endpoints.
const setFlagValidationSchema = z.object({
  body: z.object({
    pinned: z.boolean(),
  }),
});

// Generic `{ featured: boolean }` body for the highlight/feature endpoint.
const setFeatureFlagValidationSchema = z.object({
  body: z.object({
    featured: z.boolean(),
  }),
});

// Post owner's comment ordering + featured-comment policy.
const commentSettingsValidationSchema = z.object({
  body: z
    .object({
      sortMode: z.enum(COMMENT_SORT_MODES).optional(),
      highlightMode: z.enum(COMMENT_HIGHLIGHT_MODES).optional(),
      highlightedComment: z.string().nullable().optional(),
    })
    .refine(
      (value) =>
        value.sortMode !== undefined ||
        value.highlightMode !== undefined ||
        value.highlightedComment !== undefined,
      { message: "Provide at least one comment setting to update" },
    ),
});

export const PostValidation = {
  createPostValidationSchema,
  updatePostValidationSchema,
  setFlagValidationSchema,
  setFeatureFlagValidationSchema,
  commentSettingsValidationSchema,
};
