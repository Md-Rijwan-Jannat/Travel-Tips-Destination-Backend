"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserServices = void 0;
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
const http_status_1 = __importDefault(require("http-status"));
const qrcode_1 = __importDefault(require("qrcode"));
const config_1 = __importDefault(require("../../../config"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const tokenGenerateFunction_1 = require("../../utils/tokenGenerateFunction");
const user_model_1 = require("../User/user.model");
const authChallenge_model_1 = require("./authChallenge.model");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const sendEmail_1 = require("../../utils/sendEmail");
const googleAuth_1 = require("../../utils/googleAuth");
const twoFactor_1 = require("../../utils/twoFactor");
const LOGIN_2FA_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PENDING_ENROLLMENT_TTL_MS = 15 * 60 * 1000; // 15 minutes
const issueTokens = (user) => {
    const jwtPayload = {
        id: String(user._id),
        email: user.email,
        role: user.role,
    };
    const accessToken = (0, tokenGenerateFunction_1.createToken)(jwtPayload, config_1.default.jwt_access_secret, config_1.default.jwt_access_expires_in);
    const refreshToken = (0, tokenGenerateFunction_1.createToken)(jwtPayload, config_1.default.jwt_access_secret, config_1.default.jwt_refresh_expires_in);
    return { accessToken, refreshToken };
};
/**
 * The active second factor, derived from the database only. Legacy documents
 * (created before `twoFactorMethod` existed) are interpreted from
 * `twoFactorEnabled`: enabled ⇒ authenticator, disabled ⇒ none. Never trust
 * a method supplied by the client.
 */
const effectiveTwoFactorMethod = (user) => {
    if (user.twoFactorMethod === 'authenticator' ||
        user.twoFactorMethod === 'email') {
        return user.twoFactorMethod;
    }
    if (user.twoFactorMethod === 'none')
        return 'none';
    return user.twoFactorEnabled ? 'authenticator' : 'none';
};
/** Lazily persist the derived method for legacy documents. */
const backfillTwoFactorMethod = (userId, method) => __awaiter(void 0, void 0, void 0, function* () {
    yield user_model_1.User.updateOne({ _id: userId, twoFactorMethod: { $exists: false } }, { $set: { twoFactorMethod: method } });
});
/**
 * One-shot boot migration: legacy accounts with 2FA enabled become
 * 'authenticator' (their enrolled TOTP secret is preserved — security is
 * never silently weakened); everything else becomes 'none'. Idempotent.
 */
const migrateLegacyTwoFactorMethods = () => __awaiter(void 0, void 0, void 0, function* () {
    yield user_model_1.User.updateMany({ twoFactorMethod: { $exists: false }, twoFactorEnabled: true }, { $set: { twoFactorMethod: 'authenticator' } });
    yield user_model_1.User.updateMany({ twoFactorMethod: { $exists: false } }, { $set: { twoFactorMethod: 'none' } });
});
/**
 * Server-side diagnostic for email delivery failures. Logs ONLY safe
 * fields (SMTP response code / error code / command) — never credentials,
 * recipients, or OTP contents.
 */
const logEmailDeliveryFailure = (scope, error) => {
    const e = error;
    // eslint-disable-next-line no-console
    console.error(`[email] delivery failed (${scope})`, {
        code: e === null || e === void 0 ? void 0 : e.code,
        responseCode: e === null || e === void 0 ? void 0 : e.responseCode,
        command: e === null || e === void 0 ? void 0 : e.command,
        name: e === null || e === void 0 ? void 0 : e.name,
    });
};
const isEmailConfigured = () => !!process.env.EMAIL_USER && !!process.env.EMAIL_PASS;
/** Shared email-failure handling: invalidate the issued code, log, throw. */
const failEmailDelivery = (scope, challengeId, error) => __awaiter(void 0, void 0, void 0, function* () {
    yield invalidateIssuedOtp(challengeId);
    if (!isEmailConfigured()) {
        // Root-cause signal for operators: SMTP credentials are missing/empty.
        // eslint-disable-next-line no-console
        console.error(`[email] ${scope}: SMTP is not configured — set EMAIL_USER and EMAIL_PASS`);
    }
    else {
        logEmailDeliveryFailure(scope, error);
    }
    throw new AppError_1.default(isEmailConfigured()
        ? http_status_1.default.BAD_GATEWAY
        : http_status_1.default.SERVICE_UNAVAILABLE, 'We could not send the verification email. Please try again.');
});
/** Create a short-lived, single-purpose 2FA login challenge (no session yet). */
const createLogin2FAChallenge = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const token = (0, twoFactor_1.generateChallengeToken)();
    yield authChallenge_model_1.AuthChallenge.create({
        userId,
        type: 'LOGIN_2FA',
        tokenHash: (0, twoFactor_1.hashChallengeToken)(token),
        expiresAt: new Date(Date.now() + LOGIN_2FA_CHALLENGE_TTL_MS),
    });
    return token;
});
/**
 * Build the "second factor required" response for a login. The active
 * method comes from the database only. For the email method a login OTP is
 * sent right away (delivery failure degrades to `otpSent: false` so the
 * user can retry from the verification screen — the challenge stays valid).
 */
