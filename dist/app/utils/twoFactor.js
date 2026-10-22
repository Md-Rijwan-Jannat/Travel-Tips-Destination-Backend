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
exports.verifyEmailOtpHash = exports.hashEmailOtp = exports.generateEmailOtp = exports.EMAIL_OTP_ACCOUNT_WINDOW_MS = exports.EMAIL_OTP_MAX_SENDS_PER_ACCOUNT_WINDOW = exports.EMAIL_OTP_MAX_SENDS_PER_CHALLENGE = exports.EMAIL_OTP_COOLDOWN_MS = exports.EMAIL_OTP_TTL_MS = exports.hashChallengeToken = exports.generateChallengeToken = exports.hashRecoveryCode = exports.generateRecoveryCodes = exports.verifyTotpCode = exports.buildOtpAuthUrl = exports.generateTotpSecret = exports.decryptSecret = exports.encryptSecret = void 0;
const crypto_1 = __importDefault(require("crypto"));
const otplib_1 = require("otplib");
const config_1 = __importDefault(require("../../config"));
// Allow one 30s step of clock drift either side of the current window.
const TOTP_EPOCH_TOLERANCE_SECONDS = 30;
const ENCRYPTION_VERSION = 'v1';
/**
 * Resolve the AES-256-GCM key (32 bytes) used to encrypt TOTP secrets at
 * rest. The key must live only in the environment / secret manager — never
 * in the database and never in client bundles.
 */
const getEncryptionKey = () => {
    const raw = config_1.default.totp_encryption_key;
    if (!raw) {
        throw new Error('TOTP encryption is not configured: set TOTP_ENCRYPTION_KEY (base64 of 32 random bytes)');
    }
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
        throw new Error('TOTP_ENCRYPTION_KEY must decode to exactly 32 bytes');
    }
    return key;
};
/** Encrypt a TOTP secret with AES-256-GCM. Output: v1.iv.tag.cipher (base64). */
const encryptSecret = (secret) => {
    const key = getEncryptionKey();
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
        ENCRYPTION_VERSION,
        iv.toString('base64'),
        tag.toString('base64'),
        ciphertext.toString('base64'),
    ].join('.');
};
exports.encryptSecret = encryptSecret;
/** Decrypt a value produced by {@link encryptSecret} (authenticated). */
const decryptSecret = (payload) => {
    const key = getEncryptionKey();
    const [version, ivB64, tagB64, dataB64] = payload.split('.');
    if (version !== ENCRYPTION_VERSION || !ivB64 || !tagB64 || !dataB64) {
        throw new Error('Invalid encrypted TOTP secret format');
    }
    const decipher = crypto_1.default.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
    ]).toString('utf8');
};
exports.decryptSecret = decryptSecret;
/** Generate a cryptographically secure TOTP secret (base32). */
const generateTotpSecret = () => (0, otplib_1.generateSecret)();
exports.generateTotpSecret = generateTotpSecret;
/** otpauth:// provisioning URI for authenticator apps. */
const buildOtpAuthUrl = (email, secret) => (0, otplib_1.generateURI)({
    issuer: config_1.default.totp_issuer || 'Aura Trip',
    label: email,
    secret,
});
exports.buildOtpAuthUrl = buildOtpAuthUrl;
/** Verify a 6-digit TOTP code against a decrypted secret (±1 step window). */
const verifyTotpCode = (code, secret) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield (0, otplib_1.verify)({
            secret,
            token: code.trim(),
            epochTolerance: TOTP_EPOCH_TOLERANCE_SECONDS,
        });
        return result.valid === true;
    }
    catch (_a) {
        return false;
    }
});
exports.verifyTotpCode = verifyTotpCode;
const RECOVERY_CODE_COUNT = 10;
/**
 * Generate one-time recovery codes (plaintext, shown to the user exactly
 * once) paired with their SHA-256 hashes for storage.
 */
