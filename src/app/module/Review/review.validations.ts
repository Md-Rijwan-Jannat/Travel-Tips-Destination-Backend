import { z } from 'zod';

const createReviewValidationSchema = z.object({
  body: z.object({
    content: z.string().max(500, 'Content must not exceed 500 characters'),
    rating: z
      .number()
      .min(1, 'Rating must be at least 1')
      .max(5, 'Rating cannot exceed 5'),
  }),
});

const updateReviewValidationSchema = z.object({
  body: z.object({
    content: z
      .string()
      .max(500, 'Content must not exceed 500 characters')
      .optional(),
    rating: z
      .number()
      .min(1, 'Rating must be at least 1')
      .max(5, 'Rating cannot exceed 5')
      .optional(),
  }),
});

export const ReviewValidation = {
  createReviewValidationSchema,
  updateReviewValidationSchema,
};
