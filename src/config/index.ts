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
};
