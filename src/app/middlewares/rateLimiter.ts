import rateLimit from "express-rate-limit";

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

// Strict budget for credential endpoints (login/register/password reset) and
// payment initiation — brute-force protection.
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: {
    success: false,
    statusCode: 429,
    message: "Too many attempts, please try again later.",
  },
});
