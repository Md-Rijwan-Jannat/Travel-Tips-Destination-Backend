import { z } from "zod";
import { POST_STATUS } from "./post.constants";

const createPostValidationSchema = z.object({
  body: z.object({
    user: z.string().nonempty("User is required"),
    images: z.array(z.string()).min(1, "At least one image is required"),
    title: z.string().nonempty("Title is required"),
    description: z.string().nonempty("Description is required"),
    status: z.enum([POST_STATUS.FREE, POST_STATUS.PREMIUM]),
  }),
});

const updatePostValidationSchema = z.object({
  body: z.object({
    user: z.string().optional(),
    images: z.array(z.string()).optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum([POST_STATUS.FREE, POST_STATUS.PREMIUM]).optional(),
    reportCount: z.number().optional(),
  }),
});

export const PostValidation = {
  createPostValidationSchema,
  updatePostValidationSchema,
};
