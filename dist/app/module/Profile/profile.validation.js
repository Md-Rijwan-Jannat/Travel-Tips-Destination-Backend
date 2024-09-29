"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileValidation = exports.updateMyProfileValidationSchema = void 0;
const zod_1 = require("zod");
exports.updateMyProfileValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().nonempty("Name is required").optional(),
        email: zod_1.z.string().email("Invalid email address").optional(),
        image: zod_1.z.string().optional(),
        flower: zod_1.z.number().default(0).optional(),
        flowing: zod_1.z.number().default(0).optional(),
        verified: zod_1.z.boolean().optional(),
        country: zod_1.z.string().optional(),
        address: zod_1.z.string().optional(),
    }),
});
exports.ProfileValidation = {
    updateMyProfileValidationSchema: exports.updateMyProfileValidationSchema,
};
