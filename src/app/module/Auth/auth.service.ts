/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import httpStatus from 'http-status';
import QRCode from 'qrcode';
import config from '../../../config';
import AppError from '../../errors/AppError';
import { createToken } from '../../utils/tokenGenerateFunction';
import { TLoginUser, TRegister } from './auth.interface';
import { User } from '../User/user.model';
import { AuthChallenge } from './authChallenge.model';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { sendEmail, sendSecurityEmail, sendTwoFactorEmailOtp } from '../../utils/sendEmail';
import { verifyGoogleIdToken } from '../../utils/googleAuth';
import {
  EMAIL_OTP_ACCOUNT_WINDOW_MS,
  EMAIL_OTP_COOLDOWN_MS,
  EMAIL_OTP_MAX_SENDS_PER_ACCOUNT_WINDOW,
  EMAIL_OTP_MAX_SENDS_PER_CHALLENGE,
  EMAIL_OTP_TTL_MS,
  buildOtpAuthUrl,
  decryptSecret,
  encryptSecret,
  generateChallengeToken,
  generateEmailOtp,
  generateRecoveryCodes,
  generateTotpSecret,
  hashChallengeToken,
  hashEmailOtp,
  hashRecoveryCode,
  verifyEmailOtpHash,
  verifyTotpCode,
} from '../../utils/twoFactor';

const LOGIN_2FA_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PENDING_ENROLLMENT_TTL_MS = 15 * 60 * 1000; // 15 minutes

type TJwtPayload = { id: string; email: string; role: string };

const issueTokens = (user: { _id: unknown; email: string; role: string }) => {
  const jwtPayload: TJwtPayload = {
    id: String(user._id),
    email: user.email,
    role: user.role,
  };

  const accessToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    config.jwt_access_expires_in as string
  );

  const refreshToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    config.jwt_refresh_expires_in as string
  );

  return { accessToken, refreshToken };
};

// --- Single active 2FA method ------------------------------------------------

export type TTwoFactorMethodValue = 'none' | 'authenticator' | 'email';

/**
 * The active second factor, derived from the database only. Legacy documents
 * (created before `twoFactorMethod` existed) are interpreted from
 * `twoFactorEnabled`: enabled ⇒ authenticator, disabled ⇒ none. Never trust
 * a method supplied by the client.
 */
const effectiveTwoFactorMethod = (
  user: { twoFactorMethod?: string; twoFactorEnabled?: boolean }
): TTwoFactorMethodValue => {
  if (
    user.twoFactorMethod === 'authenticator' ||
    user.twoFactorMethod === 'email'
  ) {
    return user.twoFactorMethod;
  }
  if (user.twoFactorMethod === 'none') return 'none';
  return user.twoFactorEnabled ? 'authenticator' : 'none';
};

/** Lazily persist the derived method for legacy documents. */
const backfillTwoFactorMethod = async (
  userId: unknown,
  method: TTwoFactorMethodValue
) => {
  await User.updateOne(
    { _id: userId, twoFactorMethod: { $exists: false } },
    { $set: { twoFactorMethod: method } }
  );
};

/**
 * One-shot boot migration: legacy accounts with 2FA enabled become
 * 'authenticator' (their enrolled TOTP secret is preserved — security is
 * never silently weakened); everything else becomes 'none'. Idempotent.
 */
const migrateLegacyTwoFactorMethods = async () => {
  await User.updateMany(
    { twoFactorMethod: { $exists: false }, twoFactorEnabled: true },
    { $set: { twoFactorMethod: 'authenticator' } }
  );
  await User.updateMany(
    { twoFactorMethod: { $exists: false } },
    { $set: { twoFactorMethod: 'none' } }
  );
};

/**
 * Server-side diagnostic for email delivery failures. Logs ONLY safe
 * fields (SMTP response code / error code / command) — never credentials,
 * recipients, or OTP contents.
 */
const logEmailDeliveryFailure = (scope: string, error: unknown) => {
  const e = error as {
    code?: string;
    responseCode?: string;
    command?: string;
    name?: string;
  };
  // eslint-disable-next-line no-console
  console.error(`[email] delivery failed (${scope})`, {
    code: e?.code,
    responseCode: e?.responseCode,
    command: e?.command,
    name: e?.name,
  });
};

const isEmailConfigured = (): boolean =>
  !!process.env.EMAIL_USER && !!process.env.EMAIL_PASS;

/** Shared email-failure handling: invalidate the issued code, log, throw. */
const failEmailDelivery = async (
  scope: string,
  challengeId: unknown,
  error: unknown
): Promise<never> => {
  await invalidateIssuedOtp(challengeId);

  if (!isEmailConfigured()) {
    // Root-cause signal for operators: SMTP credentials are missing/empty.
    // eslint-disable-next-line no-console
    console.error(
      `[email] ${scope}: SMTP is not configured — set EMAIL_USER and EMAIL_PASS`
    );
  } else {
    logEmailDeliveryFailure(scope, error);
  }

  throw new AppError(
    isEmailConfigured()
      ? httpStatus.BAD_GATEWAY
      : httpStatus.SERVICE_UNAVAILABLE,
    'We could not send the verification email. Please try again.'
  );
};

/** Create a short-lived, single-purpose 2FA login challenge (no session yet). */
const createLogin2FAChallenge = async (userId: unknown): Promise<string> => {
  const token = generateChallengeToken();
  await AuthChallenge.create({
    userId,
    type: 'LOGIN_2FA',
    tokenHash: hashChallengeToken(token),
    expiresAt: new Date(Date.now() + LOGIN_2FA_CHALLENGE_TTL_MS),
  });
  return token;
};

