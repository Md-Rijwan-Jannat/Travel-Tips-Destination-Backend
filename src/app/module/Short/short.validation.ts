import { z } from "zod";
const httpsUrl = z.string().url().max(2000).startsWith("https://");

const createShortValidationSchema = z.object({
  body: z.object({
    video: httpsUrl,
    coverImage: httpsUrl.nullish(),
    title: z.string().trim().max(150).optional(),
    caption: z.string().trim().max(1000).optional(),
    location: z.string().trim().max(200).optional(),
    hashtags: z.array(z.string().trim().max(40)).max(15).optional(),
    audience: z.enum(["PUBLIC", "FOLLOWERS", "PRIVATE"] as const).optional(),
    group: z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid group id").optional(),
    duration: z.number().min(0).max(3600).nullish(),
    sizeBytes: z.number().int().positive().nullish(),
  }),
});

const updateShortValidationSchema = z.object({
  body: z
    .object({
      title: z.string().trim().max(150).optional(),
      caption: z.string().trim().max(1000).optional(),
      location: z.string().trim().max(200).optional(),
      coverImage: httpsUrl.nullish(),
      hashtags: z.array(z.string().trim().max(40)).max(15).optional(),
      audience: z.enum(["PUBLIC", "FOLLOWERS", "PRIVATE"] as const).optional(),
    })
    .strict(),
});

const reportShortValidationSchema = z.object({
  body: z.object({
    reason: z.string().trim().min(3).max(500),
  }),
});

const moderateShortValidationSchema = z.object({
  body: z
    .object({
      reason: z.string().trim().max(500).optional(),
    })
    .strict()
    .optional(),
});

export const ShortValidation = {
  createShortValidationSchema,
  updateShortValidationSchema,
  reportShortValidationSchema,
  moderateShortValidationSchema,
};
