import { z } from "zod";

const createCommentValidationSchema = z.object({
  body: z.object({
    post: z.string().nonempty("Post is required"),
    text: z.string().nonempty("Text is required"),
    images: z.array(z.string()).optional(),
  }),
});

const updateCommentValidationSchema = z.object({
  body: z.object({
    text: z.string().optional(),
    images: z.array(z.string()).optional(),
  }),
});

const replyValidationSchema = z.object({
  body: z.object({
    post: z.string().nonempty("Post is required"),
    text: z.string().nonempty("Text is required"),
  }),
});

export const CommentValidation = {
  createCommentValidationSchema,
  updateCommentValidationSchema,
  replyValidationSchema,
};