/**
 * Build the "second factor required" response for a login. The active
 * method comes from the database only. For the email method a login OTP is
 * sent right away (delivery failure degrades to `otpSent: false` so the
 * user can retry from the verification screen — the challenge stays valid).
 */
const twoFactorRequiredResponse = async (user: {
  _id: unknown;
  email: string;
  emailVerified?: boolean;
  twoFactorMethod?: string;
  twoFactorEnabled?: boolean;
}) => {
  const method = effectiveTwoFactorMethod(user);
  if (method === 'none') {
    // Caller should have issued tokens; treat as no-2FA.
    return issueTokens(user as any);
  }

  await backfillTwoFactorMethod(user._id, method);

  const challengeToken = await createLogin2FAChallenge(user._id);
  const base = {
    twoFactorRequired: true as const,
    challengeToken,
    method,
    maskedEmail: maskEmail(user.email),
  };

  if (method === 'authenticator') {
    // Recovery codes remain an authenticator-method fallback.
    return { ...base, methods: ['totp', 'recovery'] };
  }

  // method === 'email' — send the login OTP now.
  let otpSent = false;

  if (user.emailVerified) {
    try {
      const issued = await issueChallengeOtpByToken(challengeToken);

      if (issued) {
        try {
          await sendTwoFactorEmailOtp(user.email, issued.code);
          otpSent = true;
        } catch (error) {
          await failEmailDelivery('login-otp', issued.challengeId, error);
        }
      }
    } catch (error) {
      // Cooldown/cap/unconfigured — login still proceeds to the challenge
      // screen; the user can resend. Never fail primary auth on delivery.
      if (error instanceof AppError) {
        otpSent = false;
      } else {
        logEmailDeliveryFailure('login-otp', error);
        otpSent = false;
      }
    }
  }

  return { ...base, methods: ['email'], otpSent };
};

/**
 * Atomically consume a 2FA challenge so it can never be replayed, even
 * under concurrent requests.
 */
const consumeLogin2FAChallenge = async (
  challengeToken: string,
  userId: string
) => {
  const challenge = await AuthChallenge.findOneAndUpdate(
    {
      tokenHash: hashChallengeToken(challengeToken),
      type: 'LOGIN_2FA',
      userId,
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { consumedAt: new Date() } },
    { new: true }
  );

  if (!challenge) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired verification challenge'
    );
  }
};

/**
 * Recent re-authentication guard for sensitive account-security actions.
 * Users with a password must re-enter it; passwordless (Google-only)
 * accounts rely on the authenticated session.
 */
const assertRecentPasswordAuth = async (
  user: any,
  password?: string
): Promise<void> => {
  if (!user.password) return; // Google-only account: session is the credential
  if (!password) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Password confirmation is required'
    );
  }
  const matches = await User.isPasswordMatched(password, user.password);
  if (!matches) {
    throw new AppError(httpStatus.FORBIDDEN, 'Password do not matched');
  }
};

/** Verify a TOTP code or a single-use recovery code against the active 2FA factor. */
const verifyActiveTwoFactor = async (
  user: any,
  code: string,
  { consumeRecoveryCode }: { consumeRecoveryCode: boolean }
): Promise<boolean> => {
  if (!user.twoFactorSecretEncrypted) return false;
  const secret = decryptSecret(user.twoFactorSecretEncrypted);
  if (await verifyTotpCode(code, secret)) return true;

  if (!consumeRecoveryCode) return false;

  const codeHash = hashRecoveryCode(code);
  const used = await User.findOneAndUpdate(
    {
      _id: user._id,
      twoFactorRecoveryCodes: {
        $elemMatch: { hash: codeHash, used: false },
      },
    },
    {
      $set: {
        'twoFactorRecoveryCodes.$.used': true,
        'twoFactorRecoveryCodes.$.usedAt': new Date(),
      },
    },
    { new: true }
  ).select('+twoFactorRecoveryCodes');
  return !!used;
};

const notifySecurity = async (
  to: string,
  input: Omit<Parameters<typeof sendSecurityEmail>[0], 'to'>
) => {
  try {
    await sendSecurityEmail({ to, ...input });
  } catch {
    // Never block the security action on email delivery; never log content.
    // eslint-disable-next-line no-console
    console.error('Security notification email could not be delivered');
  }
};

const registerUserIntoDB = async (payload: TRegister) => {
  const user = await User.findOne({ email: payload.email });

  if (!user) {
    const result = await User.create(payload);

    const jwtPayload = {
      id: result._id,
      email: payload.email,
      role: 'USER',
    };

    const accessToken = createToken(
      jwtPayload,
      config.jwt_access_secret as string,
      config.jwt_access_expires_in as string
    );

    const refreshToken = createToken(
      jwtPayload,
      config.jwt_access_secret as string,
      config.jwt_refresh_expires_in as string
    );

    return {
      result,
      accessToken: accessToken,
      refreshToken: refreshToken,
    };
  }
};

