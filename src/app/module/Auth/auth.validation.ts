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

// --- Google OAuth -----------------------------------------------------------

export const googleAuthValidationSchema = z.object({
  body: z.object({
    // Google ID token — verified server-side; never a browser profile payload.
    idToken: z.string().min(1, "Google token is required"),
  }),
});

export const googleLinkValidationSchema = z.object({
  body: z.object({
    idToken: z.string().min(1, "Google token is required"),
    // Required when the account has a password (recent re-authentication).
    password: z.string().min(6).optional(),
  }),
});

export const googleUnlinkValidationSchema = z.object({
  body: z.object({
    password: z.string().min(6).optional(),
  }),
});

// --- Two-factor authentication ----------------------------------------------

export const twoFactorEnrollValidationSchema = z.object({
  body: z.object({
    password: z.string().min(6).optional(),
  }),
});

export const twoFactorCodeValidationSchema = z.object({
  body: z.object({
    // 6-digit TOTP or a "xxxxx-xxxxx-xxxxx-xxxxx" recovery code.
    code: z
      .string()
      .min(6, "Verification code is required")
      .max(30, "Invalid verification code"),
  }),
});

export const twoFactorLoginValidationSchema = z.object({
  body: z.object({
    challengeToken: z.string().min(1, "Verification challenge is required"),
    code: z
      .string()
      .min(6, "Verification code is required")
      .max(30, "Invalid verification code"),
  }),
});

// --- Email OTP (alternative 2FA factor + email verification) ----------------

export const twoFactorChallengeInfoValidationSchema = z.object({
  body: z.object({
    challengeToken: z.string().min(1, "Verification challenge is required"),
  }),
});

export const twoFactorEmailSendValidationSchema = z.object({
  body: z.object({
    // Recipient is resolved server-side from the challenge — no email field.
    challengeToken: z.string().min(1, "Verification challenge is required"),
  }),
});

export const twoFactorEmailVerifyValidationSchema = z.object({
  body: z.object({
    challengeToken: z.string().min(1, "Verification challenge is required"),
    code: z
      .string()
      .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
  }),
});

export const emailVerificationVerifyValidationSchema = z.object({
  body: z.object({
    code: z
      .string()
      .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
  }),
});

export const enableEmailOtpVerifyValidationSchema = z.object({
  body: z.object({
    code: z
      .string()
      .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
  }),
});

export const twoFactorDisableValidationSchema = z.object({
  body: z.object({
    password: z.string().min(6).optional(),
    // Required for the authenticator method; the email method disables with
    // password re-authentication only.
    code: z
      .string()
      .min(6, "Verification code is required")
      .max(30, "Invalid verification code")
      .optional(),
  }),
});

export const twoFactorRegenerateValidationSchema = z.object({
  body: z.object({
    password: z.string().min(6).optional(),
    code: z
      .string()
      .min(6, "Verification code is required")
      .max(30, "Invalid verification code"),
  }),
});

export const UserValidation = {
  registerUserValidationSchema,
  loginUserValidationSchema,
  updateUserValidationSchema,
  googleAuthValidationSchema,
  googleLinkValidationSchema,
  googleUnlinkValidationSchema,
  twoFactorEnrollValidationSchema,
  twoFactorCodeValidationSchema,
  twoFactorLoginValidationSchema,
  twoFactorDisableValidationSchema,
  twoFactorRegenerateValidationSchema,
  twoFactorChallengeInfoValidationSchema,
  twoFactorEmailSendValidationSchema,
  twoFactorEmailVerifyValidationSchema,
  emailVerificationVerifyValidationSchema,
  enableEmailOtpVerifyValidationSchema,
};
