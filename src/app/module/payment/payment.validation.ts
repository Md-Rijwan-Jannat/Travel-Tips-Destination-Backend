import { z } from "zod";

// Initiation whitelist: customer presentation fields only. Server-owned fields
// (`user`, `amount`, `transitionId`, `status`) are intentionally absent and get
// stripped — the service binds the record to the token's user and computes the
// amount from the server price table.
export const initiatePaymentValidationSchema = z.object({
  body: z.object({
    customerName: z.string().optional(),
    customerEmail: z.string().email("Invalid email address"),
    customerNumber: z.string().optional(),
    customerAddress: z.string().optional(),
    customerCountry: z.string().optional(),
  }),
});

export const PaymentValidation = {
  initiatePaymentValidationSchema,
};
