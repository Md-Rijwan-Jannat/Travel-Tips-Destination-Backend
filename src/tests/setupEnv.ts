// Runs before each test file's imports (vitest setupFiles).
// Auth signs/verifies tokens with config.jwt_access_secret, which is read from
// process.env at import time of src/config/index.ts. dotenv does not override
// existing process.env values, so these test values win over any .env file.
// No real secret values are used here.
process.env.NODE_ENV = "test";
process.env.jwt_access_secret = "test-only-jwt-secret-batch2";
process.env.jwt_access_expires_in = "1h";
process.env.jwt_refresh_expires_in = "1d";
process.env.bcrypt_salt_rounds = "4";
process.env.database_url = "mongodb://127.0.0.1:27017/aura-trip-test";
// 32-byte test key for TOTP secret encryption (NOT a real credential).
process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";
// Fast email-OTP resend cooldown so integration tests do not wait a minute
// between sends. Production default is 60 seconds.
process.env.EMAIL_OTP_COOLDOWN_MS = "1000";
// Deterministic SMTP config for tests (mailer is always mocked — these are
// placeholders so isEmailConfigured() is stable regardless of the local .env).
process.env.EMAIL_USER = "test@example.com";
process.env.EMAIL_PASS = "test-only-app-password";
