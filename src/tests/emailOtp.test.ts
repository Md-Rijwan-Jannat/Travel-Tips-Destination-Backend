import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { generate } from "otplib";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import globalErrorHandler from "../app/middlewares/globalErrorhandler";
import { AuthRoutes } from "../app/module/Auth/auth.routes";
import { UserServices } from "../app/module/Auth/auth.service";
import { User } from "../app/module/User/user.model";
import { AuthChallenge } from "../app/module/Auth/authChallenge.model";
import { createToken } from "../app/utils/tokenGenerateFunction";
import {
  encryptSecret,
  generateTotpSecret,
  hashChallengeToken,
  hashEmailOtp,
} from "../app/utils/twoFactor";

// Single-active-method 2FA: email OTP vs authenticator, enrollment,
// method scoping, purpose binding, legacy migration. Secrets/keys here are
// test-only fixtures, never real credentials. The mocked mailer exposes the
// plaintext code to the test process only — the API never returns it.

const { mockSendOtp } = vi.hoisted(() => ({ mockSendOtp: vi.fn() }));

vi.mock("../app/utils/sendEmail", () => ({
  sendEmail: vi.fn(async () => undefined),
  sendSecurityEmail: vi.fn(async () => undefined),
  sendTwoFactorEmailOtp: mockSendOtp,
}));

const { mockVerifyGoogle } = vi.hoisted(() => ({
  mockVerifyGoogle: vi.fn(),
}));

vi.mock("../app/utils/googleAuth", () => ({
  verifyGoogleIdToken: mockVerifyGoogle,
}));

const TEST_SECRET = process.env.jwt_access_secret as string;

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/auth", AuthRoutes);
  app.use(globalErrorHandler);
  return app;
};

let mongod: MongoMemoryServer;
const app = buildApp();

const PASSWORD = "SecurePass123";
const TOTP_SECRET_PLAIN = generateTotpSecret();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let userCounter = 0;

type TMethod = "none" | "authenticator" | "email";

const createTwoFaUser = async ({
  emailVerified = true,
  googleSubject = null,
  password = PASSWORD,
  method = "authenticator",
}: {
  emailVerified?: boolean;
  googleSubject?: string | null;
  password?: string | null;
  method?: TMethod;
} = {}) => {
  userCounter += 1;
  const base = {
    name: "Otp User",
    email: `otp-user-${userCounter}-${Date.now()}@example.com`,
    password: password ?? undefined,
    emailVerified,
    googleSubject,
    twoFactorEnabled: method !== "none",
    twoFactorMethod: method,
  };

  if (method === "authenticator") {
    return User.create({
      ...base,
      twoFactorSecretEncrypted: encryptSecret(TOTP_SECRET_PLAIN),
    });
  }
  return User.create(base);
};

const makeToken = (u: { _id: unknown; email: string; role: string }) =>
  createToken(
    { id: String(u._id), email: u.email, role: u.role },
    TEST_SECRET,
    "1h"
  );

interface TLoginChallenge {
  token: string;
  method?: string;
  otpSent?: boolean;
}

const loginForChallenge = async (email: string): Promise<TLoginChallenge> => {
  const res = await request(app)
    .post("/auth/login")
    .send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  expect(res.body.data.twoFactorRequired).toBe(true);
  expect(res.body.data.accessToken).toBeUndefined();
  return {
    token: res.body.data.challengeToken as string,
    method: res.body.data.method as string | undefined,
    otpSent: res.body.data.otpSent as boolean | undefined,
  };
};

const lastDeliveredOtp = (): string => {
  const calls = mockSendOtp.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return String(calls[calls.length - 1][1]);
};

const challengeByToken = (token: string) =>
  AuthChallenge.findOne({ tokenHash: hashChallengeToken(token) });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

beforeEach(() => {
  mockSendOtp.mockReset();
  mockSendOtp.mockResolvedValue(undefined);
  mockVerifyGoogle.mockReset();
});

afterEach(async () => {
  await User.deleteMany({});
  await AuthChallenge.deleteMany({});
});

