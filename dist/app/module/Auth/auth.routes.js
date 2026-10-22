"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthRoutes = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
const express_1 = __importDefault(require("express"));
const validateRequest_1 = __importDefault(require("../../middlewares/validateRequest"));
const auth_controller_1 = require("./auth.controller");
const auth_validation_1 = require("./auth.validation");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const rateLimiter_1 = require("../../middlewares/rateLimiter");
const user_constants_1 = require("../User/user.constants");
const router = express_1.default.Router();
router.post('/register', rateLimiter_1.credentialLimiter, (0, validateRequest_1.default)(auth_validation_1.UserValidation.registerUserValidationSchema), auth_controller_1.UserControllers.registerUser);
router.post('/login', rateLimiter_1.credentialLimiter, (0, validateRequest_1.default)(auth_validation_1.UserValidation.loginUserValidationSchema), auth_controller_1.UserControllers.loginUser);
router.post('/reset-link', rateLimiter_1.credentialLimiter, auth_controller_1.UserControllers.resetLink);
router.post('/forget-password', rateLimiter_1.credentialLimiter, auth_controller_1.UserControllers.forgetPassword);
router.post('/change-password', (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), auth_controller_1.UserControllers.changePassword);
// --- Google OAuth -----------------------------------------------------------
router.post('/google', (0, validateRequest_1.default)(auth_validation_1.UserValidation.googleAuthValidationSchema), auth_controller_1.UserControllers.googleAuth);
router.post('/google/link', (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), (0, validateRequest_1.default)(auth_validation_1.UserValidation.googleLinkValidationSchema), auth_controller_1.UserControllers.linkGoogle);
router.post('/google/unlink', (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), (0, validateRequest_1.default)(auth_validation_1.UserValidation.googleUnlinkValidationSchema), auth_controller_1.UserControllers.unlinkGoogle);
// --- Two-factor authentication (TOTP + recovery codes) ----------------------
router.get('/2fa/status', (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), auth_controller_1.UserControllers.twoFactorStatus);
// --- Email OTP (alternative second factor) ----------------------------------
// Safe challenge info (methods + masked email) for the verification screen.
router.post('/2fa/challenge-info', (0, validateRequest_1.default)(auth_validation_1.UserValidation.twoFactorChallengeInfoValidationSchema), auth_controller_1.UserControllers.twoFactorChallengeInfo);
// Send an email OTP for a live login challenge (recipient resolved
// server-side from the challenge). Per-IP delivery budget + MongoDB-backed
// per-challenge cooldown / per-account send window inside the service.
router.post('/2fa/email/send', rateLimiter_1.otpSendLimiter, (0, validateRequest_1.default)(auth_validation_1.UserValidation.twoFactorEmailSendValidationSchema), auth_controller_1.UserControllers.sendTwoFactorEmailOtp);
// Verify an email OTP — consumes the challenge atomically, issues the
// session only on success.
router.post('/2fa/email/verify', (0, validateRequest_1.default)(auth_validation_1.UserValidation.twoFactorEmailVerifyValidationSchema), auth_controller_1.UserControllers.verifyTwoFactorEmailLogin);
// --- Account-email verification (required before email OTP as a factor) ----
router.post('/email-verification/send', (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), rateLimiter_1.otpSendLimiter, auth_controller_1.UserControllers.sendEmailVerificationOtp);
router.post('/email-verification/verify', (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), (0, validateRequest_1.default)(auth_validation_1.UserValidation.emailVerificationVerifyValidationSchema), auth_controller_1.UserControllers.verifyEmailOwnership);
// --- Email-OTP enrollment (switch the single active method to email) --------
router.post('/2fa/email-otp/enroll/send', (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), rateLimiter_1.otpSendLimiter, auth_controller_1.UserControllers.enableEmailOtp);
router.post('/2fa/email-otp/enroll/verify', (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), (0, validateRequest_1.default)(auth_validation_1.UserValidation.enableEmailOtpVerifyValidationSchema), auth_controller_1.UserControllers.verifyEnableEmailOtp);
router.post('/2fa/enroll', (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), (0, validateRequest_1.default)(auth_validation_1.UserValidation.twoFactorEnrollValidationSchema), auth_controller_1.UserControllers.enrollTwoFactor);
router.post('/2fa/verify-enrollment', (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), (0, validateRequest_1.default)(auth_validation_1.UserValidation.twoFactorCodeValidationSchema), auth_controller_1.UserControllers.verifyTwoFactorEnrollment);
router.post('/2fa/verify-login', rateLimiter_1.credentialLimiter, (0, validateRequest_1.default)(auth_validation_1.UserValidation.twoFactorLoginValidationSchema), auth_controller_1.UserControllers.verifyTwoFactorLogin);
router.post('/2fa/disable', (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), (0, validateRequest_1.default)(auth_validation_1.UserValidation.twoFactorDisableValidationSchema), auth_controller_1.UserControllers.disableTwoFactor);
router.post('/2fa/recovery-codes/regenerate', (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), (0, validateRequest_1.default)(auth_validation_1.UserValidation.twoFactorRegenerateValidationSchema), auth_controller_1.UserControllers.regenerateRecoveryCodes);
exports.AuthRoutes = router;
