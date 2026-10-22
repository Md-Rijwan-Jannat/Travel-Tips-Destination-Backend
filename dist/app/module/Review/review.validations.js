"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewValidation = void 0;
const zod_1 = require("zod");
const createReviewValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        quote: zod_1.z.string().max(500, "Quote must not exceed 500 characters"),
        variant: zod_1.z.string().min(1, "Variant is required"),
        rating: zod_1.z
            .number()
            .min(1, "Rating must be at least 1")
            .max(5, "Rating cannot exceed 5"),
    }),
});
const updateReviewValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        quote: zod_1.z
            .string()
            .max(500, "Quote must not exceed 500 characters")
            .optional(),
        variant: zod_1.z.string().min(1, "Variant is required").optional(),
        rating: zod_1.z
            .number()
            .min(1, "Rating must be at least 1")
            .max(5, "Rating cannot exceed 5")
            .optional(),
    }),
});
exports.ReviewValidation = {
    createReviewValidationSchema,
    updateReviewValidationSchema,
};
