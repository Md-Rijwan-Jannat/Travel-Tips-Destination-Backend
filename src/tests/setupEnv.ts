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
