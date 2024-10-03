import { z } from "zod";
import { POST_STATUS } from "./post.constants";

const createPostValidationSchema = z.object({
  body: z.object({
    user: z.string().nonempty("User is required"),
    images: z.array(z.string()).min(1, "At least one image is required"),
    title: z.string().nonempty("Title is required"),
    description: z.string().nonempty("Description is required"),
    category: z
      .array(z.string())
      .nonempty("Category is required")
      .min(1, "At least one category is required"),
    status: z.enum([POST_STATUS.FREE, POST_STATUS.PREMIUM]),
    reportCount: z.number().optional().default(0),
    likes: z.array(z.string()).optional().default([]),
    dislikes: z.array(z.string()).optional().default([]),
    isDeleted: z.boolean().optional().default(false),
  }),
});

const updatePostValidationSchema = z.object({
  body: z.object({
    user: z.string().optional(),
    images: z.array(z.string()).optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    category: z.array(z.string()).optional(),
    status: z.enum([POST_STATUS.FREE, POST_STATUS.PREMIUM]).optional(),
    reportCount: z.number().optional(),
    likes: z.array(z.string()).optional(),
    dislikes: z.array(z.string()).optional(),
    isDeleted: z.boolean().optional(),
  }),
});

export const PostValidation = {
  createPostValidationSchema,
  updatePostValidationSchema,
};
