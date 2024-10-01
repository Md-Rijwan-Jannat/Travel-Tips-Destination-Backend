import { z } from "zod";
import { USER_STATUS } from "./user.constants";

export const registerUserValidationSchema = z.object({
  body: z.object({
    name: z.string().nonempty("Name is required"),
    email: z
      .string()
      .email("Invalid email address")
      .nonempty("Email is required"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .nonempty("Password is required")
      .optional(),
    image: z.string().optional(),
    role: z.enum(["admin", "user"]).default("user"),
    status: z
      .enum([USER_STATUS.IN_PROGRESS, USER_STATUS.BLOCKED])
      .default(USER_STATUS.IN_PROGRESS),
    verified: z.boolean().default(false),
    country: z.string().optional().optional(),
    address: z.string().optional().optional(),
    isDeleted: z.boolean().default(false),
  }),
});

export const updateUserValidationSchema = z.object({
  body: z.object({
    name: z.string().nonempty("Name is required").optional(),
    email: z.string().email("Invalid email address").optional(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .optional(),
    image: z.string().optional(),
    role: z.enum(["admin", "user"]).optional(),
    status: z.enum([USER_STATUS.IN_PROGRESS, USER_STATUS.BLOCKED]).optional(),
    verified: z.boolean().optional(),
    country: z.string().optional(),
    address: z.string().optional(),
    isDeleted: z.boolean().optional(),
  }),
});

const loginUserValidationSchema = z.object({
  body: z.object({
    email: z
      .string()
      .email("Invalid email address")
      .nonempty("Email is required"),
    password: z.string().min(8, "Password must be at least 8 characters long"),
  }),
});

export const UserValidation = {
  registerUserValidationSchema,
  loginUserValidationSchema,
  updateUserValidationSchema,
};
