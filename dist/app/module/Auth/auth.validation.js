"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserValidation = exports.twoFactorRegenerateValidationSchema = exports.twoFactorDisableValidationSchema = exports.enableEmailOtpVerifyValidationSchema = exports.emailVerificationVerifyValidationSchema = exports.twoFactorEmailVerifyValidationSchema = exports.twoFactorEmailSendValidationSchema = exports.twoFactorChallengeInfoValidationSchema = exports.twoFactorLoginValidationSchema = exports.twoFactorCodeValidationSchema = exports.twoFactorEnrollValidationSchema = exports.googleUnlinkValidationSchema = exports.googleLinkValidationSchema = exports.googleAuthValidationSchema = exports.updateUserValidationSchema = exports.registerUserValidationSchema = void 0;
const zod_1 = require("zod");
const user_constants_1 = require("../User/user.constants");
// Public registration whitelist: identity fields only. Privilege/integrity
// fields (role, status, verified, isDeleted) are NOT client-selectable — the
// model applies its defaults (role USER, verified false, ...). Previously this
// schema accepted `role` (incl. "admin") and defaulted it to lowercase "user",
// which violated the model enum and broke registration.
exports.registerUserValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().nonempty("Name is required"),
        email: zod_1.z
            .string()
            .email("Invalid email address")
            .nonempty("Email is required"),
        password: zod_1.z
            .string()
            .min(6, "Password must be at least 6 characters long")
            .nonempty("Password is required")
            .optional(),
        image: zod_1.z.string().optional(),
        country: zod_1.z.string().optional(),
        address: zod_1.z.string().optional(),
    }),
});
exports.updateUserValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().nonempty("Name is required").optional(),
        email: zod_1.z.string().email("Invalid email address").optional(),
        password: zod_1.z
            .string()
            .min(6, "Password must be at least 6 characters long")
            .optional(),
        image: zod_1.z.string().optional(),
        role: zod_1.z.enum(["admin", "user"]).optional(),
        status: zod_1.z.enum([user_constants_1.USER_STATUS.IN_PROGRESS, user_constants_1.USER_STATUS.BLOCKED]).optional(),
        flower: zod_1.z.number().default(0).optional(),
        flowing: zod_1.z.number().default(0).optional(),
        verified: zod_1.z.boolean().optional(),
        country: zod_1.z.string().optional(),
        address: zod_1.z.string().optional(),
        isDeleted: zod_1.z.boolean().optional(),
    }),
});
const loginUserValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z
            .string()
            .email("Invalid email address")
            .nonempty("Email is required"),
        password: zod_1.z.string().min(6, "Password must be at least 6 characters long"),
    }),
});
// --- Google OAuth -----------------------------------------------------------
exports.googleAuthValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        // Google ID token — verified server-side; never a browser profile payload.
        idToken: zod_1.z.string().min(1, "Google token is required"),
    }),
});
exports.googleLinkValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        idToken: zod_1.z.string().min(1, "Google token is required"),
        // Required when the account has a password (recent re-authentication).
        password: zod_1.z.string().min(6).optional(),
    }),
});
exports.googleUnlinkValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        password: zod_1.z.string().min(6).optional(),
    }),
});
// --- Two-factor authentication ----------------------------------------------
exports.twoFactorEnrollValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        password: zod_1.z.string().min(6).optional(),
    }),
});
exports.twoFactorCodeValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        // 6-digit TOTP or a "xxxxx-xxxxx-xxxxx-xxxxx" recovery code.
        code: zod_1.z
            .string()
            .min(6, "Verification code is required")
            .max(30, "Invalid verification code"),
    }),
});
exports.twoFactorLoginValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        challengeToken: zod_1.z.string().min(1, "Verification challenge is required"),
        code: zod_1.z
            .string()
            .min(6, "Verification code is required")
            .max(30, "Invalid verification code"),
    }),
});
// --- Email OTP (alternative 2FA factor + email verification) ----------------
exports.twoFactorChallengeInfoValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        challengeToken: zod_1.z.string().min(1, "Verification challenge is required"),
    }),
});
exports.twoFactorEmailSendValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        // Recipient is resolved server-side from the challenge — no email field.
        challengeToken: zod_1.z.string().min(1, "Verification challenge is required"),
    }),
});
exports.twoFactorEmailVerifyValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        challengeToken: zod_1.z.string().min(1, "Verification challenge is required"),
        code: zod_1.z
            .string()
            .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
    }),
});
exports.emailVerificationVerifyValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        code: zod_1.z
            .string()
            .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
    }),
});
exports.enableEmailOtpVerifyValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        code: zod_1.z
            .string()
            .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
    }),
});
exports.twoFactorDisableValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        password: zod_1.z.string().min(6).optional(),
        // Required for the authenticator method; the email method disables with
        // password re-authentication only.
        code: zod_1.z
            .string()
            .min(6, "Verification code is required")
            .max(30, "Invalid verification code")
            .optional(),
    }),
});
exports.twoFactorRegenerateValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        password: zod_1.z.string().min(6).optional(),
        code: zod_1.z
            .string()
            .min(6, "Verification code is required")
            .max(30, "Invalid verification code"),
    }),
});
exports.UserValidation = {
    registerUserValidationSchema: exports.registerUserValidationSchema,
    loginUserValidationSchema,
    updateUserValidationSchema: exports.updateUserValidationSchema,
    googleAuthValidationSchema: exports.googleAuthValidationSchema,
    googleLinkValidationSchema: exports.googleLinkValidationSchema,
    googleUnlinkValidationSchema: exports.googleUnlinkValidationSchema,
    twoFactorEnrollValidationSchema: exports.twoFactorEnrollValidationSchema,
    twoFactorCodeValidationSchema: exports.twoFactorCodeValidationSchema,
    twoFactorLoginValidationSchema: exports.twoFactorLoginValidationSchema,
    twoFactorDisableValidationSchema: exports.twoFactorDisableValidationSchema,
    twoFactorRegenerateValidationSchema: exports.twoFactorRegenerateValidationSchema,
    twoFactorChallengeInfoValidationSchema: exports.twoFactorChallengeInfoValidationSchema,
    twoFactorEmailSendValidationSchema: exports.twoFactorEmailSendValidationSchema,
    twoFactorEmailVerifyValidationSchema: exports.twoFactorEmailVerifyValidationSchema,
    emailVerificationVerifyValidationSchema: exports.emailVerificationVerifyValidationSchema,
    enableEmailOtpVerifyValidationSchema: exports.enableEmailOtpVerifyValidationSchema,
};
