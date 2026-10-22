import { z } from "zod";

// Profile update whitelist. Notably excludes `verified` (premium/verification
// flag: admin-only), `role`, `status`, and `password`.
export const updateMyProfileValidationSchema = z.object({
  body: z.object({
    name: z.string().nonempty("Name is required").optional(),
    email: z.string().email("Invalid email address").optional(),
    image: z.string().optional(),
    country: z.string().optional(),
    address: z.string().optional(),
  }),
});

export const ProfileValidation = {
  updateMyProfileValidationSchema,
};
