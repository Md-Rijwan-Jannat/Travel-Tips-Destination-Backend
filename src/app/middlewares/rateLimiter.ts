import rateLimit from "express-rate-limit";
import { NextFunction, Request, Response } from "express";

const tooManyRequestsMessage = {
  success: false,
  statusCode: 429,
  message: "Too many requests, please try again later.",
};

// Factory so dedicated limiters (and tests) can choose their own budgets.
export const createRateLimiter = (options: {
  windowMs: number;
  limit: number;
  message?: unknown;
}) =>
  rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: options.message ?? tooManyRequestsMessage,
  });

// Generous blanket cap: absorbs floods without affecting normal browsing.
export const globalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 300,
});

// Strict budget for credential endpoints (login/register/password reset,
// 2FA login verification) and payment initiation — brute-force protection.
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: {
    success: false,
    statusCode: 429,
    message: "Too many attempts, please try again later.",
  },
});

// Moderate budget for authenticated auth actions (session lookup, 2FA status/
// enroll/verify, Google link/unlink). These are legitimate per-page requests
// and must not exhaust the strict credential budget.
export const authGeneralLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: {
    success: false,
    statusCode: 429,
    message: "Too many requests, please try again later.",
  },
});

// Strict limiter applied per-route on credential endpoints inside
// auth.routes.ts. Skipped under NODE_ENV=test so integration suites can
// exercise login/2FA flows freely (anti-brute-force budgets are a
// production control; the factory stays fully testable via
// createRateLimiter).
export const credentialLimiter =
  process.env.NODE_ENV === "test"
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : authLimiter;

// Per-IP budget for email OTP delivery (login 2FA codes + account email
// verification). Complements the MongoDB-backed per-challenge cooldown and
// per-account send window, which are the authoritative cross-instance
// limits. Skipped under NODE_ENV=test for the same reason as above.
export const otpSendLimiter =
  process.env.NODE_ENV === "test"
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : createRateLimiter({
        windowMs: 15 * 60 * 1000,
        limit: 15,
        message: {
          success: false,
          statusCode: 429,
          message: "Too many requests, please try again later.",
        },
      });

// Group/community write actions (create group, join, post). Generous so
// normal usage never trips it; still caps automation and spam runs.
export const groupActionLimiter =
  process.env.NODE_ENV === "test"
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : createRateLimiter({
        windowMs: 15 * 60 * 1000,
        limit: 60,
        message: {
          success: false,
          statusCode: 429,
          message: "Too many requests, please try again later.",
        },
      });

// Invite preview/redemption: strict because these endpoints are guessable
// by token and public previews must not be scraped at scale.
export const inviteFlowLimiter =
  process.env.NODE_ENV === "test"
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : createRateLimiter({
        windowMs: 15 * 60 * 1000,
        limit: 40,
        message: {
          success: false,
          statusCode: 429,
          message: "Too many requests, please try again later.",
        },
      });
