"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentValidation = exports.initiatePaymentValidationSchema = void 0;
const zod_1 = require("zod");
// Initiation whitelist: customer presentation fields only. Server-owned fields
// (`user`, `amount`, `transitionId`, `status`) are intentionally absent and get
// stripped — the service binds the record to the token's user and computes the
// amount from the server price table.
exports.initiatePaymentValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        customerName: zod_1.z.string().optional(),
        customerEmail: zod_1.z.string().email("Invalid email address"),
        customerNumber: zod_1.z.string().optional(),
        customerAddress: zod_1.z.string().optional(),
        customerCountry: zod_1.z.string().optional(),
    }),
});
exports.PaymentValidation = {
    initiatePaymentValidationSchema: exports.initiatePaymentValidationSchema,
};
