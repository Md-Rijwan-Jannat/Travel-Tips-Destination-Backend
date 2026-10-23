import dotenv from "dotenv";
dotenv.config();

export default {
  port: process.env.PORT,
  database_url: process.env.database_url,
  NODE_ENV: process.env.NODE_ENV,
  cloudinary_cloud_name: process.env.cloudinary_cloud_name,
  cloudinary_api_key: process.env.cloudinary_api_key,
  cloudinary_api_secret: process.env.cloudinary_api_secret,
  bcrypt_salt_rounds: process.env.bcrypt_salt_rounds,
  jwt_access_secret: process.env.jwt_access_secret,
  jwt_access_expires_in: process.env.jwt_access_expires_in,
  jwt_refresh_expires_in: process.env.jwt_refresh_expires_in,
  admin_email: process.env.admin_email,
  admin_password: process.env.admin_password,
  admin_mobile_number: process.env.admin_mobile_number,
  admin_image: process.env.admin_image,
  reset_link_url: process.env.reset_link_url,
  store_id: process.env.STORE_ID,
  signature_key: process.env.SIGNATURE_KEY,
  aamarpay_url: process.env.AAMARPAY_URL,
  payment_verify_url: process.env.PAYMENT_VERIFY_URL,
  backend_live_url: process.env.BACKEND_LIVE_URL,
  frontend_live_url: process.env.FRONTEND_LIVE_URL,
  frontend_base_url: process.env.FRONTEND_BASE_URL,
  // Premium subscription price (BDT) — server-side price table; client-sent
  // amounts are ignored. Defaults to the amount the frontend displays (1000).
  premium_price: Number(process.env.PREMIUM_PRICE) || 1000,
  // Number of reverse proxies in front of the app (for correct client IPs in
  // rate limiting). 0 = off (safe default); set TRUST_PROXY=1 when deployed
  // behind exactly one trusted proxy.
  trust_proxy: Number(process.env.TRUST_PROXY) || 0,

  // Official Aura Trip support/contact identity (application-facing only —
  // never used as a user account email).
  support_email: process.env.SUPPORT_EMAIL || "auratrip.support@gmail.com",
  // SMTP display name. The actual SMTP credentials stay in EMAIL_USER/EMAIL_PASS.
  email_from_name: process.env.EMAIL_FROM_NAME || "Aura Trip Support",
  // Optional override for the SMTP From address. Must be authorized for the
  // SMTP account (Gmail send-as / Workspace alias); falls back to EMAIL_USER.
  email_from_address: process.env.EMAIL_FROM_ADDRESS || "",

  // Google OAuth (server-side id_token verification). Only the client ID is
  // safe to expose publicly; the secret must never leave the server.
  google_client_id: process.env.GOOGLE_CLIENT_ID || "",
  google_client_secret: process.env.GOOGLE_CLIENT_SECRET || "",

  // TOTP 2FA: base64-encoded 32-byte key used with AES-256-GCM to encrypt
  // authenticator secrets at rest. Generate with:
  //   openssl rand -base64 32
  totp_encryption_key: process.env.TOTP_ENCRYPTION_KEY || "",
  // Issuer label shown in authenticator apps.
  totp_issuer: process.env.TOTP_ISSUER || "Aura Trip",

  // ---- Aura Trip Shorts ----
  // Maximum allowed video duration in seconds (validated from the declared
  // duration; enforced at the origin too when remote verification is on).
  short_max_duration_seconds: Number(process.env.SHORT_MAX_DURATION_SECONDS) || 180,
  // Maximum allowed video size in megabytes.
  short_max_size_mb: Number(process.env.SHORT_MAX_SIZE_MB) || 100,
  // When "true", every uploaded Short is HEAD-verified at the origin
  // (status 200 + video/* content-type + content-length within limits)
  // before it can leave PROCESSING. Requires outbound network access.
  short_remote_verify: process.env.SHORT_REMOTE_VERIFY === "true",
  // Comma-separated allow-list of hosts a Short video URL may live on.
  short_allowed_media_hosts:
    process.env.SHORT_ALLOWED_MEDIA_HOSTS || "res.cloudinary.com",
};
