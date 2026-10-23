"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileValidation = exports.updateMyProfileValidationSchema = void 0;
const zod_1 = require("zod");
// Profile update whitelist. Notably excludes `verified` (premium/verification
// flag: admin-only), `role`, `status`, and `password`.
exports.updateMyProfileValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().nonempty("Name is required").optional(),
        email: zod_1.z.string().email("Invalid email address").optional(),
        bio: zod_1.z.string().max(500).optional(),
        image: zod_1.z.string().url().optional(),
        coverImage: zod_1.z.string().url().nullish(),
        country: zod_1.z.string().optional(),
        address: zod_1.z.string().optional(),
    }),
});
exports.ProfileValidation = {
    updateMyProfileValidationSchema: exports.updateMyProfileValidationSchema,
};
