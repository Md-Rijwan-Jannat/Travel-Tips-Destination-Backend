"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.default = {
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
};
