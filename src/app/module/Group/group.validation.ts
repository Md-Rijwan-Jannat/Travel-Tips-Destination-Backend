import { z } from "zod";
import {
  GROUP_CATEGORY,
  GROUP_JOIN_POLICY,
  GROUP_MODERATION_STATUS,
  GROUP_POST_PERMISSION,
  GROUP_ROLE,
  GROUP_VISIBILITY,
} from "./group.constants";

const urlish = z.string().url().max(1000);

const createGroupValidationSchema = z.object({
  body: z.object({
    name: z.string().trim().min(3).max(100),
    slug: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Slug must be URL-friendly")
      .optional(),
    description: z.string().trim().min(10).max(2000),
    purpose: z.string().trim().max(2000).optional(),
    category: z.enum(GROUP_CATEGORY),
    visibility: z.enum([GROUP_VISIBILITY.PUBLIC, GROUP_VISIBILITY.PRIVATE]).optional(),
    image: urlish.nullish(),
    coverImage: urlish.nullish(),
    location: z.string().trim().max(200).nullish(),
    rules: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
    joinPolicy: z
      .enum([
        GROUP_JOIN_POLICY.OPEN,
        GROUP_JOIN_POLICY.REQUEST,
        GROUP_JOIN_POLICY.CLOSED,
      ])
      .optional(),
    postPermission: z
      .enum([GROUP_POST_PERMISSION.ALL_MEMBERS, GROUP_POST_PERMISSION.ADMINS])
      .optional(),
    postApprovalEnabled: z.boolean().optional(),
    chatEnabled: z.boolean().optional(),
    notifyOnNewPost: z.boolean().optional(),
  }),
});

const updateGroupValidationSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(3).max(100).optional(),
      description: z.string().trim().min(10).max(2000).optional(),
      purpose: z.string().trim().max(2000).nullish(),
      category: z.enum(GROUP_CATEGORY).optional(),
      visibility: z.enum([GROUP_VISIBILITY.PUBLIC, GROUP_VISIBILITY.PRIVATE]).optional(),
      location: z.string().trim().max(200).nullish(),
      rules: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
      image: urlish.nullish(),
      coverImage: urlish.nullish(),
      joinPolicy: z
        .enum([
          GROUP_JOIN_POLICY.OPEN,
          GROUP_JOIN_POLICY.REQUEST,
          GROUP_JOIN_POLICY.CLOSED,
        ])
        .optional(),
      postPermission: z
        .enum([GROUP_POST_PERMISSION.ALL_MEMBERS, GROUP_POST_PERMISSION.ADMINS])
        .optional(),
      postApprovalEnabled: z.boolean().optional(),
      chatEnabled: z.boolean().optional(),
      notifyOnNewPost: z.boolean().optional(),
    })
    .strict(),
});

const reviewRequestValidationSchema = z.object({
  body: z.object({
    decision: z.enum(["APPROVED", "REJECTED"]),
    userId: z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid user id"),
  }),
});

const changeRoleValidationSchema = z.object({
  body: z.object({
    role: z.enum([GROUP_ROLE.ADMIN, GROUP_ROLE.MODERATOR, GROUP_ROLE.MEMBER]),
    userId: z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid user id"),
  }),
});

const transferOwnershipValidationSchema = z.object({
  body: z.object({
    userId: z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid user id"),
    confirm: z.literal(true, {
      errorMap: () => ({ message: "Explicit confirmation is required" }),
    }),
  }),
});

const memberActionValidationSchema = z.object({
  body: z.object({
    userId: z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid user id"),
    ban: z.boolean().optional(),
    muted: z.boolean().optional(),
  }),
});

const createInviteValidationSchema = z.object({
  body: z
    .object({
      label: z.string().trim().max(100).optional(),
      maxUses: z.number().int().min(1).max(10000).optional(),
      expiresAt: z.string().datetime().optional(),
      requiresApproval: z.boolean().optional(),
    })
    .strict(),
});

const moderationActionValidationSchema = z.object({
  body: z
    .object({
      reason: z.string().trim().max(500).optional(),
    })
    .strict()
    .optional(),
});

const moderationListValidationSchema = z.object({
  query: z
    .object({
      status: z
        .enum([
          GROUP_MODERATION_STATUS.PENDING,
          GROUP_MODERATION_STATUS.APPROVED,
          GROUP_MODERATION_STATUS.REJECTED,
          GROUP_MODERATION_STATUS.REMOVED,
          "REPORTED",
        ])
        .optional(),
      page: z.string().optional(),
      limit: z.string().optional(),
    })
    .passthrough(),
});

const createGroupPostValidationSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).max(10000),
    images: z.array(urlish).min(1).max(20),
    category: z.string().trim().min(1).max(100).optional(),
    location: z.string().trim().max(200).optional(),
    tags: z.array(z.string().trim().max(50)).max(20).optional(),
    accessibilityText: z.array(z.string().trim().max(300)).max(20).optional(),
  }),
});

export const GroupValidation = {
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
