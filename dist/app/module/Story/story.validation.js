"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoryValidations = void 0;
const zod_1 = require("zod");
/**
 * Validation schema for creating a story
 */
const createStoryValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        user: zod_1.z
            .string({
            required_error: 'User ID is required',
        })
            .min(1, 'User ID cannot be empty')
            .optional(),
        media: zod_1.z
            .string({
            required_error: 'Media URL is required',
        })
            .url('Media must be a valid URL')
            .min(1, 'Media URL cannot be empty'),
        expiresAt: zod_1.z
            .date({ required_error: 'Expiration date is required' })
            .refine((date) => date > new Date(), {
            message: 'Expiration date must be in the future',
        })
            .optional(),
        reactions: zod_1.z
            .array(zod_1.z.object({
            userId: zod_1.z
                .string({
                required_error: 'User ID is required for reactions',
            })
                .min(1, 'User ID cannot be empty'),
            type: zod_1.z.enum(['like', 'love', 'laugh', 'sad', 'angry'], {
                required_error: 'Reaction type is required',
            }),
        }))
            .optional(),
        views: zod_1.z.array(zod_1.z.string().min(1, 'View ID cannot be empty')).optional(),
    }),
});
/**
 * Validation schema for updating a story
 */
const updateStoryValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        storyId: zod_1.z
            .string({
            required_error: 'Story ID is required',
        })
            .min(1, 'Story ID cannot be empty')
            .optional(),
        media: zod_1.z
            .string({
            required_error: 'Media URL is required',
        })
            .url('Media must be a valid URL')
            .min(1, 'Media URL cannot be empty')
            .optional(),
        expiresAt: zod_1.z
            .date()
            .optional()
            .refine((date) => date > new Date(), {
            message: 'Expiration date must be in the future',
        })
            .optional(),
        reactions: zod_1.z
            .array(zod_1.z.object({
            userId: zod_1.z.string().min(1, 'User ID cannot be empty'),
            type: zod_1.z.enum(['like', 'love', 'laugh', 'sad', 'angry']),
        }))
            .optional(),
        views: zod_1.z.array(zod_1.z.string().min(1, 'View ID cannot be empty')).optional(),
    }),
});
/**
 * Validation schema for adding a reaction to a story
 */
const addReactionValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        storyId: zod_1.z
            .string({
            required_error: 'Story ID is required',
        })
            .min(1, 'Story ID cannot be empty')
            .optional(),
        userId: zod_1.z
            .string({
            required_error: 'User ID is required',
        })
            .min(1, 'User ID cannot be empty')
            .optional(),
        type: zod_1.z.enum(['like', 'love', 'laugh', 'sad', 'angry'], {
            required_error: 'Reaction type is required',
        }),
    }),
});
/**
 * Validation schema for adding a view to a story
 */
const addViewValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        storyId: zod_1.z
            .string({
            required_error: 'Story ID is required',
        })
            .min(1, 'Story ID cannot be empty')
            .optional(),
        userId: zod_1.z
            .string({
            required_error: 'User ID is required',
        })
            .min(1, 'User ID cannot be empty')
            .optional(),
    }),
});
exports.StoryValidations = {
    createStoryValidationSchema,
    updateStoryValidationSchema,
    addReactionValidationSchema,
    addViewValidationSchema,
};