describe("login — method comes from the database only", () => {
  it("email-method login auto-sends an OTP and advertises only the email method", async () => {
    const user = await createTwoFaUser({ method: "email" });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.twoFactorRequired).toBe(true);
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.body.data.method).toBe("email");
    expect(res.body.data.methods).toEqual(["email"]);
    expect(res.body.data.otpSent).toBe(true);
    expect(res.body.data.maskedEmail).toContain("@example.com");
    expect(mockSendOtp).toHaveBeenCalledTimes(1);
    expect(mockSendOtp).toHaveBeenCalledWith(user.email, expect.any(String));
    const sent = lastDeliveredOtp();
    expect(sent).toMatch(/^\d{6}$/);
    expect(JSON.stringify(res.body)).not.toContain(sent);
  });

  it("authenticator-method login advertises totp + recovery and sends no email", async () => {
    const user = await createTwoFaUser({ method: "authenticator" });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.method).toBe("authenticator");
    expect(res.body.data.methods).toEqual(["totp", "recovery"]);
    expect(res.body.data.otpSent).toBeUndefined();
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it("Google login cannot bypass the active second factor", async () => {
    const user = await createTwoFaUser({
      method: "email",
      googleSubject: "google-sub-1",
    });
    mockVerifyGoogle.mockResolvedValue({
      sub: "google-sub-1",
      email: user.email,
      emailVerified: true,
      name: "Otp User",
      picture: "",
    });

    const res = await request(app)
      .post("/auth/google")
      .send({ idToken: "any-token" });

    expect(res.status).toBe(200);
    expect(res.body.data.twoFactorRequired).toBe(true);
    expect(res.body.data.method).toBe("email");
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});

describe("challenge info — active method only", () => {
  it("returns the active method, masked email, and auto-send state, never secrets", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const { token } = await loginForChallenge(user.email);

    const res = await request(app)
      .post("/auth/2fa/challenge-info")
      .send({ challengeToken: token });

    expect(res.status).toBe(200);
    expect(res.body.data.method).toBe("email");
    expect(res.body.data.methods).toEqual(["email"]);
    expect(res.body.data.emailOtpSent).toBe(true);
    expect(res.body.data.maskedEmail).toContain("@example.com");
    expect(res.body.data.maskedEmail).not.toContain(user.email);
    expect(typeof res.body.data.expiresInSeconds).toBe("number");

    const body = JSON.stringify(res.body);
    expect(body).not.toContain("tokenHash");
    expect(body).not.toContain("emailOtpHash");
  });

  it("authenticator method reports totp + recovery and no email method", async () => {
    const user = await createTwoFaUser({ method: "authenticator" });
    const { token } = await loginForChallenge(user.email);

    const res = await request(app)
      .post("/auth/2fa/challenge-info")
      .send({ challengeToken: token });

    expect(res.status).toBe(200);
    expect(res.body.data.method).toBe("authenticator");
    expect(res.body.data.methods).toEqual(["totp", "recovery"]);
  });

  it("rejects an unknown challenge", async () => {
    const res = await request(app)
      .post("/auth/2fa/challenge-info")
      .send({ challengeToken: "not-a-real-token" });
    expect(res.status).toBe(401);
  });
});

