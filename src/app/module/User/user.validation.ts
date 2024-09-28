import { z } from "zod";

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
    status: z.enum(["in-progress", "blocked"]).default("in-progress"),
    flower: z.number().default(0),
    flowing: z.number().default(0),
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
    status: z.enum(["in-progress", "blocked"]).optional(),
    flower: z.number().default(0).optional(),
    flowing: z.number().default(0).optional(),
    verified: z.boolean().optional(),
    country: z.string().optional(),
    address: z.string().optional(),
    isDeleted: z.boolean().optional(),
  }),
});

export const UserValidation = {
  registerUserValidationSchema,
  updateUserValidationSchema,
};
