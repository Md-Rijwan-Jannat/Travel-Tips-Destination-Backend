import { z } from "zod";

// Profile update whitelist. Notably excludes `verified` (premium/verification
// flag: admin-only), `role`, `status`, and `password`.
export const updateMyProfileValidationSchema = z.object({
  body: z.object({
    name: z.string().nonempty("Name is required").optional(),
    email: z.string().email("Invalid email address").optional(),
    bio: z.string().max(500).optional(),
    image: z.string().url().optional(),
    coverImage: z.string().url().nullish(),
    country: z.string().optional(),
    address: z.string().optional(),
  }),
});

export const ProfileValidation = {
  updateMyProfileValidationSchema,
};