const twoFactorRequiredResponse = (user) => __awaiter(void 0, void 0, void 0, function* () {
    const method = effectiveTwoFactorMethod(user);
    if (method === 'none') {
        // Caller should have issued tokens; treat as no-2FA.
        return issueTokens(user);
    }
    yield backfillTwoFactorMethod(user._id, method);
    const challengeToken = yield createLogin2FAChallenge(user._id);
    const base = {
        twoFactorRequired: true,
        challengeToken,
        method,
        maskedEmail: maskEmail(user.email),
    };
    if (method === 'authenticator') {
        // Recovery codes remain an authenticator-method fallback.
        return Object.assign(Object.assign({}, base), { methods: ['totp', 'recovery'] });
    }
    // method === 'email' — send the login OTP now.
    let otpSent = false;
    if (user.emailVerified) {
        try {
            const issued = yield issueChallengeOtpByToken(challengeToken);
            if (issued) {
                try {
                    yield (0, sendEmail_1.sendTwoFactorEmailOtp)(user.email, issued.code);
                    otpSent = true;
                }
                catch (error) {
                    yield failEmailDelivery('login-otp', issued.challengeId, error);
                }
            }
        }
        catch (error) {
            // Cooldown/cap/unconfigured — login still proceeds to the challenge
            // screen; the user can resend. Never fail primary auth on delivery.
            if (error instanceof AppError_1.default) {
                otpSent = false;
            }
            else {
                logEmailDeliveryFailure('login-otp', error);
                otpSent = false;
            }
        }
    }
    return Object.assign(Object.assign({}, base), { methods: ['email'], otpSent });
});
/**
 * Atomically consume a 2FA challenge so it can never be replayed, even
 * under concurrent requests.
 */
const consumeLogin2FAChallenge = (challengeToken, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const challenge = yield authChallenge_model_1.AuthChallenge.findOneAndUpdate({
        tokenHash: (0, twoFactor_1.hashChallengeToken)(challengeToken),
        type: 'LOGIN_2FA',
        userId,
        consumedAt: null,
        expiresAt: { $gt: new Date() },
    }, { $set: { consumedAt: new Date() } }, { new: true });
    if (!challenge) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid or expired verification challenge');
    }
});
/**
 * Recent re-authentication guard for sensitive account-security actions.
 * Users with a password must re-enter it; passwordless (Google-only)
 * accounts rely on the authenticated session.
 */
const assertRecentPasswordAuth = (user, password) => __awaiter(void 0, void 0, void 0, function* () {
    if (!user.password)
        return; // Google-only account: session is the credential
    if (!password) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Password confirmation is required');
    }
    const matches = yield user_model_1.User.isPasswordMatched(password, user.password);
    if (!matches) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Password do not matched');
    }
});
/** Verify a TOTP code or a single-use recovery code against the active 2FA factor. */
const verifyActiveTwoFactor = (user_1, code_1, _a) => __awaiter(void 0, [user_1, code_1, _a], void 0, function* (user, code, { consumeRecoveryCode }) {
    if (!user.twoFactorSecretEncrypted)
        return false;
    const secret = (0, twoFactor_1.decryptSecret)(user.twoFactorSecretEncrypted);
    if (yield (0, twoFactor_1.verifyTotpCode)(code, secret))
        return true;
    if (!consumeRecoveryCode)
        return false;
    const codeHash = (0, twoFactor_1.hashRecoveryCode)(code);
    const used = yield user_model_1.User.findOneAndUpdate({
        _id: user._id,
        twoFactorRecoveryCodes: {
            $elemMatch: { hash: codeHash, used: false },
        },
    }, {
        $set: {
            'twoFactorRecoveryCodes.$.used': true,
            'twoFactorRecoveryCodes.$.usedAt': new Date(),
        },
    }, { new: true }).select('+twoFactorRecoveryCodes');
    return !!used;
});
const notifySecurity = (to, input) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, sendEmail_1.sendSecurityEmail)(Object.assign({ to }, input));
    }
    catch (_a) {
        // Never block the security action on email delivery; never log content.
        // eslint-disable-next-line no-console
        console.error('Security notification email could not be delivered');
    }
});
const registerUserIntoDB = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findOne({ email: payload.email });
    if (!user) {
        const result = yield user_model_1.User.create(payload);
        const jwtPayload = {
            id: result._id,
            email: payload.email,
            role: 'USER',
        };
        const accessToken = (0, tokenGenerateFunction_1.createToken)(jwtPayload, config_1.default.jwt_access_secret, config_1.default.jwt_access_expires_in);
        const refreshToken = (0, tokenGenerateFunction_1.createToken)(jwtPayload, config_1.default.jwt_access_secret, config_1.default.jwt_refresh_expires_in);
        return {
            result,
            accessToken: accessToken,
            refreshToken: refreshToken,
        };
    }
});
const loginUserFromDB = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    // password has `select: false`; login is the one flow that must compare it.
    const user = yield user_model_1.User.findOne({ email: payload.email }).select('+password');
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
    }
    const userStatus = user === null || user === void 0 ? void 0 : user.status;
    if (userStatus === 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is blocked!');
    }
    //checking if the password is correct
    const passwordMatches = !!user.password &&
        (yield user_model_1.User.isPasswordMatched(payload.password, user.password));
    if (!passwordMatches)
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Password do not matched');
    // 2FA gate: no full session until the second factor is verified. The
    // active method lives only in the database — never trust the client.
    if (effectiveTwoFactorMethod(user) !== 'none') {
        return twoFactorRequiredResponse(user);
    }
    return issueTokens(user);
});
/**
 * Google sign-in / sign-up. The id_token is verified server-side (signature,
 * issuer, audience, expiry). A matching existing password account is NEVER
 * auto-linked — linking requires an authenticated session (POST /auth/google/link).
 */