const loginUserFromDB = async (payload: Partial<TLoginUser>) => {
  // password has `select: false`; login is the one flow that must compare it.
  const user = await User.findOne({ email: payload.email }).select(
    '+password'
  );

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const userStatus = user?.status;

  if (userStatus === 'BLOCKED') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked!');
  }

  //checking if the password is correct
  const passwordMatches =
    !!user.password &&
    (await User.isPasswordMatched(payload.password!, user.password));

  if (!passwordMatches)
    throw new AppError(httpStatus.FORBIDDEN, 'Password do not matched');

  // 2FA gate: no full session until the second factor is verified. The
  // active method lives only in the database — never trust the client.
  if (effectiveTwoFactorMethod(user) !== 'none') {
    return twoFactorRequiredResponse(user);
  }

  return issueTokens(user);
};

/**
 * Google sign-in / sign-up. The id_token is verified server-side (signature,
 * issuer, audience, expiry). A matching existing password account is NEVER
 * auto-linked — linking requires an authenticated session (POST /auth/google/link).
 */
const googleAuthIntoDB = async ({ idToken }: { idToken: string }) => {
  let identity;
  try {
    identity = await verifyGoogleIdToken(idToken);
  } catch {
    // Invalid signature / expired / wrong audience — generic message only.
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Google authentication failed'
    );
  }

  if (!identity.emailVerified) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Your Google account email is not verified'
    );
  }

  // 1. Already linked to this Google subject?
  let user = await User.findOne({ googleSubject: identity.sub });

  if (!user) {
    // 2. Email collision handling — never take over an existing account.
    const existing = await User.findOne({ email: identity.email });

    if (existing) {
      if (existing.googleSubject && existing.googleSubject !== identity.sub) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          'This email is already linked to a different Google account'
        );
      }
      throw new AppError(
        httpStatus.CONFLICT,
        'An account with this email already exists. Please log in with your password, then connect Google from Settings.'
      );
    }

    // 3. Brand-new Google account (2FA stays OFF by default). Google already
    // verified the address, so email OTP is immediately eligible.
    try {
      user = await User.create({
        name: identity.name || identity.email.split('@')[0],
        email: identity.email,
        image: identity.picture,
        googleSubject: identity.sub,
        emailVerified: true,
      });
    } catch (error: any) {
      // Unique-index race: another request created the account first.
      if (error?.code === 11000) {
        user = await User.findOne({ googleSubject: identity.sub });
        if (!user) {
          throw new AppError(
            httpStatus.CONFLICT,
            'An account with this email already exists. Please log in with your password, then connect Google from Settings.'
          );
        }
      } else {
        throw error;
      }
    }
  }

  if (user.isDeleted) {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is deleted!');
  }
  if (user.status === 'BLOCKED') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked!');
  }

  // Google login must NOT bypass enabled 2FA.
  if (effectiveTwoFactorMethod(user) !== 'none') {
    return twoFactorRequiredResponse(user);
  }

  return { ...issueTokens(user), result: user };
};

/** Link Google to the caller's existing authenticated account. */
const linkGoogleAccountIntoDB = async (
  userId: string,
  { idToken, password }: { idToken: string; password?: string }
) => {
  const user = await User.findById(userId).select('+password');
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found!');
  }
  if (user.status === 'BLOCKED') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked!');
  }

  await assertRecentPasswordAuth(user, password);

  if (user.googleSubject) {
    throw new AppError(
      httpStatus.CONFLICT,
      'A Google account is already connected to this profile'
    );
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(idToken);
  } catch {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Google authentication failed'
    );
  }
  if (!identity.emailVerified) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Your Google account email is not verified'
    );
  }
  if (identity.email !== user.email.toLowerCase()) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'The Google account email must match your Aura Trip account email'
    );
  }

  const linked = await User.findOneAndUpdate(
    { _id: user._id, googleSubject: { $in: [null, undefined] } },
    // Google verified the address, so email OTP becomes eligible.
    { $set: { googleSubject: identity.sub, emailVerified: true } },
    { new: true }
  );
  if (!linked) {
    // Concurrent link attempt won the race.
    throw new AppError(
      httpStatus.CONFLICT,
      'A Google account is already connected to this profile'
    );
  }

  await notifySecurity(user.email, {
    subject: 'Google account connected - Aura Trip',
    heading: 'Google Account Connected',
    intro: 'A Google account was connected to your Aura Trip profile.',
    lines: [`Connected Google account: ${maskEmail(identity.email)}`],
    notice: "If this wasn't you, secure your account immediately.",
  });

  return { googleLinked: true };
};

/** Disconnect Google — never allowed if it is the only sign-in method. */
const unlinkGoogleAccountIntoDB = async (
  userId: string,
  { password }: { password?: string }
) => {
  const user = await User.findById(userId).select('+password');
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found!');
  }
  if (user.status === 'BLOCKED') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked!');
  }

  if (!user.googleSubject) {
    throw new AppError(
      httpStatus.CONFLICT,
      'No Google account is connected to this profile'
    );
  }
  if (!user.password) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Google is your only sign-in method. Set a password before disconnecting.'
    );
  }

  await assertRecentPasswordAuth(user, password);

  const unlinked = await User.findOneAndUpdate(
    { _id: user._id, googleSubject: { $ne: null } },
    { $set: { googleSubject: null } },
    { new: true }
  );
  if (!unlinked) {
    throw new AppError(
      httpStatus.CONFLICT,
      'No Google account is connected to this profile'
    );
  }

  await notifySecurity(user.email, {
    subject: 'Google account disconnected - Aura Trip',
    heading: 'Google Account Disconnected',
    intro: 'The Google account connected to your Aura Trip profile was disconnected.',
    lines: [`Disconnected Google account: ${maskEmail(user.email)}`],
    notice: "If this wasn't you, secure your account immediately.",
  });

  return { googleLinked: false };
};

