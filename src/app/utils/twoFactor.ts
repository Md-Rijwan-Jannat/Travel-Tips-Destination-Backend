import crypto from 'crypto';
import {
  generateSecret,
  generateURI,
  verify as verifyOtp,
} from 'otplib';
import config from '../../config';

// Allow one 30s step of clock drift either side of the current window.
const TOTP_EPOCH_TOLERANCE_SECONDS = 30;

const ENCRYPTION_VERSION = 'v1';

/**
 * Resolve the AES-256-GCM key (32 bytes) used to encrypt TOTP secrets at
 * rest. The key must live only in the environment / secret manager — never
 * in the database and never in client bundles.
 */
const getEncryptionKey = (): Buffer => {
  const raw = config.totp_encryption_key;
  if (!raw) {
    throw new Error(
      'TOTP encryption is not configured: set TOTP_ENCRYPTION_KEY (base64 of 32 random bytes)'
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('TOTP_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return key;
};

/** Encrypt a TOTP secret with AES-256-GCM. Output: v1.iv.tag.cipher (base64). */
export const encryptSecret = (secret: string): string => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
};

/** Decrypt a value produced by {@link encryptSecret} (authenticated). */
export const decryptSecret = (payload: string): string => {
  const key = getEncryptionKey();
  const [version, ivB64, tagB64, dataB64] = payload.split('.');
  if (version !== ENCRYPTION_VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted TOTP secret format');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivB64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

/** Generate a cryptographically secure TOTP secret (base32). */
export const generateTotpSecret = (): string => generateSecret();

/** otpauth:// provisioning URI for authenticator apps. */
export const buildOtpAuthUrl = (email: string, secret: string): string =>
  generateURI({
    issuer: config.totp_issuer || 'Aura Trip',
    label: email,
    secret,
  });

/** Verify a 6-digit TOTP code against a decrypted secret (±1 step window). */
export const verifyTotpCode = async (
  code: string,
  secret: string
): Promise<boolean> => {
  try {
    const result = await verifyOtp({
      secret,
      token: code.trim(),
      epochTolerance: TOTP_EPOCH_TOLERANCE_SECONDS,
    });
    return result.valid === true;
  } catch {
    return false;
  }
};

const RECOVERY_CODE_COUNT = 10;

/**
 * Generate one-time recovery codes (plaintext, shown to the user exactly
 * once) paired with their SHA-256 hashes for storage.
 */
export const generateRecoveryCodes = (): {
  codes: string[];
  records: { hash: string; used: boolean; usedAt: Date | null }[];
} => {
  const codes: string[] = [];
  const records: { hash: string; used: boolean; usedAt: Date | null }[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i += 1) {
    // 10 random bytes → 20 hex chars → "xxxxx-xxxxx-xxxxx-xxxxx" (~80 bits).
    const raw = crypto.randomBytes(10).toString('hex');
    const code = `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
    codes.push(code);
    records.push({ hash: hashRecoveryCode(code), used: false, usedAt: null });
  }
  return { codes, records };
};

/** SHA-256 hash of a recovery code for at-rest storage / lookup. */
export const hashRecoveryCode = (code: string): string =>
  crypto.createHash('sha256').update(code.trim().toLowerCase()).digest('hex');

/** Opaque single-use challenge token; only its hash is persisted. */
export const generateChallengeToken = (): string =>
  crypto.randomBytes(32).toString('base64url');

export const hashChallengeToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

// --- Email OTP (alternative second factor) ----------------------------------

// All values are server-side controls; env overrides exist for tests only.
// Production defaults: 5-minute code life, 60-second resend cooldown, at most
// 5 sends per login challenge and 5 sends per account within 15 minutes.
const envInt = (name: string, fallback: number): number => {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
};

export const EMAIL_OTP_TTL_MS = envInt('EMAIL_OTP_TTL_MS', 5 * 60 * 1000);
export const EMAIL_OTP_COOLDOWN_MS = envInt('EMAIL_OTP_COOLDOWN_MS', 60 * 1000);
export const EMAIL_OTP_MAX_SENDS_PER_CHALLENGE = envInt(
  'EMAIL_OTP_MAX_SENDS_PER_CHALLENGE',
  5
);
export const EMAIL_OTP_MAX_SENDS_PER_ACCOUNT_WINDOW = envInt(
  'EMAIL_OTP_MAX_SENDS_PER_ACCOUNT_WINDOW',
  5
);
export const EMAIL_OTP_ACCOUNT_WINDOW_MS = envInt(
  'EMAIL_OTP_ACCOUNT_WINDOW_MS',
  15 * 60 * 1000
);

/**
 * HMAC-SHA256 key for email OTP codes, derived from the server-side JWT
 * secret. Lives only in the environment / secret manager — never in the
 * database. Keyed hashing means a database leak cannot be brute-forced
 * offline against the small 6-digit code space.
 */
const getEmailOtpHmacKey = (): Buffer => {
  const secret = config.jwt_access_secret;
  if (!secret) {
    throw new Error(
      'Email OTP is not configured: jwt_access_secret is missing'
    );
  }
  return crypto.createHmac('sha256', secret).update('email-otp-v1').digest();
};

/** Cryptographically secure 6-digit numeric OTP (never Math.random). */
export const generateEmailOtp = (): string =>
  crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

/** Keyed HMAC (hex) of an email OTP for at-rest storage. */
export const hashEmailOtp = (code: string): string =>
  crypto
    .createHmac('sha256', getEmailOtpHmacKey())
    .update(code.trim())
    .digest('hex');

/** Constant-time comparison of a submitted OTP against a stored hash. */
export const verifyEmailOtpHash = (code: string, storedHash: string): boolean => {
  const computed = Buffer.from(hashEmailOtp(code), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return computed.length === stored.length && crypto.timingSafeEqual(computed, stored);
};