describe("email OTP send — email method only", () => {
  it("sends a 6-digit code and never returns the code or its hash", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const { token } = await loginForChallenge(user.email);
    await sleep(1100);

    const res = await request(app)
      .post("/auth/2fa/email/send")
      .send({ challengeToken: token });

    expect(res.status).toBe(200);
    expect(res.body.data.maskedEmail).toContain("@example.com");
    expect(res.body.data.cooldownSeconds).toBeGreaterThan(0);
    expect(res.body.data.expiresInSeconds).toBeGreaterThan(0);

    const code = lastDeliveredOtp();
    expect(code).toMatch(/^\d{6}$/);
    expect(mockSendOtp).toHaveBeenLastCalledWith(user.email, code);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(code);
    expect(body).not.toContain(hashEmailOtp(code));
    expect(body).not.toContain("emailOtpHash");

    const challenge = await challengeByToken(token);
    expect(challenge?.emailOtpHash).toBe(hashEmailOtp(code));
    expect(challenge?.emailOtpHash).not.toContain(code);
  });

  it("rejects an invalid challenge", async () => {
    const res = await request(app)
      .post("/auth/2fa/email/send")
      .send({ challengeToken: "bogus" });
    expect(res.status).toBe(401);
  });

  it("refuses to send when the active method is the authenticator app", async () => {
    const user = await createTwoFaUser({ method: "authenticator" });
    const { token } = await loginForChallenge(user.email);

    const res = await request(app)
      .post("/auth/2fa/email/send")
      .send({ challengeToken: token });

    expect(res.status).toBe(400);
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it("refuses to send for an email-method account whose email was unverified", async () => {
    const user = await createTwoFaUser({
      method: "email",
      emailVerified: false,
    });
    const { token } = await loginForChallenge(user.email);

    const res = await request(app)
      .post("/auth/2fa/email/send")
      .send({ challengeToken: token });

    expect(res.status).toBe(403);
    expect(mockSendOtp).not.toHaveBeenCalled(); // login auto-send skipped: unverified
  });

  it("enforces the resend cooldown (login auto-send counts as the first send)", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const { token } = await loginForChallenge(user.email);

    const immediate = await request(app)
      .post("/auth/2fa/email/send")
      .send({ challengeToken: token });
    expect(immediate.status).toBe(429);

    // Test-env cooldown is 1 second (EMAIL_OTP_COOLDOWN_MS in setupEnv).
    await sleep(1100);
    const afterCooldown = await request(app)
      .post("/auth/2fa/email/send")
      .send({ challengeToken: token });
    expect(afterCooldown.status).toBe(200);
  });

  it("a resent code replaces the previous code", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const { token } = await loginForChallenge(user.email);
    const autoCode = lastDeliveredOtp();

    await sleep(1100);
    const resend = await request(app)
      .post("/auth/2fa/email/send")
      .send({ challengeToken: token });
    expect(resend.status).toBe(200);
    const secondCode = lastDeliveredOtp();
    expect(secondCode).not.toBe(autoCode);

    // Only the newest code is stored.
    const challenge = await challengeByToken(token);
    expect(challenge?.emailOtpHash).toBe(hashEmailOtp(secondCode));

    const verify = await request(app)
      .post("/auth/2fa/email/verify")
      .send({ challengeToken: token, code: secondCode });
    expect(verify.status).toBe(200);
  });

  it("enforces the per-challenge send cap", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const { token } = await loginForChallenge(user.email);
    await challengeByToken(token).then((challenge) =>
      AuthChallenge.updateOne(
        { _id: challenge!._id },
        { $set: { emailOtpSendCount: 5 } }
      )
    );

    const res = await request(app)
      .post("/auth/2fa/email/send")
      .send({ challengeToken: token });
    expect(res.status).toBe(429);
  });

  it("enforces the per-account send window", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const { token } = await loginForChallenge(user.email);
    const now = Date.now();
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          emailOtpSendLog: [
            new Date(now),
            new Date(now - 1000),
            new Date(now - 2000),
            new Date(now - 3000),
            new Date(now - 4000),
          ],
        },
      }
    );

    const res = await request(app)
      .post("/auth/2fa/email/send")
      .send({ challengeToken: token });
    expect(res.status).toBe(429);
  });

  it("handles delivery failure with a generic error and no usable code", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const { token } = await loginForChallenge(user.email);
    await sleep(1100);
    mockSendOtp.mockRejectedValueOnce(new Error("smtp credentials leaked?"));

    const res = await request(app)
      .post("/auth/2fa/email/send")
      .send({ challengeToken: token });

    expect(res.status).toBe(502);
    expect(res.body.message).toBe(
      "We could not send the verification email. Please try again."
    );
    expect(JSON.stringify(res.body)).not.toContain("smtp");

    // The never-delivered code must not be usable.
    const challenge = await challengeByToken(token);
    expect(challenge?.emailOtpHash).toBeNull();
  });
});