const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
};

const getTwoFactorStatus = async (userId: string) => {
  const user = await User.findById(userId).select(
    '+twoFactorSecretEncrypted +password'
  );
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found!');
  }
  const method = effectiveTwoFactorMethod(user);
  await backfillTwoFactorMethod(user._id, method);
  return {
    // Single active method — never both.
    twoFactorMethod: method,
    twoFactorEnabled: method !== 'none',
    authenticatorActive: method === 'authenticator',
    emailOtpActive: method === 'email',
    googleLinked: !!user.googleSubject,
    hasPassword: !!user.password,
    twoFactorEnabledAt: user.twoFactorEnabledAt ?? null,
    emailVerified: !!user.emailVerified,
    maskedEmail: maskEmail(user.email),
  };
};

/**
 * Start 2FA enrollment: generate a pending TOTP secret (encrypted at rest).
 * The account is NOT marked enabled until verify-enrollment succeeds.
 */
const enrollTwoFactorIntoDB = async (
  userId: string,
  { password }: { password?: string }
) => {
  const user = await User.findById(userId).select(
    '+password +twoFactorSecretEncrypted'
  );
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found!');
  }
  if (user.status === 'BLOCKED') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked!');
  }
  // Only one authenticator at a time; switching FROM email OTP is allowed
  // (enrollment completes only after a valid TOTP code is verified).
  if (effectiveTwoFactorMethod(user) === 'authenticator') {
    throw new AppError(
      httpStatus.CONFLICT,
      'Authenticator app 2FA is already enabled'
    );
  }

  await assertRecentPasswordAuth(user, password);

  const secret = generateTotpSecret();
  const encrypted = encryptSecret(secret);
  const otpauthUrl = buildOtpAuthUrl(user.email, secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
  const pendingExpiresAt = new Date(Date.now() + PENDING_ENROLLMENT_TTL_MS);

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        twoFactorPendingSecretEncrypted: encrypted,
        twoFactorPendingExpiresAt: pendingExpiresAt,
      },
    }
  );

  return {
    secret,
    otpauthUrl,
    qrCodeDataUrl,
    pendingExpiresAt,
  };
};

/** Confirm enrollment with a valid TOTP code; enables 2FA + issues recovery codes. */
const verifyTwoFactorEnrollmentIntoDB = async (
  userId: string,
  { code }: { code: string }
) => {
  const user = await User.findById(userId).select(
    '+twoFactorPendingSecretEncrypted'
  );
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found!');
  }
  if (effectiveTwoFactorMethod(user) === 'authenticator') {
    throw new AppError(
      httpStatus.CONFLICT,
      'Authenticator app 2FA is already enabled'
    );
  }
  if (
    !user.twoFactorPendingSecretEncrypted ||
    !user.twoFactorPendingExpiresAt ||
    user.twoFactorPendingExpiresAt.getTime() < Date.now()
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Enrollment session expired. Please start again.'
    );
  }

  const secret = decryptSecret(user.twoFactorPendingSecretEncrypted);
  if (!(await verifyTotpCode(code, secret))) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid verification code. Please try again.'
    );
  }

  const { codes, records } = generateRecoveryCodes();

  // Atomic switch to the authenticator method: pending secret becomes the
  // active one; any in-flight email-2FA enrollment challenges are dropped so
  // a stale enrollment OTP can never complete afterwards.
  await User.updateOne(
    { _id: user._id, twoFactorMethod: { $ne: 'authenticator' } },
    {
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
    }
  );
  await AuthChallenge.deleteMany({
    userId: user._id,
    type: 'ENABLE_EMAIL_2FA',
    consumedAt: null,
  });

  await notifySecurity(user.email, {
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
};

/**
 * Complete a login that reached the 2FA challenge. Consumes the challenge
 * atomically, then verifies TOTP or a recovery code and only then issues
 * the normal session.
 */
const verifyTwoFactorLoginIntoDB = async ({
  challengeToken,
  code,
}: {
  challengeToken: string;
  code: string;
}) => {
  // Peek the challenge to learn the user without trusting any client claim.
  const peek = await AuthChallenge.findOne({
    tokenHash: hashChallengeToken(challengeToken),
    type: 'LOGIN_2FA',
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!peek) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired verification challenge'
    );
  }

  const user = await User.findById(peek.userId).select(
    '+twoFactorSecretEncrypted +twoFactorRecoveryCodes'
  );
  if (!user || user.isDeleted || user.status === 'BLOCKED') {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired verification challenge'
    );
  }
  // TOTP/recovery are only the active factor for the authenticator method;
  // an email-method account can never complete login through this endpoint.
  if (effectiveTwoFactorMethod(user) !== 'authenticator') {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired verification challenge'
    );
  }

  // Consume BEFORE verifying so a failed attempt also burns the challenge
  // (prevents parallel brute-force through one challenge).
  await consumeLogin2FAChallenge(challengeToken, String(user._id));

  const ok = await verifyActiveTwoFactor(user, code, {
    consumeRecoveryCode: true,
  });
  if (!ok) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid verification code');
  }

  return issueTokens(user);
};

// --- Email OTP (alternative second factor + account-email verification) ----

/** Peek a live LOGIN_2FA challenge without consuming it. */
const peekLogin2FAChallenge = async (challengeToken: string) => {
  const challenge = await AuthChallenge.findOne({
    tokenHash: hashChallengeToken(challengeToken),
    type: 'LOGIN_2FA',
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!challenge) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired verification challenge'
    );
  }
  return challenge;
};

