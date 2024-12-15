import { z } from 'zod';

/**
 * Validation schema for creating a story
 */
const createStoryValidationSchema = z.object({
  body: z.object({
    user: z
      .string({
        required_error: 'User ID is required',
      })
      .min(1, 'User ID cannot be empty')
      .optional(),

    media: z
      .string({
        required_error: 'Media URL is required',
      })
      .url('Media must be a valid URL')
      .min(1, 'Media URL cannot be empty'),

    expiresAt: z
      .date({ required_error: 'Expiration date is required' })
      .refine((date) => date > new Date(), {
        message: 'Expiration date must be in the future',
      })
      .optional(),
    reactions: z
      .array(
        z.object({
          userId: z
            .string({
              required_error: 'User ID is required for reactions',
            })
            .min(1, 'User ID cannot be empty'),
          type: z.enum(['like', 'love', 'laugh', 'sad', 'angry'], {
            required_error: 'Reaction type is required',
          }),
        })
      )
      .optional(),

    views: z.array(z.string().min(1, 'View ID cannot be empty')).optional(),
  }),
});

/**
 * Validation schema for updating a story
 */
const updateStoryValidationSchema = z.object({
  body: z.object({
    storyId: z
      .string({
        required_error: 'Story ID is required',
      })
      .min(1, 'Story ID cannot be empty')
      .optional(),

    media: z
      .string({
        required_error: 'Media URL is required',
      })
      .url('Media must be a valid URL')
      .min(1, 'Media URL cannot be empty')
      .optional(),

    expiresAt: z
      .date()
      .optional()
      .refine((date) => date! > new Date(), {
        message: 'Expiration date must be in the future',
      })
      .optional(),

    reactions: z
      .array(
        z.object({
          userId: z.string().min(1, 'User ID cannot be empty'),
          type: z.enum(['like', 'love', 'laugh', 'sad', 'angry']),
        })
      )
      .optional(),

    views: z.array(z.string().min(1, 'View ID cannot be empty')).optional(),
  }),
});
/**
 * Validation schema for adding a reaction to a story
 */
const addReactionValidationSchema = z.object({
  body: z.object({
    storyId: z
      .string({
        required_error: 'Story ID is required',
      })
      .min(1, 'Story ID cannot be empty')
      .optional(),

    userId: z
      .string({
        required_error: 'User ID is required',
      })
      .min(1, 'User ID cannot be empty')
      .optional(),

    type: z.enum(['like', 'love', 'laugh', 'sad', 'angry'], {
      required_error: 'Reaction type is required',
    }),
  }),
});

/**
 * Validation schema for adding a view to a story
 */
const addViewValidationSchema = z.object({
  body: z.object({
    storyId: z
      .string({
        required_error: 'Story ID is required',
      })
      .min(1, 'Story ID cannot be empty')
      .optional(),

    userId: z
      .string({
        required_error: 'User ID is required',
      })
      .min(1, 'User ID cannot be empty')
      .optional(),
  }),
});

export const StoryValidations = {
  createStoryValidationSchema,
  updateStoryValidationSchema,
  addReactionValidationSchema,
  addViewValidationSchema,
};