describe("email OTP verification", () => {
  it("accepts the correct auto-sent code and issues a session", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const { token } = await loginForChallenge(user.email);
    const code = lastDeliveredOtp();

    const res = await request(app)
      .post("/auth/2fa/email/verify")
      .send({ challengeToken: token, code });

    expect(res.status).toBe(200);
    const accessToken = res.body.data.accessToken;
    expect(accessToken).toBeTruthy();
    const decoded = jwt.verify(accessToken, TEST_SECRET) as {
      id: string;
      email: string;
    };
    expect(decoded.email).toBe(user.email);
    expect(decoded.id).toBe(String(user._id));
  });

  it("rejects an incorrect code and burns the challenge", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const { token } = await loginForChallenge(user.email);
    const code = lastDeliveredOtp();

    const wrong = await request(app)
      .post("/auth/2fa/email/verify")
      .send({ challengeToken: token, code: "999999" });
    expect(wrong.status).toBe(401);

    // The challenge is single-use: even the correct code fails afterwards.
    const retry = await request(app)
      .post("/auth/2fa/email/verify")
      .send({ challengeToken: token, code });
    expect(retry.status).toBe(401);
  });

  it("rejects an expired code", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const { token } = await loginForChallenge(user.email);
    const code = lastDeliveredOtp();
    await challengeByToken(token).then((challenge) =>
      AuthChallenge.updateOne(
        { _id: challenge!._id },
        { $set: { emailOtpExpiresAt: new Date(Date.now() - 1000) } }
      )
    );

    const res = await request(app)
      .post("/auth/2fa/email/verify")
      .send({ challengeToken: token, code });
    expect(res.status).toBe(401);
  });

  it("rejects verification without a prior send", async () => {
    // emailVerified: false skips the login auto-send — no OTP exists.
    const user = await createTwoFaUser({
      method: "email",
      emailVerified: false,
    });
    const { token } = await loginForChallenge(user.email);

    const res = await request(app)
      .post("/auth/2fa/email/verify")
      .send({ challengeToken: token, code: "123456" });
    expect(res.status).toBe(401);
  });

  it("cannot replay a successful verification to create a second session", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const { token } = await loginForChallenge(user.email);
    const code = lastDeliveredOtp();

    const first = await request(app)
      .post("/auth/2fa/email/verify")
      .send({ challengeToken: token, code });
    expect(first.status).toBe(200);

    const replay = await request(app)
      .post("/auth/2fa/email/verify")
      .send({ challengeToken: token, code });
    expect(replay.status).toBe(401);
    expect(replay.body.data?.accessToken).toBeUndefined();
  });

  it("allows only one of two concurrent verifications to succeed", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const { token } = await loginForChallenge(user.email);
    const code = lastDeliveredOtp();

    const [a, b] = await Promise.all([
      request(app)
        .post("/auth/2fa/email/verify")
        .send({ challengeToken: token, code }),
      request(app)
        .post("/auth/2fa/email/verify")
        .send({ challengeToken: token, code }),
    ]);

    const successes = [a, b].filter((r) => r.status === 200);
    expect(successes).toHaveLength(1);
  });

  it("cannot verify one user's code against another user's challenge", async () => {
    const userA = await createTwoFaUser({ method: "email" });
    await loginForChallenge(userA.email);
    const codeA = lastDeliveredOtp();
    const userB = await createTwoFaUser({ method: "email" });
    const { token: tokenB } = await loginForChallenge(userB.email);

    const res = await request(app)
      .post("/auth/2fa/email/verify")
      .send({ challengeToken: tokenB, code: codeA });
    expect(res.status).toBe(401);
  });

  it("rejects a malformed code", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const { token } = await loginForChallenge(user.email);

    const res = await request(app)
      .post("/auth/2fa/email/verify")
      .send({ challengeToken: token, code: "12ab56" });
    expect(res.status).toBe(400);
  });
});

