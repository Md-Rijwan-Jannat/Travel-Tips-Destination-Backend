import { z } from "zod";
import { USER_STATUS } from "../User/user.constants";

// Public registration whitelist: identity fields only. Privilege/integrity
// fields (role, status, verified, isDeleted) are NOT client-selectable — the
// model applies its defaults (role USER, verified false, ...). Previously this
// schema accepted `role` (incl. "admin") and defaulted it to lowercase "user",
// which violated the model enum and broke registration.
export const registerUserValidationSchema = z.object({
  body: z.object({
    name: z.string().nonempty("Name is required"),
    email: z
      .string()
      .email("Invalid email address")
      .nonempty("Email is required"),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters long")
      .nonempty("Password is required")
      .optional(),
    image: z.string().optional(),
    country: z.string().optional(),
    address: z.string().optional(),
  }),
});

export const updateUserValidationSchema = z.object({
  body: z.object({
    name: z.string().nonempty("Name is required").optional(),
    email: z.string().email("Invalid email address").optional(),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters long")
      .optional(),
    image: z.string().optional(),
    role: z.enum(["admin", "user"]).optional(),
    status: z.enum([USER_STATUS.IN_PROGRESS, USER_STATUS.BLOCKED]).optional(),
    flower: z.number().default(0).optional(),
    flowing: z.number().default(0).optional(),
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
    password: z.string().min(6, "Password must be at least 6 characters long"),
  }),
});

export const UserValidation = {
  registerUserValidationSchema,
  loginUserValidationSchema,
  updateUserValidationSchema,
};