const googleAuthIntoDB = (_a) => __awaiter(void 0, [_a], void 0, function* ({ idToken }) {
    let identity;
    try {
        identity = yield (0, googleAuth_1.verifyGoogleIdToken)(idToken);
    }
    catch (_b) {
        // Invalid signature / expired / wrong audience — generic message only.
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Google authentication failed');
    }
    if (!identity.emailVerified) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Your Google account email is not verified');
    }
    // 1. Already linked to this Google subject?
    let user = yield user_model_1.User.findOne({ googleSubject: identity.sub });
    if (!user) {
        // 2. Email collision handling — never take over an existing account.
        const existing = yield user_model_1.User.findOne({ email: identity.email });
        if (existing) {
            if (existing.googleSubject && existing.googleSubject !== identity.sub) {
                throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This email is already linked to a different Google account');
            }
            throw new AppError_1.default(http_status_1.default.CONFLICT, 'An account with this email already exists. Please log in with your password, then connect Google from Settings.');
        }
        // 3. Brand-new Google account (2FA stays OFF by default). Google already
        // verified the address, so email OTP is immediately eligible.
        try {
            user = yield user_model_1.User.create({
                name: identity.name || identity.email.split('@')[0],
                email: identity.email,
                image: identity.picture,
                googleSubject: identity.sub,
                emailVerified: true,
            });
        }
        catch (error) {
            // Unique-index race: another request created the account first.
            if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
                user = yield user_model_1.User.findOne({ googleSubject: identity.sub });
                if (!user) {
                    throw new AppError_1.default(http_status_1.default.CONFLICT, 'An account with this email already exists. Please log in with your password, then connect Google from Settings.');
                }
            }
            else {
                throw error;
            }
        }
    }
    if (user.isDeleted) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is deleted!');
    }
    if (user.status === 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is blocked!');
    }
    // Google login must NOT bypass enabled 2FA.
    if (effectiveTwoFactorMethod(user) !== 'none') {
        return twoFactorRequiredResponse(user);
    }
    return Object.assign(Object.assign({}, issueTokens(user)), { result: user });
});
/** Link Google to the caller's existing authenticated account. */
const linkGoogleAccountIntoDB = (userId_1, _a) => __awaiter(void 0, [userId_1, _a], void 0, function* (userId, { idToken, password }) {
    const user = yield user_model_1.User.findById(userId).select('+password');
    if (!user || user.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'This user is not found!');
    }
    if (user.status === 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is blocked!');
    }
    yield assertRecentPasswordAuth(user, password);
    if (user.googleSubject) {
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'A Google account is already connected to this profile');
    }
    let identity;
    try {
        identity = yield (0, googleAuth_1.verifyGoogleIdToken)(idToken);
    }
    catch (_b) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Google authentication failed');
    }
    if (!identity.emailVerified) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Your Google account email is not verified');
    }
    if (identity.email !== user.email.toLowerCase()) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'The Google account email must match your Aura Trip account email');
    }
    const linked = yield user_model_1.User.findOneAndUpdate({ _id: user._id, googleSubject: { $in: [null, undefined] } }, 
    // Google verified the address, so email OTP becomes eligible.
    { $set: { googleSubject: identity.sub, emailVerified: true } }, { new: true });
    if (!linked) {
        // Concurrent link attempt won the race.
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'A Google account is already connected to this profile');
    }
    yield notifySecurity(user.email, {
        subject: 'Google account connected - Aura Trip',
        heading: 'Google Account Connected',
        intro: 'A Google account was connected to your Aura Trip profile.',
        lines: [`Connected Google account: ${maskEmail(identity.email)}`],
        notice: "If this wasn't you, secure your account immediately.",
    });
    return { googleLinked: true };
});
/** Disconnect Google — never allowed if it is the only sign-in method. */
const unlinkGoogleAccountIntoDB = (userId_1, _a) => __awaiter(void 0, [userId_1, _a], void 0, function* (userId, { password }) {
    const user = yield user_model_1.User.findById(userId).select('+password');
    if (!user || user.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'This user is not found!');
    }
    if (user.status === 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is blocked!');
    }
    if (!user.googleSubject) {
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'No Google account is connected to this profile');
    }
    if (!user.password) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Google is your only sign-in method. Set a password before disconnecting.');
    }
    yield assertRecentPasswordAuth(user, password);
    const unlinked = yield user_model_1.User.findOneAndUpdate({ _id: user._id, googleSubject: { $ne: null } }, { $set: { googleSubject: null } }, { new: true });
    if (!unlinked) {
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'No Google account is connected to this profile');
    }
    yield notifySecurity(user.email, {
        subject: 'Google account disconnected - Aura Trip',
        heading: 'Google Account Disconnected',
        intro: 'The Google account connected to your Aura Trip profile was disconnected.',
        lines: [`Disconnected Google account: ${maskEmail(user.email)}`],
        notice: "If this wasn't you, secure your account immediately.",
    });
    return { googleLinked: false };
});
const maskEmail = (email) => {
    const [local, domain] = email.split('@');
    const head = local.slice(0, 2);
    return `${head}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
};
const getTwoFactorStatus = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const user = yield user_model_1.User.findById(userId).select('+twoFactorSecretEncrypted +password');
    if (!user || user.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'This user is not found!');
    }
    const method = effectiveTwoFactorMethod(user);
    yield backfillTwoFactorMethod(user._id, method);
    return {
        // Single active method — never both.
        twoFactorMethod: method,
        twoFactorEnabled: method !== 'none',
        authenticatorActive: method === 'authenticator',
        emailOtpActive: method === 'email',
        googleLinked: !!user.googleSubject,
        hasPassword: !!user.password,
        twoFactorEnabledAt: (_a = user.twoFactorEnabledAt) !== null && _a !== void 0 ? _a : null,
        emailVerified: !!user.emailVerified,
        maskedEmail: maskEmail(user.email),
    };
});
/**
 * Start 2FA enrollment: generate a pending TOTP secret (encrypted at rest).
 * The account is NOT marked enabled until verify-enrollment succeeds.
 */
const enrollTwoFactorIntoDB = (userId_1, _a) => __awaiter(void 0, [userId_1, _a], void 0, function* (userId, { password }) {
    const user = yield user_model_1.User.findById(userId).select('+password +twoFactorSecretEncrypted');
    if (!user || user.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'This user is not found!');
    }
    if (user.status === 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is blocked!');
    }
    // Only one authenticator at a time; switching FROM email OTP is allowed
    // (enrollment completes only after a valid TOTP code is verified).
    if (effectiveTwoFactorMethod(user) === 'authenticator') {
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'Authenticator app 2FA is already enabled');
    }
    yield assertRecentPasswordAuth(user, password);
    const secret = (0, twoFactor_1.generateTotpSecret)();
    const encrypted = (0, twoFactor_1.encryptSecret)(secret);
    const otpauthUrl = (0, twoFactor_1.buildOtpAuthUrl)(user.email, secret);
    const qrCodeDataUrl = yield qrcode_1.default.toDataURL(otpauthUrl);
    const pendingExpiresAt = new Date(Date.now() + PENDING_ENROLLMENT_TTL_MS);
    yield user_model_1.User.updateOne({ _id: user._id }, {
        $set: {
            twoFactorPendingSecretEncrypted: encrypted,
            twoFactorPendingExpiresAt: pendingExpiresAt,
        },
    });
    return {
        secret,
        otpauthUrl,
        qrCodeDataUrl,
        pendingExpiresAt,
    };
});
/** Confirm enrollment with a valid TOTP code; enables 2FA + issues recovery codes. */
const verifyTwoFactorEnrollmentIntoDB = (userId_1, _a) => __awaiter(void 0, [userId_1, _a], void 0, function* (userId, { code }) {
    const user = yield user_model_1.User.findById(userId).select('+twoFactorPendingSecretEncrypted');
    if (!user || user.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'This user is not found!');
    }
    if (effectiveTwoFactorMethod(user) === 'authenticator') {
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'Authenticator app 2FA is already enabled');
    }
    if (!user.twoFactorPendingSecretEncrypted ||
        !user.twoFactorPendingExpiresAt ||
        user.twoFactorPendingExpiresAt.getTime() < Date.now()) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Enrollment session expired. Please start again.');
    }
    const secret = (0, twoFactor_1.decryptSecret)(user.twoFactorPendingSecretEncrypted);
    if (!(yield (0, twoFactor_1.verifyTotpCode)(code, secret))) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid verification code. Please try again.');
    }
    const { codes, records } = (0, twoFactor_1.generateRecoveryCodes)();
    // Atomic switch to the authenticator method: pending secret becomes the
    // active one; any in-flight email-2FA enrollment challenges are dropped so
    // a stale enrollment OTP can never complete afterwards.
    yield user_model_1.User.updateOne({ _id: user._id, twoFactorMethod: { $ne: 'authenticator' } }, {
        $set: {
            twoFactorEnabled: true,
            twoFactorMethod: 'authenticator',
            twoFactorSecretEncrypted: user.twoFactorPendingSecretEncrypted,
            twoFactorEnabledAt: new Date(),
            twoFactorRecoveryCodes: records,
        },
        $unset: {
            twoFactorPendingSecretEncrypted: 1,
            twoFactorPendingExpiresAt: 1,
        },
    });
    yield authChallenge_model_1.AuthChallenge.deleteMany({
        userId: user._id,
        type: 'ENABLE_EMAIL_2FA',
        consumedAt: null,
    });
    yield notifySecurity(user.email, {
        subject: 'Two-factor authentication enabled - Aura Trip',
        heading: 'Two-Factor Authentication Enabled',
        intro: 'Two-factor authentication (2FA) is now active on your Aura Trip account.',
        lines: [
            'You will need your authenticator app (or a recovery code) the next time you sign in.',
            'New recovery codes were generated and shown to you once — store them somewhere safe.',
        ],
        notice: "If you didn't enable 2FA, contact support immediately.",
    });
    return { recoveryCodes: codes };
});
/**
 * Complete a login that reached the 2FA challenge. Consumes the challenge
 * atomically, then verifies TOTP or a recovery code and only then issues
 * the normal session.
 */
const verifyTwoFactorLoginIntoDB = (_a) => __awaiter(void 0, [_a], void 0, function* ({ challengeToken, code, }) {
    // Peek the challenge to learn the user without trusting any client claim.
    const peek = yield authChallenge_model_1.AuthChallenge.findOne({
        tokenHash: (0, twoFactor_1.hashChallengeToken)(challengeToken),
        type: 'LOGIN_2FA',
        consumedAt: null,
        expiresAt: { $gt: new Date() },
    });
    if (!peek) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid or expired verification challenge');
    }
    const user = yield user_model_1.User.findById(peek.userId).select('+twoFactorSecretEncrypted +twoFactorRecoveryCodes');
    if (!user || user.isDeleted || user.status === 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid or expired verification challenge');
    }
    // TOTP/recovery are only the active factor for the authenticator method;
    // an email-method account can never complete login through this endpoint.
    if (effectiveTwoFactorMethod(user) !== 'authenticator') {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid or expired verification challenge');
    }
    // Consume BEFORE verifying so a failed attempt also burns the challenge
    // (prevents parallel brute-force through one challenge).
    yield consumeLogin2FAChallenge(challengeToken, String(user._id));
    const ok = yield verifyActiveTwoFactor(user, code, {
        consumeRecoveryCode: true,
    });
    if (!ok) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid verification code');
    }
    return issueTokens(user);
});
// --- Email OTP (alternative second factor + account-email verification) ----
/** Peek a live LOGIN_2FA challenge without consuming it. */
const peekLogin2FAChallenge = (challengeToken) => __awaiter(void 0, void 0, void 0, function* () {
    const challenge = yield authChallenge_model_1.AuthChallenge.findOne({
        tokenHash: (0, twoFactor_1.hashChallengeToken)(challengeToken),
        type: 'LOGIN_2FA',
        consumedAt: null,
        expiresAt: { $gt: new Date() },
    });
    if (!challenge) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid or expired verification challenge');
    }
    return challenge;
});
const otpCooldownRemainingSeconds = (sentAt) => sentAt
    ? Math.max(0, Math.ceil((sentAt.getTime() + twoFactor_1.EMAIL_OTP_COOLDOWN_MS - Date.now()) / 1000))
    : 0;
const throttleError = (remainingSeconds) => new AppError_1.default(http_status_1.default.TOO_MANY_REQUESTS, remainingSeconds > 0
    ? `Please wait ${remainingSeconds} seconds before requesting another code.`
    : 'Too many verification codes requested. Please try again later.');
/**
 * Atomically reserve one email-OTP send slot for the account inside the
 * rolling window (shared, MongoDB-backed — safe across instances). Pushes
 * the send timestamp only when the account is still under the cap.
 */
const reserveAccountOtpSlot = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const windowStart = new Date(Date.now() - twoFactor_1.EMAIL_OTP_ACCOUNT_WINDOW_MS);
    const inWindow = {
        $filter: {
            input: { $ifNull: ['$emailOtpSendLog', []] },
            cond: { $gte: ['$$this', windowStart] },
        },
    };
    const updated = yield user_model_1.User.findOneAndUpdate({
        _id: userId,
        $expr: {
            $lt: [
                { $size: inWindow },
                twoFactor_1.EMAIL_OTP_MAX_SENDS_PER_ACCOUNT_WINDOW,
            ],
        },
    }, [
        {
            $set: {
                emailOtpSendLog: {
                    $slice: [
                        { $concatArrays: [inWindow, [new Date()]] },
                        twoFactor_1.EMAIL_OTP_MAX_SENDS_PER_ACCOUNT_WINDOW * 4,
                    ],
                },
            },
        },
    ], { new: true }).select('+emailOtpSendLog');
    return !!updated;
});
/**
 * Issue a fresh OTP for a live challenge: replaces any outstanding code
 * (replacement policy), enforces the per-challenge cooldown and send cap,
 * and stores only the keyed hash. Atomic — concurrent sends cannot both
 * pass the cooldown.
 */
const issueChallengeOtp = (challengeId) => __awaiter(void 0, void 0, void 0, function* () {
    const code = (0, twoFactor_1.generateEmailOtp)();
    const now = Date.now();
    const cooldownCutoff = new Date(now - twoFactor_1.EMAIL_OTP_COOLDOWN_MS);
    const updated = yield authChallenge_model_1.AuthChallenge.findOneAndUpdate({
        _id: challengeId,
        consumedAt: null,
        expiresAt: { $gt: new Date() },
        emailOtpSendCount: { $lt: twoFactor_1.EMAIL_OTP_MAX_SENDS_PER_CHALLENGE },
        $or: [
            { emailOtpSentAt: null },
            { emailOtpSentAt: { $lte: cooldownCutoff } },
        ],
    }, {
        $set: {
            emailOtpHash: (0, twoFactor_1.hashEmailOtp)(code),
            emailOtpExpiresAt: new Date(now + twoFactor_1.EMAIL_OTP_TTL_MS),
            emailOtpSentAt: new Date(now),
        },
        $inc: { emailOtpSendCount: 1 },
    }, { new: true });
    if (!updated)
        return null;
    return { code, challengeId: updated._id };
});
/** Issue an OTP against a live LOGIN_2FA challenge identified by its token. */
const issueChallengeOtpByToken = (challengeToken) => __awaiter(void 0, void 0, void 0, function* () {
    const challenge = yield authChallenge_model_1.AuthChallenge.findOne({
        tokenHash: (0, twoFactor_1.hashChallengeToken)(challengeToken),
        type: 'LOGIN_2FA',
        consumedAt: null,
        expiresAt: { $gt: new Date() },
    });
    if (!challenge)
        return null;
    return issueChallengeOtp(challenge._id);
});
/** Delivery failed: invalidate the just-issued code (never received). */
const invalidateIssuedOtp = (challengeId) => __awaiter(void 0, void 0, void 0, function* () {
    yield authChallenge_model_1.AuthChallenge.updateOne({ _id: challengeId }, { $set: { emailOtpHash: null, emailOtpExpiresAt: null } });
});
/** Validate + clear OTP material on an already-consumed challenge doc. */
const checkAndClearConsumedOtp = (consumed, code) => __awaiter(void 0, void 0, void 0, function* () {
    const ok = !!consumed.emailOtpHash &&
        !!consumed.emailOtpExpiresAt &&
        consumed.emailOtpExpiresAt.getTime() > Date.now() &&
        (0, twoFactor_1.verifyEmailOtpHash)(code, consumed.emailOtpHash);
    // Consumed challenges never retain OTP material.
    yield authChallenge_model_1.AuthChallenge.updateOne({ _id: consumed._id }, { $set: { emailOtpHash: null, emailOtpExpiresAt: null } });
    return ok;
});
const otpDeliveryResponse = (maskedEmail) => ({
    maskedEmail,
    cooldownSeconds: Math.ceil(twoFactor_1.EMAIL_OTP_COOLDOWN_MS / 1000),
    expiresInSeconds: Math.ceil(twoFactor_1.EMAIL_OTP_TTL_MS / 1000),
});
/**
 * Safe info for the second-factor screen: the ACTIVE method (from the
 * database only) + masked destination. No secrets; the challenge token
 * itself is the credential.
 */
const getTwoFactorChallengeInfoIntoDB = (challengeToken) => __awaiter(void 0, void 0, void 0, function* () {
    const challenge = yield peekLogin2FAChallenge(challengeToken);
    const user = yield user_model_1.User.findById(challenge.userId);
    if (!user || user.isDeleted || user.status === 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid or expired verification challenge');
    }
    const method = effectiveTwoFactorMethod(user);
    if (method === 'none') {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid or expired verification challenge');
    }
    return {
        method,
        methods: method === 'authenticator' ? ['totp', 'recovery'] : ['email'],
        maskedEmail: maskEmail(user.email),
        emailOtpSent: !!challenge.emailOtpHash,
        expiresInSeconds: Math.max(0, Math.floor((challenge.expiresAt.getTime() - Date.now()) / 1000)),
    };
});
/**
 * Send an email OTP for a live login challenge. The recipient is always
 * resolved from the challenge's server-side user — never from the request
 * body. Replaces any outstanding code for this challenge.
 */
const sendTwoFactorEmailOtpIntoDB = (_a) => __awaiter(void 0, [_a], void 0, function* ({ challengeToken, }) {
    const challenge = yield peekLogin2FAChallenge(challengeToken);
    const user = yield user_model_1.User.findById(challenge.userId).select('+emailOtpSendLog');
    if (!user || user.isDeleted || user.status === 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid or expired verification challenge');
    }
    // The active method comes from the database — never from the client.
    if (effectiveTwoFactorMethod(user) !== 'email') {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Email OTP is not your active two-factor method.');
    }
    if (!user.emailVerified) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Verify your account email before using email codes as a second factor.');
    }
    if (!(yield reserveAccountOtpSlot(user._id))) {
        throw throttleError(otpCooldownRemainingSeconds(null));
    }
    const issued = yield issueChallengeOtp(challenge._id);
    if (!issued) {
        const fresh = yield authChallenge_model_1.AuthChallenge.findById(challenge._id);
        throw throttleError(otpCooldownRemainingSeconds(fresh === null || fresh === void 0 ? void 0 : fresh.emailOtpSentAt));
    }
    try {
        yield (0, sendEmail_1.sendTwoFactorEmailOtp)(user.email, issued.code);
    }
    catch (error) {
        // Never mark delivery successful on provider failure; never leak the
        // provider error. Diagnostics (safe fields only) go to the server log.
        yield failEmailDelivery('login-otp', issued.challengeId, error);
    }
    return otpDeliveryResponse(maskEmail(user.email));
});
/**
 * Verify an email OTP for a login challenge. The challenge is consumed
 * atomically BEFORE the comparison (same policy as TOTP: any failed attempt
 * burns the challenge), so success can never be replayed into a second
 * session and pending methods are invalidated together.
 */
const verifyTwoFactorLoginEmailIntoDB = (_a) => __awaiter(void 0, [_a], void 0, function* ({ challengeToken, code, }) {
    const challenge = yield peekLogin2FAChallenge(challengeToken);
    const user = yield user_model_1.User.findById(challenge.userId);
    if (!user || user.isDeleted || user.status === 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid or expired verification challenge');
    }
    // Only the email method accepts an email OTP — purpose + method binding.
    if (effectiveTwoFactorMethod(user) !== 'email' || !user.emailVerified) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid or expired verification challenge');
    }
    const consumed = yield authChallenge_model_1.AuthChallenge.findOneAndUpdate({
        _id: challenge._id,
        consumedAt: null,
        expiresAt: { $gt: new Date() },
    }, { $set: { consumedAt: new Date() } }, { new: true });
    if (!consumed) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid or expired verification challenge');
    }
    const ok = yield checkAndClearConsumedOtp(consumed, code);
    if (!ok) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid verification code');
    }
    return issueTokens(user);
});
/** Find or create the live EMAIL_VERIFY challenge for an authenticated user. */
const findOrCreateEmailVerifyChallenge = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield authChallenge_model_1.AuthChallenge.findOne({
        userId,
        type: 'EMAIL_VERIFY',
        consumedAt: null,
        expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
    if (existing)
        return existing;
    // Random tokenHash — this challenge token is never handed to a client;
    // the document exists only as scoped OTP state for the authenticated user.
    return authChallenge_model_1.AuthChallenge.create({
        userId,
        type: 'EMAIL_VERIFY',
        tokenHash: (0, twoFactor_1.hashChallengeToken)((0, twoFactor_1.generateChallengeToken)()),
        expiresAt: new Date(Date.now() + LOGIN_2FA_CHALLENGE_TTL_MS),
    });
});
/**
 * Settings flow: send an OTP to confirm the account email is under the
 * user's control. Required before email OTP can act as a login factor.
 */
const sendEmailVerificationOtpIntoDB = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findById(userId).select('+emailOtpSendLog');
    if (!user || user.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'This user is not found!');
    }
    if (user.status === 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is blocked!');
    }
    if (user.emailVerified) {
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'Your account email is already verified.');
    }
    const challenge = yield findOrCreateEmailVerifyChallenge(user._id);
    if (!(yield reserveAccountOtpSlot(user._id))) {
        throw throttleError(otpCooldownRemainingSeconds(null));
    }
    const issued = yield issueChallengeOtp(challenge._id);
    if (!issued) {
        const fresh = yield authChallenge_model_1.AuthChallenge.findById(challenge._id);
        throw throttleError(otpCooldownRemainingSeconds(fresh === null || fresh === void 0 ? void 0 : fresh.emailOtpSentAt));
    }
    try {
        yield (0, sendEmail_1.sendTwoFactorEmailOtp)(user.email, issued.code);
    }
    catch (error) {
        yield failEmailDelivery('email-verify', issued.challengeId, error);
    }
    return otpDeliveryResponse(maskEmail(user.email));
});
/** Settings flow: verify the emailed code and mark the account email verified. */
const verifyEmailOwnershipIntoDB = (userId_1, _a) => __awaiter(void 0, [userId_1, _a], void 0, function* (userId, { code }) {
    const user = yield user_model_1.User.findById(userId);
    if (!user || user.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'This user is not found!');
    }
    if (user.status === 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is blocked!');
    }
    if (user.emailVerified) {
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'Your account email is already verified.');
    }
    const challenge = yield authChallenge_model_1.AuthChallenge.findOne({
        userId,
        type: 'EMAIL_VERIFY',
        consumedAt: null,
        expiresAt: { $gt: new Date() },
    });
    if (!challenge) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid or expired verification code');
    }
    const consumed = yield authChallenge_model_1.AuthChallenge.findOneAndUpdate({ _id: challenge._id, consumedAt: null, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { new: true });
    if (!consumed) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid or expired verification code');
    }
    const ok = yield checkAndClearConsumedOtp(consumed, code);
    if (!ok) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid verification code');
    }
    yield user_model_1.User.updateOne({ _id: user._id }, { $set: { emailVerified: true } });
    yield notifySecurity(user.email, {
        subject: 'Account email verified - Aura Trip',
        heading: 'Account Email Verified',
        intro: 'The email address on your Aura Trip account was verified.',
        lines: [
            'Email codes can now be used as a second factor when you sign in.',
        ],
        notice: "If this wasn't you, secure your account immediately.",
    });
    return { emailVerified: true };
});
/** Find or create the live ENABLE_EMAIL_2FA challenge for an authenticated user. */
const findOrCreateEnableEmailChallenge = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield authChallenge_model_1.AuthChallenge.findOne({
        userId,
        type: 'ENABLE_EMAIL_2FA',
        consumedAt: null,
        expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
    if (existing)
        return existing;
    return authChallenge_model_1.AuthChallenge.create({
        userId,
        type: 'ENABLE_EMAIL_2FA',
        tokenHash: (0, twoFactor_1.hashChallengeToken)((0, twoFactor_1.generateChallengeToken)()),
        expiresAt: new Date(Date.now() + LOGIN_2FA_CHALLENGE_TTL_MS),
    });
});
/**
 * Enrollment step 1 (Settings): send a short-lived OTP to the account email
 * to prove control before switching 2FA to the email method. The method is
 * NOT switched here — only on successful verification.
 */
const enableEmailOtpIntoDB = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findById(userId).select('+emailOtpSendLog');
    if (!user || user.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'This user is not found!');
    }
    if (user.status === 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is blocked!');
    }
    if (effectiveTwoFactorMethod(user) === 'email') {
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'Email OTP is already enabled for your account.');
    }
    if (!user.emailVerified) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Verify your account email before enabling email codes as a second factor.');
    }
    const challenge = yield findOrCreateEnableEmailChallenge(user._id);
    if (!(yield reserveAccountOtpSlot(user._id))) {
        throw throttleError(otpCooldownRemainingSeconds(null));
    }
    const issued = yield issueChallengeOtp(challenge._id);
    if (!issued) {
        const fresh = yield authChallenge_model_1.AuthChallenge.findById(challenge._id);
        throw throttleError(otpCooldownRemainingSeconds(fresh === null || fresh === void 0 ? void 0 : fresh.emailOtpSentAt));
    }
    try {
        yield (0, sendEmail_1.sendTwoFactorEmailOtp)(user.email, issued.code);
    }
    catch (error) {
        yield failEmailDelivery('enable-email-2fa', issued.challengeId, error);
    }
    return otpDeliveryResponse(maskEmail(user.email));
});
/**
 * Enrollment step 2 (Settings): verify the emailed code and atomically
 * switch the single active method to email OTP. Clears authenticator
 * material (secret + recovery codes) so only one method is ever active.
 */
const verifyEnableEmailOtpIntoDB = (userId_1, _a) => __awaiter(void 0, [userId_1, _a], void 0, function* (userId, { code }) {
    const user = yield user_model_1.User.findById(userId).select('+twoFactorSecretEncrypted +twoFactorRecoveryCodes');
    if (!user || user.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'This user is not found!');
    }
    if (user.status === 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is blocked!');
    }
    if (effectiveTwoFactorMethod(user) === 'email') {
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'Email OTP is already enabled for your account.');
    }
    if (!user.emailVerified) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Verify your account email before enabling email codes as a second factor.');
    }
    const challenge = yield authChallenge_model_1.AuthChallenge.findOne({
        userId: user._id,
        type: 'ENABLE_EMAIL_2FA',
        consumedAt: null,
        expiresAt: { $gt: new Date() },
    });
    if (!challenge) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid or expired verification code');
    }
    const consumed = yield authChallenge_model_1.AuthChallenge.findOneAndUpdate({ _id: challenge._id, consumedAt: null, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { new: true });
    if (!consumed) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid or expired verification code');
    }
    const ok = yield checkAndClearConsumedOtp(consumed, code);
    if (!ok) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid verification code');
    }
    // Atomic method switch. A failed attempt never touches the user doc, so
    // an already-active authenticator method is never disabled by a bad OTP.
    const updated = yield user_model_1.User.findOneAndUpdate({
        _id: user._id,
        emailVerified: true,
        $or: [
            { twoFactorMethod: { $ne: 'email' } },
            { twoFactorMethod: { $exists: false } },
        ],
    }, {
        $set: {
            twoFactorEnabled: true,
            twoFactorMethod: 'email',
            twoFactorEnabledAt: new Date(),
            twoFactorRecoveryCodes: [],
        },
        $unset: {
            twoFactorSecretEncrypted: 1,
            twoFactorPendingSecretEncrypted: 1,
            twoFactorPendingExpiresAt: 1,
        },
    }, { new: true });
    if (!updated) {
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'Email OTP is already enabled for your account.');
    }
    yield authChallenge_model_1.AuthChallenge.deleteMany({
        userId: user._id,
        type: 'ENABLE_EMAIL_2FA',
        consumedAt: null,
    });
    yield notifySecurity(user.email, {
        subject: 'Email OTP enabled - Aura Trip',
        heading: 'Email OTP Enabled',
        intro: 'Email codes are now your second factor when you sign in.',
        lines: [
            'Authenticator-app codes and recovery codes are no longer accepted at sign-in.',
            'Each sign-in sends a fresh 6-digit code to your account email.',
        ],
        notice: "If this wasn't you, secure your account immediately.",
    });
    return { twoFactorMethod: 'email', twoFactorEnabled: true };
});
/**
 * Disable 2FA. The authenticator method requires the active factor (or a
 * recovery code) as proof; the email method requires only recent password
 * re-authentication (the account email already gates delivery of login
 * codes). The active method always comes from the database.
 */
const disableTwoFactorIntoDB = (userId_1, _a) => __awaiter(void 0, [userId_1, _a], void 0, function* (userId, { password, code }) {
    const user = yield user_model_1.User.findById(userId).select('+password +twoFactorSecretEncrypted +twoFactorRecoveryCodes');
    if (!user || user.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'This user is not found!');
    }
    if (user.status === 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is blocked!');
    }
    const method = effectiveTwoFactorMethod(user);
    if (method === 'none') {
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'Two-factor authentication is not enabled');
    }
    yield assertRecentPasswordAuth(user, password);
    if (method === 'authenticator') {
        if (!code) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Enter your authenticator code or a recovery code to disable 2FA.');
        }
        const ok = yield verifyActiveTwoFactor(user, code, {
            consumeRecoveryCode: true,
        });
        if (!ok) {
            throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid verification code');
        }
    }
    // method === 'email': password re-authentication above is the proof.
    yield user_model_1.User.updateOne({
        _id: user._id,
        $or: [
            { twoFactorMethod: { $in: ['authenticator', 'email'] } },
            { twoFactorMethod: { $exists: false }, twoFactorEnabled: true },
        ],
    }, {
        $set: {
            twoFactorEnabled: false,
            twoFactorMethod: 'none',
            twoFactorEnabledAt: null,
            twoFactorRecoveryCodes: [],
        },
        $unset: {
            twoFactorSecretEncrypted: 1,
            twoFactorPendingSecretEncrypted: 1,
            twoFactorPendingExpiresAt: 1,
        },
    });
    yield authChallenge_model_1.AuthChallenge.deleteMany({
        userId: user._id,
        type: 'ENABLE_EMAIL_2FA',
        consumedAt: null,
    });
    yield notifySecurity(user.email, {
        subject: 'Two-factor authentication disabled - Aura Trip',
        heading: 'Two-Factor Authentication Disabled',
        intro: 'Two-factor authentication was disabled on your Aura Trip account.',
        lines: ['Your account now uses password-only sign-in.'],
        notice: "If this wasn't you, secure your account immediately.",
    });
    return { twoFactorEnabled: false, twoFactorMethod: 'none' };
});
/** Regenerate recovery codes — authenticator method only; invalidates every previous code. */
const regenerateRecoveryCodesIntoDB = (userId_1, _a) => __awaiter(void 0, [userId_1, _a], void 0, function* (userId, { password, code }) {
    const user = yield user_model_1.User.findById(userId).select('+password +twoFactorSecretEncrypted +twoFactorRecoveryCodes');
    if (!user || user.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'This user is not found!');
    }
    if (user.status === 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is blocked!');
    }
    if (effectiveTwoFactorMethod(user) !== 'authenticator') {
        throw new AppError_1.default(http_status_1.default.CONFLICT, 'Recovery codes are only available for authenticator-app two-factor authentication.');
    }
    yield assertRecentPasswordAuth(user, password);
    const ok = yield verifyActiveTwoFactor(user, code, {
        consumeRecoveryCode: true,
    });
    if (!ok) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid verification code');
    }
    const { codes, records } = (0, twoFactor_1.generateRecoveryCodes)();
    yield user_model_1.User.updateOne({ _id: user._id }, { $set: { twoFactorRecoveryCodes: records } });
    yield notifySecurity(user.email, {
        subject: 'Recovery codes regenerated - Aura Trip',
        heading: 'New Recovery Codes Generated',
        intro: 'New two-factor recovery codes were generated for your Aura Trip account.',
        lines: [
            'All previous recovery codes no longer work.',
            'The new codes were shown to you once — store them somewhere safe.',
        ],
        notice: "If this wasn't you, secure your account immediately.",
    });
    return { recoveryCodes: codes };
});
const resetLinkIntoDB = (_a) => __awaiter(void 0, [_a], void 0, function* ({ email }) {
    const user = yield user_model_1.User.findOne({ email: email });
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'This user is not found!');
    }
    if (user.isDeleted === true) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is deleted!');
    }
    if (user.status == 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is blocked!');
    }
    const jwtPayload = {
        id: user._id,
        email: user.email,
        role: user.role,
    };
    const resetToken = (0, tokenGenerateFunction_1.createToken)(jwtPayload, config_1.default.jwt_access_secret, '10m');
    const resetLink = `${config_1.default.reset_link_url}?email=${user.email}&token=${resetToken}`;
    // Send email to the user with the reset link
    yield (0, sendEmail_1.sendEmail)(user.email, resetLink);
});
const forgetPasswordIntoDB = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findOne({ email: payload === null || payload === void 0 ? void 0 : payload.email });
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'This user is not found!');
    }
    if (user.isDeleted === true) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is deleted!');
    }
    if (user.status == 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is blocked!');
    }
    // Check if token is valid
    const decoded = jsonwebtoken_1.default.verify(payload.token, config_1.default.jwt_access_secret);
    if (payload.email !== decoded.email) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is forbidden!');
    }
    const newHashPassword = yield bcrypt_1.default.hash(payload.newPassword, Number(config_1.default.bcrypt_salt_rounds));
    const result = yield user_model_1.User.findOneAndUpdate({ _id: decoded.id, role: decoded.role }, {
        password: newHashPassword,
    }, { new: true });
    return result;
});
const changePasswordIntoDB = (payload, token) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findOne({ email: payload === null || payload === void 0 ? void 0 : payload.email });
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'This user is not found!');
    }
    if (user.isDeleted === true) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is deleted!');
    }
    if (user.status == 'BLOCKED') {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is blocked!');
    }
    // Check if token is valid
    const decoded = jsonwebtoken_1.default.verify(token, config_1.default.jwt_access_secret);
    if (payload.email !== decoded.email) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'This user is forbidden!');
    }
    const newHashPassword = yield bcrypt_1.default.hash(payload.newPassword, Number(config_1.default.bcrypt_salt_rounds));
    const result = yield user_model_1.User.findOneAndUpdate({ _id: decoded.id, role: decoded.role }, {
        password: newHashPassword,
    }, { new: true });
    return result;
});
exports.UserServices = {
    registerUserIntoDB,
    loginUserFromDB,
    resetLinkIntoDB,
    forgetPasswordIntoDB,
    changePasswordIntoDB,
    googleAuthIntoDB,
    linkGoogleAccountIntoDB,
    unlinkGoogleAccountIntoDB,
    getTwoFactorStatus,
    enrollTwoFactorIntoDB,
    verifyTwoFactorEnrollmentIntoDB,
    verifyTwoFactorLoginIntoDB,
    getTwoFactorChallengeInfoIntoDB,
    sendTwoFactorEmailOtpIntoDB,
    verifyTwoFactorLoginEmailIntoDB,
    sendEmailVerificationOtpIntoDB,
    verifyEmailOwnershipIntoDB,
    enableEmailOtpIntoDB,
    verifyEnableEmailOtpIntoDB,
    disableTwoFactorIntoDB,
    regenerateRecoveryCodesIntoDB,
    migrateLegacyTwoFactorMethods,
};