describe("method scoping on one challenge", () => {
  it("an email-method user cannot complete login through the TOTP endpoint", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const { token } = await loginForChallenge(user.email);

    const totpCode = await generate({ secret: TOTP_SECRET_PLAIN });
    const res = await request(app)
      .post("/auth/2fa/verify-login")
      .send({ challengeToken: token, code: totpCode });
    expect(res.status).toBe(401);
    expect(res.body.data?.accessToken).toBeUndefined();
  });

  it("an authenticator-method user cannot send or verify an email OTP", async () => {
    const user = await createTwoFaUser({ method: "authenticator" });
    const { token } = await loginForChallenge(user.email);

    const send = await request(app)
      .post("/auth/2fa/email/send")
      .send({ challengeToken: token });
    expect(send.status).toBe(400);

    const verify = await request(app)
      .post("/auth/2fa/email/verify")
      .send({ challengeToken: token, code: "123456" });
    expect(verify.status).toBe(401);
  });

  it("challenge exploration does not consume the challenge", async () => {
    const user = await createTwoFaUser({ method: "authenticator" });
    const { token } = await loginForChallenge(user.email);

    await request(app)
      .post("/auth/2fa/challenge-info")
      .send({ challengeToken: token });

    const totpCode = await generate({ secret: TOTP_SECRET_PLAIN });
    const res = await request(app)
      .post("/auth/2fa/verify-login")
      .send({ challengeToken: token, code: totpCode });
    expect(res.status).toBe(200);
  });

  it("an enrollment OTP cannot complete a login challenge (purpose binding)", async () => {
    const user = await createTwoFaUser({ method: "authenticator" });
    const token = makeToken(user);

    // Enrollment OTP (purpose ENABLE_EMAIL_2FA).
    await request(app)
      .post("/auth/2fa/email-otp/enroll/send")
      .set({ authorization: token });
    const enrollmentCode = lastDeliveredOtp();

    // Login challenge for the same user.
    const { token: loginToken } = await loginForChallenge(user.email);

    const res = await request(app)
      .post("/auth/2fa/email/verify")
      .send({ challengeToken: loginToken, code: enrollmentCode });
    expect(res.status).toBe(401);
  });

  it("a login OTP cannot complete an enrollment — method guard rejects first", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const { token: loginToken } = await loginForChallenge(user.email);
    const loginCode = lastDeliveredOtp();
    const sessionToken = makeToken(user);

    // An email-method account is already on email OTP — enrollment refuses
    // (409) before any code is examined, so a login OTP can never complete
    // an enrollment.
    const res = await request(app)
      .post("/auth/2fa/email-otp/enroll/verify")
      .set({ authorization: sessionToken })
      .send({ code: loginCode });
    expect(res.status).toBe(409);

    // And the login OTP was not consumed by the failed enrollment attempt:
    // login still completes with it.
    const verify = await request(app)
      .post("/auth/2fa/email/verify")
      .send({ challengeToken: loginToken, code: loginCode });
    expect(verify.status).toBe(200);
  });
});

