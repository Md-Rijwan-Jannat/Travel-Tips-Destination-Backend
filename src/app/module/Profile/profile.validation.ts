import { z } from "zod";

export const updateMyProfileValidationSchema = z.object({
  body: z.object({
    name: z.string().nonempty("Name is required").optional(),
    email: z.string().email("Invalid email address").optional(),
    image: z.string().optional(),
    flower: z.number().default(0).optional(),
    flowing: z.number().default(0).optional(),
    verified: z.boolean().optional(),
    country: z.string().optional(),
    address: z.string().optional(),
  }),
});

export const ProfileValidation = {
  updateMyProfileValidationSchema,
};