const otpCooldownRemainingSeconds = (sentAt: Date | null | undefined): number =>
  sentAt
    ? Math.max(
        0,
        Math.ceil((sentAt.getTime() + EMAIL_OTP_COOLDOWN_MS - Date.now()) / 1000)
      )
    : 0;

const throttleError = (remainingSeconds: number) =>
  new AppError(
    httpStatus.TOO_MANY_REQUESTS,
    remainingSeconds > 0
      ? `Please wait ${remainingSeconds} seconds before requesting another code.`
      : 'Too many verification codes requested. Please try again later.'
  );

/**
 * Atomically reserve one email-OTP send slot for the account inside the
 * rolling window (shared, MongoDB-backed — safe across instances). Pushes
 * the send timestamp only when the account is still under the cap.
 */
const reserveAccountOtpSlot = async (userId: unknown): Promise<boolean> => {
  const windowStart = new Date(Date.now() - EMAIL_OTP_ACCOUNT_WINDOW_MS);
  const inWindow = {
    $filter: {
      input: { $ifNull: ['$emailOtpSendLog', []] },
      cond: { $gte: ['$$this', windowStart] },
    },
  };

  const updated = await User.findOneAndUpdate(
    {
      _id: userId,
      $expr: {
        $lt: [
          { $size: inWindow },
          EMAIL_OTP_MAX_SENDS_PER_ACCOUNT_WINDOW,
        ],
      },
    },
    [
      {
        $set: {
          emailOtpSendLog: {
            $slice: [
              { $concatArrays: [inWindow, [new Date()]] },
              EMAIL_OTP_MAX_SENDS_PER_ACCOUNT_WINDOW * 4,
            ],
          },
        },
      },
    ],
    { new: true }
  ).select('+emailOtpSendLog');

  return !!updated;
};

/**
 * Issue a fresh OTP for a live challenge: replaces any outstanding code
 * (replacement policy), enforces the per-challenge cooldown and send cap,
 * and stores only the keyed hash. Atomic — concurrent sends cannot both
 * pass the cooldown.
 */
const issueChallengeOtp = async (challengeId: unknown) => {
  const code = generateEmailOtp();
  const now = Date.now();
  const cooldownCutoff = new Date(now - EMAIL_OTP_COOLDOWN_MS);

  const updated = await AuthChallenge.findOneAndUpdate(
    {
      _id: challengeId,
      consumedAt: null,
      expiresAt: { $gt: new Date() },
      emailOtpSendCount: { $lt: EMAIL_OTP_MAX_SENDS_PER_CHALLENGE },
      $or: [
        { emailOtpSentAt: null },
        { emailOtpSentAt: { $lte: cooldownCutoff } },
      ],
    },
    {
      $set: {
        emailOtpHash: hashEmailOtp(code),
        emailOtpExpiresAt: new Date(now + EMAIL_OTP_TTL_MS),
        emailOtpSentAt: new Date(now),
      },
      $inc: { emailOtpSendCount: 1 },
    },
    { new: true }
  );

  if (!updated) return null;
  return { code, challengeId: updated._id };
};

/** Issue an OTP against a live LOGIN_2FA challenge identified by its token. */
const issueChallengeOtpByToken = async (challengeToken: string) => {
  const challenge = await AuthChallenge.findOne({
    tokenHash: hashChallengeToken(challengeToken),
    type: 'LOGIN_2FA',
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!challenge) return null;
  return issueChallengeOtp(challenge._id);
};

/** Delivery failed: invalidate the just-issued code (never received). */
const invalidateIssuedOtp = async (challengeId: unknown) => {
  await AuthChallenge.updateOne(
    { _id: challengeId },
    { $set: { emailOtpHash: null, emailOtpExpiresAt: null } }
  );
};

/** Validate + clear OTP material on an already-consumed challenge doc. */
const checkAndClearConsumedOtp = async (
  consumed: {
    _id: unknown;
    emailOtpHash: string | null;
    emailOtpExpiresAt: Date | null;
  },
  code: string
): Promise<boolean> => {
  const ok =
    !!consumed.emailOtpHash &&
    !!consumed.emailOtpExpiresAt &&
    consumed.emailOtpExpiresAt.getTime() > Date.now() &&
    verifyEmailOtpHash(code, consumed.emailOtpHash);

  // Consumed challenges never retain OTP material.
  await AuthChallenge.updateOne(
    { _id: consumed._id },
    { $set: { emailOtpHash: null, emailOtpExpiresAt: null } }
  );

  return ok;
};

const otpDeliveryResponse = (maskedEmail: string) => ({
  maskedEmail,
  cooldownSeconds: Math.ceil(EMAIL_OTP_COOLDOWN_MS / 1000),
  expiresInSeconds: Math.ceil(EMAIL_OTP_TTL_MS / 1000),
});

/**
 * Safe info for the second-factor screen: the ACTIVE method (from the
 * database only) + masked destination. No secrets; the challenge token
 * itself is the credential.
 */
const getTwoFactorChallengeInfoIntoDB = async (challengeToken: string) => {
  const challenge = await peekLogin2FAChallenge(challengeToken);
  const user = await User.findById(challenge.userId);

  if (!user || user.isDeleted || user.status === 'BLOCKED') {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired verification challenge'
    );
  }

  const method = effectiveTwoFactorMethod(user);
  if (method === 'none') {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired verification challenge'
    );
  }

  return {
    method,
    methods: method === 'authenticator' ? ['totp', 'recovery'] : ['email'],
    maskedEmail: maskEmail(user.email),
    emailOtpSent: !!challenge.emailOtpHash,
    expiresInSeconds: Math.max(
      0,
      Math.floor((challenge.expiresAt.getTime() - Date.now()) / 1000)
    ),
  };
};