describe("email-OTP enrollment (Settings) — single active method", () => {
  it("requires authentication", async () => {
    const send = await request(app).post("/auth/2fa/email-otp/enroll/send");
    expect(send.status).toBe(401);

    const verify = await request(app)
      .post("/auth/2fa/email-otp/enroll/verify")
      .send({ code: "123456" });
    expect(verify.status).toBe(401);
  });

  it("enables email OTP for a 2FA-off account after a correct code", async () => {
    const user = await createTwoFaUser({ method: "none" });
    const token = makeToken(user);

    const send = await request(app)
      .post("/auth/2fa/email-otp/enroll/send")
      .set({ authorization: token });
    expect(send.status).toBe(200);
    const code = lastDeliveredOtp();
    expect(mockSendOtp).toHaveBeenCalledWith(user.email, code);
    expect(JSON.stringify(send.body)).not.toContain(code);

    const wrong = await request(app)
      .post("/auth/2fa/email-otp/enroll/verify")
      .set({ authorization: token })
      .send({ code: "000000" });
    expect(wrong.status).toBe(401);

    const fresh = await User.findById(user._id);
    expect(fresh?.twoFactorMethod).toBe("none");

    await sleep(1100);
    await request(app)
      .post("/auth/2fa/email-otp/enroll/send")
      .set({ authorization: token });
    const freshCode = lastDeliveredOtp();

    const verify = await request(app)
      .post("/auth/2fa/email-otp/enroll/verify")
      .set({ authorization: token })
      .send({ code: freshCode });
    expect(verify.status).toBe(200);
    expect(verify.body.data.twoFactorMethod).toBe("email");

    const updated = await User.findById(user._id).select(
      "+twoFactorRecoveryCodes"
    );
    expect(updated?.twoFactorMethod).toBe("email");
    expect(updated?.twoFactorEnabled).toBe(true);
    expect(updated?.twoFactorSecretEncrypted).toBeFalsy();
    expect(updated?.twoFactorRecoveryCodes).toHaveLength(0);
  });

  it("switches an authenticator account to email OTP and clears TOTP material", async () => {
    const user = await createTwoFaUser({ method: "authenticator" });
    const token = makeToken(user);

    const send = await request(app)
      .post("/auth/2fa/email-otp/enroll/send")
      .set({ authorization: token });
    expect(send.status).toBe(200);
    const code = lastDeliveredOtp();

    const verify = await request(app)
      .post("/auth/2fa/email-otp/enroll/verify")
      .set({ authorization: token })
      .send({ code });
    expect(verify.status).toBe(200);

    const updated = await User.findById(user._id).select(
      "+twoFactorSecretEncrypted"
    );
    expect(updated?.twoFactorMethod).toBe("email");
    expect(updated?.twoFactorSecretEncrypted).toBeFalsy();

    // Login now requires the email method — TOTP endpoint refuses.
    const { token: loginToken } = await loginForChallenge(user.email);
    const totpCode = await generate({ secret: TOTP_SECRET_PLAIN });
    const res = await request(app)
      .post("/auth/2fa/verify-login")
      .send({ challengeToken: loginToken, code: totpCode });
    expect(res.status).toBe(401);
  });

  it("refuses enrollment when email OTP is already the active method", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const token = makeToken(user);

    const res = await request(app)
      .post("/auth/2fa/email-otp/enroll/send")
      .set({ authorization: token });
    expect(res.status).toBe(409);
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it("refuses enrollment for unverified account emails", async () => {
    const user = await createTwoFaUser({
      method: "none",
      emailVerified: false,
    });
    const token = makeToken(user);

    const res = await request(app)
      .post("/auth/2fa/email-otp/enroll/send")
      .set({ authorization: token });
    expect(res.status).toBe(403);
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it("a failed enrollment never disables the active authenticator method", async () => {
    const user = await createTwoFaUser({ method: "authenticator" });
    const token = makeToken(user);

    await request(app)
      .post("/auth/2fa/email-otp/enroll/send")
      .set({ authorization: token });
    const code = lastDeliveredOtp();
    void code;

    const wrong = await request(app)
      .post("/auth/2fa/email-otp/enroll/verify")
      .set({ authorization: token })
      .send({ code: "000000" });
    expect(wrong.status).toBe(401);

    const fresh = await User.findById(user._id).select(
      "+twoFactorSecretEncrypted"
    );
    expect(fresh?.twoFactorMethod).toBe("authenticator");
    expect(fresh?.twoFactorSecretEncrypted).toBeTruthy();

    // Authenticator login still works end-to-end.
    const { token: loginToken } = await loginForChallenge(user.email);
    const totpCode = await generate({ secret: TOTP_SECRET_PLAIN });
    const res = await request(app)
      .post("/auth/2fa/verify-login")
      .send({ challengeToken: loginToken, code: totpCode });
    expect(res.status).toBe(200);
  });

  it("allows only one of two concurrent enrollment verifications to succeed", async () => {
    const user = await createTwoFaUser({ method: "none" });
    const token = makeToken(user);

    await request(app)
      .post("/auth/2fa/email-otp/enroll/send")
      .set({ authorization: token });
    const code = lastDeliveredOtp();

    const [a, b] = await Promise.all([
      request(app)
        .post("/auth/2fa/email-otp/enroll/verify")
        .set({ authorization: token })
        .send({ code }),
      request(app)
        .post("/auth/2fa/email-otp/enroll/verify")
        .set({ authorization: token })
        .send({ code }),
    ]);

    const successes = [a, b].filter((r) => r.status === 200);
    expect(successes).toHaveLength(1);
  });
});

describe("disable and regenerate — method aware", () => {
  it("disables the email method with password re-authentication only", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const token = makeToken(user);

    const res = await request(app)
      .post("/auth/2fa/disable")
      .set({ authorization: token })
      .send({ password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.twoFactorMethod).toBe("none");

    const fresh = await User.findById(user._id);
    expect(fresh?.twoFactorEnabled).toBe(false);
    expect(fresh?.twoFactorMethod).toBe("none");
  });

  it("disabling the authenticator method still requires a code", async () => {
    const user = await createTwoFaUser({ method: "authenticator" });
    const token = makeToken(user);

    const noCode = await request(app)
      .post("/auth/2fa/disable")
      .set({ authorization: token })
      .send({ password: PASSWORD });
    expect(noCode.status).toBe(400);
  });

  it("refuses recovery-code regeneration for the email method", async () => {
    const user = await createTwoFaUser({ method: "email" });
    const token = makeToken(user);

    const res = await request(app)
      .post("/auth/2fa/recovery-codes/regenerate")
      .set({ authorization: token })
      .send({ password: PASSWORD, code: "anything" });
    expect(res.status).toBe(409);
  });
});

describe("legacy documents (created before twoFactorMethod existed)", () => {
  it("interprets twoFactorEnabled without a method field as authenticator", async () => {
    userCounter += 1;
    const hashed = await bcrypt.hash(PASSWORD, 4);
    const legacy = await User.collection.insertOne({
      name: "Legacy User",
      email: `legacy-${userCounter}-${Date.now()}@example.com`,
      password: hashed,
      twoFactorEnabled: true,
      emailVerified: true,
      role: "USER",
      status: "ACTIVE",
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const doc = await User.findById(legacy.insertedId);
    expect(doc?.twoFactorMethod).toBeUndefined();

    const res = await request(app)
      .post("/auth/login")
      .send({ email: doc!.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.twoFactorRequired).toBe(true);
    expect(res.body.data.method).toBe("authenticator");

    // Status endpoint derives + backfills.
    const sessionToken = makeToken({
      _id: doc!._id,
      email: doc!.email,
      role: "USER",
    });
    const status = await request(app)
      .get("/auth/2fa/status")
      .set({ authorization: sessionToken });
    expect(status.status).toBe(200);
    expect(status.body.data.twoFactorMethod).toBe("authenticator");
    expect(status.body.data.authenticatorActive).toBe(true);

    const backfilled = await User.findById(doc!._id);
    expect(backfilled?.twoFactorMethod).toBe("authenticator");
  });

  it("migrateLegacyTwoFactorMethods backfills enabled → authenticator, rest → none", async () => {
    userCounter += 1;
    const stamp = Date.now();
    await User.collection.insertMany([
      {
        name: "Legacy On",
        email: `legacy-on-${stamp}@example.com`,
        twoFactorEnabled: true,
        role: "USER",
        status: "ACTIVE",
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: "Legacy Off",
        email: `legacy-off-${stamp}@example.com`,
        twoFactorEnabled: false,
        role: "USER",
        status: "ACTIVE",
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await UserServices.migrateLegacyTwoFactorMethods();

    const on = await User.findOne({ email: `legacy-on-${stamp}@example.com` });
    const off = await User.findOne({ email: `legacy-off-${stamp}@example.com` });
    expect(on?.twoFactorMethod).toBe("authenticator");
    expect(off?.twoFactorMethod).toBe("none");

    // Idempotent — a second run changes nothing.
    await UserServices.migrateLegacyTwoFactorMethods();
    const again = await User.findOne({ email: `legacy-on-${stamp}@example.com` });
    expect(again?.twoFactorMethod).toBe("authenticator");
  });
});

describe("account-email verification (Settings)", () => {
  it("requires authentication", async () => {
    const res = await request(app).post("/auth/email-verification/send");
    expect(res.status).toBe(401);
  });

  it("sends a code, verifies it, and marks the email verified", async () => {
    const user = await createTwoFaUser({ emailVerified: false });
    const token = makeToken(user);

    const send = await request(app)
      .post("/auth/email-verification/send")
      .set({ authorization: token });
    expect(send.status).toBe(200);
    const code = lastDeliveredOtp();
    expect(mockSendOtp).toHaveBeenCalledWith(user.email, code);
    expect(JSON.stringify(send.body)).not.toContain(code);

    const wrong = await request(app)
      .post("/auth/email-verification/verify")
      .set({ authorization: token })
      .send({ code: "000000" });
    expect(wrong.status).toBe(401);

    await sleep(1100);
    await request(app)
      .post("/auth/email-verification/send")
      .set({ authorization: token });
    const freshCode = lastDeliveredOtp();

    const verify = await request(app)
      .post("/auth/email-verification/verify")
      .set({ authorization: token })
      .send({ code: freshCode });
    expect(verify.status).toBe(200);

    const fresh = await User.findById(user._id);
    expect(fresh?.emailVerified).toBe(true);
  });

  it("refuses to re-verify an already verified email", async () => {
    const user = await createTwoFaUser({ emailVerified: true });
    const token = makeToken(user);

    const res = await request(app)
      .post("/auth/email-verification/send")
      .set({ authorization: token });
    expect(res.status).toBe(409);
  });
});
