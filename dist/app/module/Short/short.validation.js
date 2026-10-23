"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShortValidation = void 0;
const zod_1 = require("zod");
const httpsUrl = zod_1.z.string().url().max(2000).startsWith("https://");
const createShortValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        video: httpsUrl,
        coverImage: httpsUrl.nullish(),
        title: zod_1.z.string().trim().max(150).optional(),
        caption: zod_1.z.string().trim().max(1000).optional(),
        location: zod_1.z.string().trim().max(200).optional(),
        hashtags: zod_1.z.array(zod_1.z.string().trim().max(40)).max(15).optional(),
        audience: zod_1.z.enum(["PUBLIC", "FOLLOWERS", "PRIVATE"]).optional(),
        group: zod_1.z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid group id").optional(),
        duration: zod_1.z.number().min(0).max(3600).nullish(),
        sizeBytes: zod_1.z.number().int().positive().nullish(),
    }),
});
const updateShortValidationSchema = zod_1.z.object({
    body: zod_1.z
        .object({
        title: zod_1.z.string().trim().max(150).optional(),
        caption: zod_1.z.string().trim().max(1000).optional(),
        location: zod_1.z.string().trim().max(200).optional(),
        coverImage: httpsUrl.nullish(),
        hashtags: zod_1.z.array(zod_1.z.string().trim().max(40)).max(15).optional(),
        audience: zod_1.z.enum(["PUBLIC", "FOLLOWERS", "PRIVATE"]).optional(),
    })
        .strict(),
});
const reportShortValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        reason: zod_1.z.string().trim().min(3).max(500),
    }),
});
const moderateShortValidationSchema = zod_1.z.object({
    body: zod_1.z
        .object({
        reason: zod_1.z.string().trim().max(500).optional(),
    })
        .strict()
        .optional(),
});
exports.ShortValidation = {
    createShortValidationSchema,
    updateShortValidationSchema,
    reportShortValidationSchema,
    moderateShortValidationSchema,
};
