"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupValidation = void 0;
const zod_1 = require("zod");
const group_constants_1 = require("./group.constants");
const urlish = zod_1.z.string().url().max(1000);
const createGroupValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().trim().min(3).max(100),
        slug: zod_1.z
            .string()
            .trim()
            .min(3)
            .max(80)
            .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Slug must be URL-friendly")
            .optional(),
        description: zod_1.z.string().trim().min(10).max(2000),
        purpose: zod_1.z.string().trim().max(2000).optional(),
        category: zod_1.z.enum(group_constants_1.GROUP_CATEGORY),
        visibility: zod_1.z.enum([group_constants_1.GROUP_VISIBILITY.PUBLIC, group_constants_1.GROUP_VISIBILITY.PRIVATE]).optional(),
        image: urlish.nullish(),
        coverImage: urlish.nullish(),
        location: zod_1.z.string().trim().max(200).nullish(),
        rules: zod_1.z.array(zod_1.z.string().trim().min(1).max(300)).max(30).optional(),
        joinPolicy: zod_1.z
            .enum([
            group_constants_1.GROUP_JOIN_POLICY.OPEN,
            group_constants_1.GROUP_JOIN_POLICY.REQUEST,
            group_constants_1.GROUP_JOIN_POLICY.CLOSED,
        ])
            .optional(),
        postPermission: zod_1.z
            .enum([group_constants_1.GROUP_POST_PERMISSION.ALL_MEMBERS, group_constants_1.GROUP_POST_PERMISSION.ADMINS])
            .optional(),
        postApprovalEnabled: zod_1.z.boolean().optional(),
        chatEnabled: zod_1.z.boolean().optional(),
        notifyOnNewPost: zod_1.z.boolean().optional(),
    }),
});
const updateGroupValidationSchema = zod_1.z.object({
    body: zod_1.z
        .object({
        name: zod_1.z.string().trim().min(3).max(100).optional(),
        description: zod_1.z.string().trim().min(10).max(2000).optional(),
        purpose: zod_1.z.string().trim().max(2000).nullish(),
        category: zod_1.z.enum(group_constants_1.GROUP_CATEGORY).optional(),
        visibility: zod_1.z.enum([group_constants_1.GROUP_VISIBILITY.PUBLIC, group_constants_1.GROUP_VISIBILITY.PRIVATE]).optional(),
        location: zod_1.z.string().trim().max(200).nullish(),
        rules: zod_1.z.array(zod_1.z.string().trim().min(1).max(300)).max(30).optional(),
        image: urlish.nullish(),
        coverImage: urlish.nullish(),
        joinPolicy: zod_1.z
            .enum([
            group_constants_1.GROUP_JOIN_POLICY.OPEN,
            group_constants_1.GROUP_JOIN_POLICY.REQUEST,
            group_constants_1.GROUP_JOIN_POLICY.CLOSED,
        ])
            .optional(),
        postPermission: zod_1.z
            .enum([group_constants_1.GROUP_POST_PERMISSION.ALL_MEMBERS, group_constants_1.GROUP_POST_PERMISSION.ADMINS])
            .optional(),
        postApprovalEnabled: zod_1.z.boolean().optional(),
        chatEnabled: zod_1.z.boolean().optional(),
        notifyOnNewPost: zod_1.z.boolean().optional(),
    })
        .strict(),
});
const reviewRequestValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        decision: zod_1.z.enum(["APPROVED", "REJECTED"]),
        userId: zod_1.z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid user id"),
    }),
});
const changeRoleValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        role: zod_1.z.enum([group_constants_1.GROUP_ROLE.ADMIN, group_constants_1.GROUP_ROLE.MODERATOR, group_constants_1.GROUP_ROLE.MEMBER]),
        userId: zod_1.z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid user id"),
    }),
});
const transferOwnershipValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        userId: zod_1.z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid user id"),
        confirm: zod_1.z.literal(true, {
            errorMap: () => ({ message: "Explicit confirmation is required" }),
        }),
    }),
});
const memberActionValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        userId: zod_1.z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid user id"),
        ban: zod_1.z.boolean().optional(),
        muted: zod_1.z.boolean().optional(),
    }),
});
const createInviteValidationSchema = zod_1.z.object({
    body: zod_1.z
        .object({
        label: zod_1.z.string().trim().max(100).optional(),
        maxUses: zod_1.z.number().int().min(1).max(10000).optional(),
        expiresAt: zod_1.z.string().datetime().optional(),
        requiresApproval: zod_1.z.boolean().optional(),
    })
        .strict(),
});
const moderationActionValidationSchema = zod_1.z.object({
    body: zod_1.z
        .object({
        reason: zod_1.z.string().trim().max(500).optional(),
    })
        .strict()
        .optional(),
});
const moderationListValidationSchema = zod_1.z.object({
    query: zod_1.z
        .object({
        status: zod_1.z
            .enum([
            group_constants_1.GROUP_MODERATION_STATUS.PENDING,
            group_constants_1.GROUP_MODERATION_STATUS.APPROVED,
            group_constants_1.GROUP_MODERATION_STATUS.REJECTED,
            group_constants_1.GROUP_MODERATION_STATUS.REMOVED,
            "REPORTED",
        ])
            .optional(),
        page: zod_1.z.string().optional(),
        limit: zod_1.z.string().optional(),
    })
        .passthrough(),
});
const createGroupPostValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        title: zod_1.z.string().trim().min(1).max(300),
        description: zod_1.z.string().trim().min(1).max(10000),
        images: zod_1.z.array(urlish).min(1).max(20),
        category: zod_1.z.string().trim().min(1).max(100).optional(),
        location: zod_1.z.string().trim().max(200).optional(),
        tags: zod_1.z.array(zod_1.z.string().trim().max(50)).max(20).optional(),
        accessibilityText: zod_1.z.array(zod_1.z.string().trim().max(300)).max(20).optional(),
    }),
});
exports.GroupValidation = {
    createGroupValidationSchema,
    updateGroupValidationSchema,
    reviewRequestValidationSchema,
    changeRoleValidationSchema,
    transferOwnershipValidationSchema,
    memberActionValidationSchema,
    createInviteValidationSchema,
    moderationActionValidationSchema,
    moderationListValidationSchema,
    createGroupPostValidationSchema,
};
