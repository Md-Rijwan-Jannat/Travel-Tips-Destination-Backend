"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const routes_1 = __importDefault(require("./app/routes"));
const notFound_1 = __importDefault(require("./app/middlewares/notFound"));
const globalErrorhandler_1 = __importDefault(require("./app/middlewares/globalErrorhandler"));
const sanitize_1 = __importDefault(require("./app/middlewares/sanitize"));
const rateLimiter_1 = require("./app/middlewares/rateLimiter");
const config_1 = __importDefault(require("./config"));
const app = (0, express_1.default)();
// Correct client IPs for rate limiting when behind (exactly one) proxy.
app.set("trust proxy", config_1.default.trust_proxy);
// Security headers
app.use((0, helmet_1.default)());
// Parsers
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
// Strip NoSQL operators / dangerous keys from bodies and query strings
// before anything downstream sees them.
app.use(sanitize_1.default);
// Rate limiting: blanket cap for everyone, strict budget for credential and
// payment-initiation endpoints.
app.use(rateLimiter_1.globalLimiter);
app.use("/api/v1/auth", rateLimiter_1.authLimiter);
app.use("/api/v1/payment/subscriptions", rateLimiter_1.authLimiter);
app.use((0, cors_1.default)({
    origin: [
        "http://localhost:3000",
        "https://traveltipsdestinationcommunity.vercel.app",
    ],
    credentials: true, // Allow credentials to be sent
}));
// Application routes
app.use("/api/v1", routes_1.default);
app.get("/", (req, res) => {
    res.send("Hello Aura Trip");
});
// Global Error
app.use(globalErrorhandler_1.default);
//Not Found
app.use(notFound_1.default);
exports.default = app;
