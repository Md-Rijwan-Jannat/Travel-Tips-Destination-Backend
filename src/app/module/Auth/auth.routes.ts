/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import validateRequest from '../../middlewares/validateRequest';
import { UserControllers } from './auth.controller';
import { UserValidation } from './auth.validation';
import Auth from '../../middlewares/auth';
import { credentialLimiter, otpSendLimiter } from '../../middlewares/rateLimiter';
import { USER_ROLE } from '../User/user.constants';

const router = express.Router();

router.post(
  '/register',
  credentialLimiter,
  validateRequest(UserValidation.registerUserValidationSchema),
  UserControllers.registerUser
);

router.post(
  '/login',
  credentialLimiter,
  validateRequest(UserValidation.loginUserValidationSchema),
  UserControllers.loginUser
);

router.post('/reset-link', credentialLimiter, UserControllers.resetLink);

router.post(
  '/forget-password',
  credentialLimiter,
  UserControllers.forgetPassword
);

router.post(
  '/change-password',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  UserControllers.changePassword
);

// --- Google OAuth -----------------------------------------------------------

router.post(
  '/google',
  validateRequest(UserValidation.googleAuthValidationSchema),
  UserControllers.googleAuth
);

router.post(
  '/google/link',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  validateRequest(UserValidation.googleLinkValidationSchema),
  UserControllers.linkGoogle
);

router.post(
  '/google/unlink',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  validateRequest(UserValidation.googleUnlinkValidationSchema),
  UserControllers.unlinkGoogle
);

// --- Two-factor authentication (TOTP + recovery codes) ----------------------

router.get(
  '/2fa/status',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  UserControllers.twoFactorStatus
);

// --- Email OTP (alternative second factor) ----------------------------------

// Safe challenge info (methods + masked email) for the verification screen.
router.post(
  '/2fa/challenge-info',
  validateRequest(UserValidation.twoFactorChallengeInfoValidationSchema),
  UserControllers.twoFactorChallengeInfo
);

// Send an email OTP for a live login challenge (recipient resolved
// server-side from the challenge). Per-IP delivery budget + MongoDB-backed
// per-challenge cooldown / per-account send window inside the service.
router.post(
  '/2fa/email/send',
  otpSendLimiter,
  validateRequest(UserValidation.twoFactorEmailSendValidationSchema),
  UserControllers.sendTwoFactorEmailOtp
);

// Verify an email OTP — consumes the challenge atomically, issues the
// session only on success.
router.post(
  '/2fa/email/verify',
  validateRequest(UserValidation.twoFactorEmailVerifyValidationSchema),
  UserControllers.verifyTwoFactorEmailLogin
);

// --- Account-email verification (required before email OTP as a factor) ----

router.post(
  '/email-verification/send',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  otpSendLimiter,
  UserControllers.sendEmailVerificationOtp
);

router.post(
  '/email-verification/verify',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  validateRequest(UserValidation.emailVerificationVerifyValidationSchema),
  UserControllers.verifyEmailOwnership
);

// --- Email-OTP enrollment (switch the single active method to email) --------

router.post(
  '/2fa/email-otp/enroll/send',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  otpSendLimiter,
  UserControllers.enableEmailOtp
);

router.post(
  '/2fa/email-otp/enroll/verify',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  validateRequest(UserValidation.enableEmailOtpVerifyValidationSchema),
  UserControllers.verifyEnableEmailOtp
);

router.post(
  '/2fa/enroll',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  validateRequest(UserValidation.twoFactorEnrollValidationSchema),
  UserControllers.enrollTwoFactor
);

router.post(
  '/2fa/verify-enrollment',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  validateRequest(UserValidation.twoFactorCodeValidationSchema),
  UserControllers.verifyTwoFactorEnrollment
);

router.post(
  '/2fa/verify-login',
  credentialLimiter,
  validateRequest(UserValidation.twoFactorLoginValidationSchema),
  UserControllers.verifyTwoFactorLogin
);

router.post(
  '/2fa/disable',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  validateRequest(UserValidation.twoFactorDisableValidationSchema),
  UserControllers.disableTwoFactor
);

router.post(
  '/2fa/recovery-codes/regenerate',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  validateRequest(UserValidation.twoFactorRegenerateValidationSchema),
  UserControllers.regenerateRecoveryCodes
);

export const AuthRoutes = router;