/**
 * Send an email OTP for a live login challenge. The recipient is always
 * resolved from the challenge's server-side user — never from the request
 * body. Replaces any outstanding code for this challenge.
 */
const sendTwoFactorEmailOtpIntoDB = async ({
  challengeToken,
}: {
  challengeToken: string;
}) => {
  const challenge = await peekLogin2FAChallenge(challengeToken);
  const user = await User.findById(challenge.userId).select(
    '+emailOtpSendLog'
  );

  if (!user || user.isDeleted || user.status === 'BLOCKED') {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired verification challenge'
    );
  }
  // The active method comes from the database — never from the client.
  if (effectiveTwoFactorMethod(user) !== 'email') {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Email OTP is not your active two-factor method.'
    );
  }
  if (!user.emailVerified) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Verify your account email before using email codes as a second factor.'
    );
  }

  if (!(await reserveAccountOtpSlot(user._id))) {
    throw throttleError(otpCooldownRemainingSeconds(null));
  }

  const issued = await issueChallengeOtp(challenge._id);
  if (!issued) {
    const fresh = await AuthChallenge.findById(challenge._id);
    throw throttleError(otpCooldownRemainingSeconds(fresh?.emailOtpSentAt));
  }

  try {
    await sendTwoFactorEmailOtp(user.email, issued.code);
  } catch (error) {
    // Never mark delivery successful on provider failure; never leak the
    // provider error. Diagnostics (safe fields only) go to the server log.
    await failEmailDelivery('login-otp', issued.challengeId, error);
  }

  return otpDeliveryResponse(maskEmail(user.email));
};

/**
 * Verify an email OTP for a login challenge. The challenge is consumed
 * atomically BEFORE the comparison (same policy as TOTP: any failed attempt
 * burns the challenge), so success can never be replayed into a second
 * session and pending methods are invalidated together.
 */
const verifyTwoFactorLoginEmailIntoDB = async ({
  challengeToken,
  code,
}: {
  challengeToken: string;
  code: string;
}) => {
  const challenge = await peekLogin2FAChallenge(challengeToken);
  const user = await User.findById(challenge.userId);

  if (!user || user.isDeleted || user.status === 'BLOCKED') {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired verification challenge'
    );
  }
  // Only the email method accepts an email OTP — purpose + method binding.
  if (effectiveTwoFactorMethod(user) !== 'email' || !user.emailVerified) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired verification challenge'
    );
  }

  const consumed = await AuthChallenge.findOneAndUpdate(
    {
      _id: challenge._id,
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { consumedAt: new Date() } },
    { new: true }
  );

  if (!consumed) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired verification challenge'
    );
  }

  const ok = await checkAndClearConsumedOtp(consumed, code);
  if (!ok) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid verification code');
  }

  return issueTokens(user);
};

/** Find or create the live EMAIL_VERIFY challenge for an authenticated user. */
const findOrCreateEmailVerifyChallenge = async (userId: unknown) => {
  const existing = await AuthChallenge.findOne({
    userId,
    type: 'EMAIL_VERIFY',
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (existing) return existing;

  // Random tokenHash — this challenge token is never handed to a client;
  // the document exists only as scoped OTP state for the authenticated user.
  return AuthChallenge.create({
    userId,
    type: 'EMAIL_VERIFY',
    tokenHash: hashChallengeToken(generateChallengeToken()),
    expiresAt: new Date(Date.now() + LOGIN_2FA_CHALLENGE_TTL_MS),
  });
};

/**
 * Settings flow: send an OTP to confirm the account email is under the
 * user's control. Required before email OTP can act as a login factor.
 */
const sendEmailVerificationOtpIntoDB = async (userId: string) => {
  const user = await User.findById(userId).select('+emailOtpSendLog');
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found!');
  }
  if (user.status === 'BLOCKED') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked!');
  }
  if (user.emailVerified) {
    throw new AppError(
      httpStatus.CONFLICT,
      'Your account email is already verified.'
    );
  }

  const challenge = await findOrCreateEmailVerifyChallenge(user._id);

  if (!(await reserveAccountOtpSlot(user._id))) {
    throw throttleError(otpCooldownRemainingSeconds(null));
  }

  const issued = await issueChallengeOtp(challenge._id);
  if (!issued) {
    const fresh = await AuthChallenge.findById(challenge._id);
    throw throttleError(otpCooldownRemainingSeconds(fresh?.emailOtpSentAt));
  }

  try {
    await sendTwoFactorEmailOtp(user.email, issued.code);
  } catch (error) {
    await failEmailDelivery('email-verify', issued.challengeId, error);
  }

  return otpDeliveryResponse(maskEmail(user.email));
};

