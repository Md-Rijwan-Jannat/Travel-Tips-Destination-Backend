/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application, Request, Response } from "express";
import helmet from "helmet";
import router from "./app/routes";
import notFound from "./app/middlewares/notFound";
import globalErrorHandler from "./app/middlewares/globalErrorhandler";
import sanitize from "./app/middlewares/sanitize";
import {
  authGeneralLimiter,
  authLimiter,
  globalLimiter,
} from "./app/middlewares/rateLimiter";
import config from "./config";

const app: Application = express();

// Correct client IPs for rate limiting when behind (exactly one) proxy.
app.set("trust proxy", config.trust_proxy);

// Security headers
app.use(helmet());

// Parsers
app.use(express.json());
app.use(cookieParser());

// Strip NoSQL operators / dangerous keys from bodies and query strings
// before anything downstream sees them.
app.use(sanitize);

// Rate limiting: blanket cap for everyone; moderate budget for all auth
// actions; strict budget reserved for credential endpoints (per-route in
// auth.routes.ts) and payment initiation.
app.use(globalLimiter);
app.use("/api/v1/auth", authGeneralLimiter);
app.use("/api/v1/payment/subscriptions", authLimiter);

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://traveltipsdestinationcommunity.vercel.app",
    ],
    credentials: true, // Allow credentials to be sent
  }),
);

// Application routes
app.use("/api/v1", router);

app.get("/", (req: Request, res: Response) => {
  res.send("Hello Aura Trip");
});

// Global Error
app.use(globalErrorHandler);

//Not Found
app.use(notFound);

export default app;
