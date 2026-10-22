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
exports.verifyGoogleIdToken = void 0;
const google_auth_library_1 = require("google-auth-library");
const config_1 = __importDefault(require("../../config"));
let client = null;
const getClient = () => {
    if (!config_1.default.google_client_id) {
        throw new Error('Google OAuth is not configured: set GOOGLE_CLIENT_ID on the server');
    }
    if (!client) {
        client = new google_auth_library_1.OAuth2Client(config_1.default.google_client_id);
    }
    return client;
};
/**
 * Verify a Google ID token server-side using Google's official library.
 * Validates signature, issuer, audience (client id) and expiry. Never trust
 * a browser-supplied profile payload — only tokens that pass this check
 * may be used for authentication.
 */
const verifyGoogleIdToken = (idToken) => __awaiter(void 0, void 0, void 0, function* () {
    const ticket = yield getClient().verifyIdToken({
        idToken,
        audience: config_1.default.google_client_id,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
        throw new Error('Google token missing required claims');
    }
    return {
        sub: payload.sub,
        email: payload.email.toLowerCase(),
        emailVerified: payload.email_verified === true,
        name: payload.name,
        picture: payload.picture,
    };
});
exports.verifyGoogleIdToken = verifyGoogleIdToken;