/** Settings flow: verify the emailed code and mark the account email verified. */
const verifyEmailOwnershipIntoDB = async (
  userId: string,
  { code }: { code: string }
) => {
  const user = await User.findById(userId);
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found!');
  }
  if (user.status === 'BLOCKED') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked!');
  }
  if (user.emailVerified) {
    throw new AppError(
      httpStatus.CONFLICT,
      'Your account email is already verified.'
    );
  }

  const challenge = await AuthChallenge.findOne({
    userId,
    type: 'EMAIL_VERIFY',
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!challenge) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired verification code'
    );
  }

  const consumed = await AuthChallenge.findOneAndUpdate(
    { _id: challenge._id, consumedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { consumedAt: new Date() } },
    { new: true }
  );

  if (!consumed) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired verification code'
    );
  }

  const ok = await checkAndClearConsumedOtp(consumed, code);
  if (!ok) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid verification code');
  }

  await User.updateOne({ _id: user._id }, { $set: { emailVerified: true } });

  await notifySecurity(user.email, {
    subject: 'Account email verified - Aura Trip',
    heading: 'Account Email Verified',
    intro: 'The email address on your Aura Trip account was verified.',
    lines: [
      'Email codes can now be used as a second factor when you sign in.',
    ],
    notice: "If this wasn't you, secure your account immediately.",
  });

  return { emailVerified: true };
};

/** Find or create the live ENABLE_EMAIL_2FA challenge for an authenticated user. */
const findOrCreateEnableEmailChallenge = async (userId: unknown) => {
  const existing = await AuthChallenge.findOne({
    userId,
    type: 'ENABLE_EMAIL_2FA',
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (existing) return existing;

  return AuthChallenge.create({
    userId,
    type: 'ENABLE_EMAIL_2FA',
    tokenHash: hashChallengeToken(generateChallengeToken()),
    expiresAt: new Date(Date.now() + LOGIN_2FA_CHALLENGE_TTL_MS),
  });
};

/**
 * Enrollment step 1 (Settings): send a short-lived OTP to the account email
 * to prove control before switching 2FA to the email method. The method is
 * NOT switched here — only on successful verification.
 */
const enableEmailOtpIntoDB = async (userId: string) => {
  const user = await User.findById(userId).select('+emailOtpSendLog');
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found!');
  }
  if (user.status === 'BLOCKED') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked!');
  }
  if (effectiveTwoFactorMethod(user) === 'email') {
    throw new AppError(
      httpStatus.CONFLICT,
      'Email OTP is already enabled for your account.'
    );
  }
  if (!user.emailVerified) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Verify your account email before enabling email codes as a second factor.'
    );
  }

  const challenge = await findOrCreateEnableEmailChallenge(user._id);

  if (!(await reserveAccountOtpSlot(user._id))) {
    throw throttleError(otpCooldownRemainingSeconds(null));
  }

  const issued = await issueChallengeOtp(challenge._id);
  if (!issued) {
    const fresh = await AuthChallenge.findById(challenge._id);
    throw throttleError(otpCooldownRemainingSeconds(fresh?.emailOtpSentAt));
  }

  try {
    await sendTwoFactorEmailOtp(user.email, issued.code);
  } catch (error) {
    await failEmailDelivery('enable-email-2fa', issued.challengeId, error);
  }

  return otpDeliveryResponse(maskEmail(user.email));
};

/**
 * Enrollment step 2 (Settings): verify the emailed code and atomically
 * switch the single active method to email OTP. Clears authenticator
 * material (secret + recovery codes) so only one method is ever active.
 */
const verifyEnableEmailOtpIntoDB = async (
  userId: string,
  { code }: { code: string }
) => {
  const user = await User.findById(userId).select(
    '+twoFactorSecretEncrypted +twoFactorRecoveryCodes'
  );
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found!');
  }
  if (user.status === 'BLOCKED') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked!');
  }
  if (effectiveTwoFactorMethod(user) === 'email') {
    throw new AppError(
      httpStatus.CONFLICT,
      'Email OTP is already enabled for your account.'
    );
  }
  if (!user.emailVerified) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Verify your account email before enabling email codes as a second factor.'
    );
  }

  const challenge = await AuthChallenge.findOne({
    userId: user._id,
    type: 'ENABLE_EMAIL_2FA',
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!challenge) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired verification code'
    );
  }

  const consumed = await AuthChallenge.findOneAndUpdate(
    { _id: challenge._id, consumedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { consumedAt: new Date() } },
    { new: true }
  );

  if (!consumed) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired verification code'
    );
  }

  const ok = await checkAndClearConsumedOtp(consumed, code);
  if (!ok) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid verification code');
  }

  // Atomic method switch. A failed attempt never touches the user doc, so
  // an already-active authenticator method is never disabled by a bad OTP.
  const updated = await User.findOneAndUpdate(
    {
      _id: user._id,
      emailVerified: true,
      $or: [
        { twoFactorMethod: { $ne: 'email' } },
        { twoFactorMethod: { $exists: false } },
      ],
    },
    {
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
    },
    { new: true }
  );

  if (!updated) {
    throw new AppError(
      httpStatus.CONFLICT,
      'Email OTP is already enabled for your account.'
    );
  }

  await AuthChallenge.deleteMany({
    userId: user._id,
    type: 'ENABLE_EMAIL_2FA',
    consumedAt: null,
  });

  await notifySecurity(user.email, {
    subject: 'Email OTP enabled - Aura Trip',
    heading: 'Email OTP Enabled',
    intro: 'Email codes are now your second factor when you sign in.',
    lines: [
      'Authenticator-app codes and recovery codes are no longer accepted at sign-in.',
      'Each sign-in sends a fresh 6-digit code to your account email.',
    ],
    notice: "If this wasn't you, secure your account immediately.",
  });

  return { twoFactorMethod: 'email' as const, twoFactorEnabled: true };
};