const generateRecoveryCodes = () => {
    const codes = [];
    const records = [];
    for (let i = 0; i < RECOVERY_CODE_COUNT; i += 1) {
        // 10 random bytes → 20 hex chars → "xxxxx-xxxxx-xxxxx-xxxxx" (~80 bits).
        const raw = crypto_1.default.randomBytes(10).toString('hex');
        const code = `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
        codes.push(code);
        records.push({ hash: (0, exports.hashRecoveryCode)(code), used: false, usedAt: null });
    }
    return { codes, records };
};
exports.generateRecoveryCodes = generateRecoveryCodes;
/** SHA-256 hash of a recovery code for at-rest storage / lookup. */
const hashRecoveryCode = (code) => crypto_1.default.createHash('sha256').update(code.trim().toLowerCase()).digest('hex');
exports.hashRecoveryCode = hashRecoveryCode;
/** Opaque single-use challenge token; only its hash is persisted. */
const generateChallengeToken = () => crypto_1.default.randomBytes(32).toString('base64url');
exports.generateChallengeToken = generateChallengeToken;
const hashChallengeToken = (token) => crypto_1.default.createHash('sha256').update(token).digest('hex');
exports.hashChallengeToken = hashChallengeToken;
// --- Email OTP (alternative second factor) ----------------------------------
// All values are server-side controls; env overrides exist for tests only.
// Production defaults: 5-minute code life, 60-second resend cooldown, at most
// 5 sends per login challenge and 5 sends per account within 15 minutes.
const envInt = (name, fallback) => {
    const raw = Number(process.env[name]);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
};
exports.EMAIL_OTP_TTL_MS = envInt('EMAIL_OTP_TTL_MS', 5 * 60 * 1000);
exports.EMAIL_OTP_COOLDOWN_MS = envInt('EMAIL_OTP_COOLDOWN_MS', 60 * 1000);
exports.EMAIL_OTP_MAX_SENDS_PER_CHALLENGE = envInt('EMAIL_OTP_MAX_SENDS_PER_CHALLENGE', 5);
exports.EMAIL_OTP_MAX_SENDS_PER_ACCOUNT_WINDOW = envInt('EMAIL_OTP_MAX_SENDS_PER_ACCOUNT_WINDOW', 5);
exports.EMAIL_OTP_ACCOUNT_WINDOW_MS = envInt('EMAIL_OTP_ACCOUNT_WINDOW_MS', 15 * 60 * 1000);
/**
 * HMAC-SHA256 key for email OTP codes, derived from the server-side JWT
 * secret. Lives only in the environment / secret manager — never in the
 * database. Keyed hashing means a database leak cannot be brute-forced
 * offline against the small 6-digit code space.
 */
const getEmailOtpHmacKey = () => {
    const secret = config_1.default.jwt_access_secret;
    if (!secret) {
        throw new Error('Email OTP is not configured: jwt_access_secret is missing');
    }
    return crypto_1.default.createHmac('sha256', secret).update('email-otp-v1').digest();
};
/** Cryptographically secure 6-digit numeric OTP (never Math.random). */
const generateEmailOtp = () => crypto_1.default.randomInt(0, 1000000).toString().padStart(6, '0');
exports.generateEmailOtp = generateEmailOtp;
/** Keyed HMAC (hex) of an email OTP for at-rest storage. */
const hashEmailOtp = (code) => crypto_1.default
    .createHmac('sha256', getEmailOtpHmacKey())
    .update(code.trim())
    .digest('hex');
exports.hashEmailOtp = hashEmailOtp;
/** Constant-time comparison of a submitted OTP against a stored hash. */
const verifyEmailOtpHash = (code, storedHash) => {
    const computed = Buffer.from((0, exports.hashEmailOtp)(code), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    return computed.length === stored.length && crypto_1.default.timingSafeEqual(computed, stored);
};
exports.verifyEmailOtpHash = verifyEmailOtpHash;
