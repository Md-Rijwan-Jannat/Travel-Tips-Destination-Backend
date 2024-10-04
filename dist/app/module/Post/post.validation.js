"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostValidation = void 0;
const zod_1 = require("zod");
const post_constants_1 = require("./post.constants");
const createPostValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        user: zod_1.z.string().nonempty("User is required"),
        images: zod_1.z.array(zod_1.z.string()).min(1, "At least one image is required"),
        title: zod_1.z.string().nonempty("Title is required"),
        description: zod_1.z.string().nonempty("Description is required"),
        category: zod_1.z
            .array(zod_1.z.string())
            .nonempty("Category is required")
            .min(1, "At least one category is required"),
        status: zod_1.z.enum([post_constants_1.POST_STATUS.FREE, post_constants_1.POST_STATUS.PREMIUM]),
        reportCount: zod_1.z.number().optional().default(0),
        likes: zod_1.z.array(zod_1.z.string()).optional().default([]),
        dislikes: zod_1.z.array(zod_1.z.string()).optional().default([]),
        isDeleted: zod_1.z.boolean().optional().default(false),
    }),
});
const updatePostValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        user: zod_1.z.string().optional(),
        images: zod_1.z.array(zod_1.z.string()).optional(),
        title: zod_1.z.string().optional(),
        description: zod_1.z.string().optional(),
        category: zod_1.z.array(zod_1.z.string()).optional(),
        status: zod_1.z.enum([post_constants_1.POST_STATUS.FREE, post_constants_1.POST_STATUS.PREMIUM]).optional(),
        reportCount: zod_1.z.number().optional(),
        likes: zod_1.z.array(zod_1.z.string()).optional(),
        dislikes: zod_1.z.array(zod_1.z.string()).optional(),
        isDeleted: zod_1.z.boolean().optional(),
    }),
});
exports.PostValidation = {
    createPostValidationSchema,
    updatePostValidationSchema,
};
