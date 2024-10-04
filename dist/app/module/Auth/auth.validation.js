"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserValidation = exports.updateUserValidationSchema = exports.registerUserValidationSchema = void 0;
const zod_1 = require("zod");
const user_constants_1 = require("../User/user.constants");
exports.registerUserValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().nonempty("Name is required"),
        email: zod_1.z
            .string()
            .email("Invalid email address")
            .nonempty("Email is required"),
        password: zod_1.z
            .string()
            .min(6, "Password must be at least 6 characters long")
            .nonempty("Password is required")
            .optional(),
        image: zod_1.z.string().optional(),
        role: zod_1.z.enum(["admin", "user"]).default("user"),
        status: zod_1.z
            .enum([user_constants_1.USER_STATUS.IN_PROGRESS, user_constants_1.USER_STATUS.BLOCKED])
            .default(user_constants_1.USER_STATUS.IN_PROGRESS),
        flower: zod_1.z.number().default(0),
        flowing: zod_1.z.number().default(0),
        verified: zod_1.z.boolean().default(false),
        country: zod_1.z.string().optional().optional(),
        address: zod_1.z.string().optional().optional(),
        isDeleted: zod_1.z.boolean().default(false),
    }),
});
exports.updateUserValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().nonempty("Name is required").optional(),
        email: zod_1.z.string().email("Invalid email address").optional(),
        password: zod_1.z
            .string()
            .min(6, "Password must be at least 6 characters long")
            .optional(),
        image: zod_1.z.string().optional(),
        role: zod_1.z.enum(["admin", "user"]).optional(),
        status: zod_1.z.enum([user_constants_1.USER_STATUS.IN_PROGRESS, user_constants_1.USER_STATUS.BLOCKED]).optional(),
        flower: zod_1.z.number().default(0).optional(),
        flowing: zod_1.z.number().default(0).optional(),
        verified: zod_1.z.boolean().optional(),
        country: zod_1.z.string().optional(),
        address: zod_1.z.string().optional(),
        isDeleted: zod_1.z.boolean().optional(),
    }),
});
const loginUserValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z
            .string()
            .email("Invalid email address")
            .nonempty("Email is required"),
        password: zod_1.z.string().min(6, "Password must be at least 6 characters long"),
    }),
});
exports.UserValidation = {
    registerUserValidationSchema: exports.registerUserValidationSchema,
    loginUserValidationSchema,
    updateUserValidationSchema: exports.updateUserValidationSchema,
};
