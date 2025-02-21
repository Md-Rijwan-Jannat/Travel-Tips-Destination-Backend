import { z } from "zod";

const createReviewValidationSchema = z.object({
  body: z.object({
    quote: z.string().max(500, "Quote must not exceed 500 characters"),
    variant: z.string().min(1, "Variant is required"),
    rating: z
      .number()
      .min(1, "Rating must be at least 1")
      .max(5, "Rating cannot exceed 5"),
  }),
});

const updateReviewValidationSchema = z.object({
  body: z.object({
    quote: z
      .string()
      .max(500, "Quote must not exceed 500 characters")
      .optional(),
    variant: z.string().min(1, "Variant is required").optional(),
    rating: z
      .number()
      .min(1, "Rating must be at least 1")
      .max(5, "Rating cannot exceed 5")
      .optional(),
  }),
});

export const ReviewValidation = {
  createReviewValidationSchema,
  updateReviewValidationSchema,
};
