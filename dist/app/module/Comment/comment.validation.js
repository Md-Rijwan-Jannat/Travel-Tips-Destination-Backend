"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentValidation = void 0;
const zod_1 = require("zod");
const createCommentValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        post: zod_1.z.string().optional(),
        short: zod_1.z.string().optional(),
        text: zod_1.z.string().nonempty("Text is required"),
        images: zod_1.z.array(zod_1.z.string()).max(5).optional(),
    }),
});
const updateCommentValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        text: zod_1.z.string().optional(),
        images: zod_1.z.array(zod_1.z.string()).optional(),
    }),
});
const replyValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        post: zod_1.z.string().optional(),
        short: zod_1.z.string().optional(),
        text: zod_1.z.string().nonempty("Text is required"),
        images: zod_1.z.array(zod_1.z.string()).max(5).optional(),
    }),
});
exports.CommentValidation = {
    createCommentValidationSchema,
    updateCommentValidationSchema,
    replyValidationSchema,
};