/**
 * Disable 2FA. The authenticator method requires the active factor (or a
 * recovery code) as proof; the email method requires only recent password
 * re-authentication (the account email already gates delivery of login
 * codes). The active method always comes from the database.
 */
const disableTwoFactorIntoDB = async (
  userId: string,
  { password, code }: { password?: string; code?: string }
) => {
  const user = await User.findById(userId).select(
    '+password +twoFactorSecretEncrypted +twoFactorRecoveryCodes'
  );
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found!');
  }
  if (user.status === 'BLOCKED') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked!');
  }
  const method = effectiveTwoFactorMethod(user);
  if (method === 'none') {
    throw new AppError(
      httpStatus.CONFLICT,
      'Two-factor authentication is not enabled'
    );
  }

  await assertRecentPasswordAuth(user, password);

  if (method === 'authenticator') {
    if (!code) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Enter your authenticator code or a recovery code to disable 2FA.'
      );
    }
    const ok = await verifyActiveTwoFactor(user, code, {
      consumeRecoveryCode: true,
    });
    if (!ok) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid verification code');
    }
  }
  // method === 'email': password re-authentication above is the proof.

  await User.updateOne(
    {
      _id: user._id,
      $or: [
        { twoFactorMethod: { $in: ['authenticator', 'email'] } },
        { twoFactorMethod: { $exists: false }, twoFactorEnabled: true },
      ],
    },
    {
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
    }
  );
  await AuthChallenge.deleteMany({
    userId: user._id,
    type: 'ENABLE_EMAIL_2FA',
    consumedAt: null,
  });

  await notifySecurity(user.email, {
    subject: 'Two-factor authentication disabled - Aura Trip',
    heading: 'Two-Factor Authentication Disabled',
    intro: 'Two-factor authentication was disabled on your Aura Trip account.',
    lines: ['Your account now uses password-only sign-in.'],
    notice: "If this wasn't you, secure your account immediately.",
  });

  return { twoFactorEnabled: false, twoFactorMethod: 'none' as const };
};

/** Regenerate recovery codes — authenticator method only; invalidates every previous code. */
const regenerateRecoveryCodesIntoDB = async (
  userId: string,
  { password, code }: { password?: string; code: string }
) => {
  const user = await User.findById(userId).select(
    '+password +twoFactorSecretEncrypted +twoFactorRecoveryCodes'
  );
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found!');
  }
  if (user.status === 'BLOCKED') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked!');
  }
  if (effectiveTwoFactorMethod(user) !== 'authenticator') {
    throw new AppError(
      httpStatus.CONFLICT,
      'Recovery codes are only available for authenticator-app two-factor authentication.'
    );
  }

  await assertRecentPasswordAuth(user, password);

  const ok = await verifyActiveTwoFactor(user, code, {
    consumeRecoveryCode: true,
  });
  if (!ok) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid verification code');
  }

  const { codes, records } = generateRecoveryCodes();
  await User.updateOne(
    { _id: user._id },
    { $set: { twoFactorRecoveryCodes: records } }
  );

  await notifySecurity(user.email, {
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
};

const resetLinkIntoDB = async ({ email }: { email: string }) => {
  const user = await User.findOne({ email: email });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found!');
  }

  if (user.isDeleted === true) {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is deleted!');
  }

  if (user.status == 'BLOCKED') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked!');
  }

  const jwtPayload = {
    id: user._id,
    email: user.email,
    role: user.role,
  };

  const resetToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    '10m'
  );

  const resetLink = `${config.reset_link_url}?email=${user.email}&token=${resetToken}`;

  // Send email to the user with the reset link
  await sendEmail(user.email, resetLink);
};

const forgetPasswordIntoDB = async (payload: {
  email: string;
  newPassword: string;
  token: string;
}) => {
  const user = await User.findOne({ email: payload?.email });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found!');
  }

  if (user.isDeleted === true) {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is deleted!');
  }

  if (user.status == 'BLOCKED') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked!');
  }

  // Check if token is valid
  const decoded = jwt.verify(
    payload.token,
    config.jwt_access_secret as string
  ) as {
    id: string;
    email: string;
    role: string;
  };

  if (payload.email !== decoded.email) {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is forbidden!');
  }

  const newHashPassword = await bcrypt.hash(
    payload.newPassword,
    Number(config.bcrypt_salt_rounds)
  );

  const result = await User.findOneAndUpdate(
    { _id: decoded.id, role: decoded.role },
    {
      password: newHashPassword,
    },
    { new: true }
  );

  return result;
};
const changePasswordIntoDB = async (
  payload: { email: string; newPassword: string },
  token: string
) => {
  const user = await User.findOne({ email: payload?.email });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found!');
  }

  if (user.isDeleted === true) {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is deleted!');
  }

  if (user.status == 'BLOCKED') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked!');
  }

  // Check if token is valid
  const decoded = jwt.verify(token, config.jwt_access_secret as string) as {
    id: string;
    email: string;
    role: string;
  };

  if (payload.email !== decoded.email) {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is forbidden!');
  }

  const newHashPassword = await bcrypt.hash(
    payload.newPassword,
    Number(config.bcrypt_salt_rounds)
  );

  const result = await User.findOneAndUpdate(
    { _id: decoded.id, role: decoded.role },
    {
      password: newHashPassword,
    },
    { new: true }
  );

  return result;
};

export const UserServices = {
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
