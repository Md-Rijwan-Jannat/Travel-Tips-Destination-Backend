import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { generate } from "otplib";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import globalErrorHandler from "../app/middlewares/globalErrorhandler";
import { AuthRoutes } from "../app/module/Auth/auth.routes";
import { User } from "../app/module/User/user.model";
import { AuthChallenge } from "../app/module/Auth/authChallenge.model";
import { createToken } from "../app/utils/tokenGenerateFunction";
import { decryptSecret } from "../app/utils/twoFactor";

// 2FA: TOTP enrollment, login challenges, recovery codes, disable flows.
// Secrets/keys here are test-only fixtures, never real credentials.

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

let user: any;
let userToken: string;

const authHeader = (token: string) => ({ authorization: token });

const makeToken = (u: { _id: unknown; email: string; role: string }) =>
  createToken(
    { id: String(u._id), email: u.email, role: u.role },
    TEST_SECRET,
    "1h"
  );

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await AuthChallenge.deleteMany({});

  user = await User.create({
    name: "Totp User",
    email: "totp@example.com",
    password: PASSWORD,
  });
  userToken = makeToken(user);
});

/** Drive the full enrollment flow and return the plaintext secret. */
const enrollAndEnable = async (token: string) => {
  const enroll = await request(app)
    .post("/auth/2fa/enroll")
    .set(authHeader(token))
    .send({ password: PASSWORD });
  expect(enroll.status).toBe(200);
  const { secret, otpauthUrl, qrCodeDataUrl } = enroll.body.data;
  expect(secret).toBeTruthy();
  expect(otpauthUrl).toContain("otpauth://totp/");
  expect(qrCodeDataUrl).toContain("data:image/png;base64,");

  const code = await generate({ secret });
  const verify = await request(app)
    .post("/auth/2fa/verify-enrollment")
    .set(authHeader(token))
    .send({ code });
  expect(verify.status).toBe(200);
  expect(verify.body.data.recoveryCodes).toHaveLength(10);
  return { secret, recoveryCodes: verify.body.data.recoveryCodes as string[] };
};

describe("2FA defaults and password login", () => {
  it("defaults 2FA to OFF for newly registered users", async () => {
    const res = await request(app).post("/auth/register").send({
      name: "New User",
      email: "new2fa@example.com",
      password: "NewPass12345",
    });
    expect(res.status).toBe(200);
    const created = await User.findOne({ email: "new2fa@example.com" });
    expect(created?.twoFactorEnabled).toBe(false);
  });

  it("password login works normally when 2FA is disabled", async () => {
    const res = await request(app).post("/auth/login").send({
      email: user.email,
      password: PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.twoFactorRequired).toBeUndefined();
  });

  it("password login with 2FA enabled returns a challenge and NO session", async () => {
    await enrollAndEnable(userToken);

    const res = await request(app).post("/auth/login").send({
      email: user.email,
      password: PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.twoFactorRequired).toBe(true);
    expect(res.body.data.challengeToken).toBeTruthy();
    // No full-access credentials before the second factor is verified.
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});

describe("2FA enrollment", () => {
  it("enrollment requires recent password re-authentication", async () => {
    const res = await request(app)
      .post("/auth/2fa/enroll")
      .set(authHeader(userToken))
      .send({});
    expect(res.status).toBe(403);
  });

  it("rejects an invalid enrollment OTP and does not enable 2FA", async () => {
    const enroll = await request(app)
      .post("/auth/2fa/enroll")
      .set(authHeader(userToken))
      .send({ password: PASSWORD });
    expect(enroll.status).toBe(200);

    const verify = await request(app)
      .post("/auth/2fa/verify-enrollment")
      .set(authHeader(userToken))
      .send({ code: "000000" });
    expect(verify.status).toBe(401);

    const fresh = await User.findById(user._id);
    expect(fresh?.twoFactorEnabled).toBe(false);
  });

  it("enables 2FA only after successful verification and stores no plaintext secret", async () => {
    await enrollAndEnable(userToken);
    const fresh = await User.findById(user._id).select(
      "+twoFactorSecretEncrypted +twoFactorRecoveryCodes"
    );
    expect(fresh?.twoFactorEnabled).toBe(true);
    // Encrypted at rest, not the base32 secret itself.
    expect(fresh?.twoFactorSecretEncrypted).toBeTruthy();
    expect(fresh?.twoFactorSecretEncrypted).toContain(".");
    expect(fresh?.twoFactorRecoveryCodes).toHaveLength(10);
    expect(fresh?.twoFactorRecoveryCodes[0].hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("unauthenticated users cannot enroll", async () => {
    const res = await request(app)
      .post("/auth/2fa/enroll")
      .send({ password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it("never exposes secrets or recovery hashes in the status endpoint", async () => {
    await enrollAndEnable(userToken);
    const res = await request(app)
      .get("/auth/2fa/status")
      .set(authHeader(userToken));
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("twoFactorSecretEncrypted");
    expect(body).not.toContain("twoFactorRecoveryCodes");
    expect(body).not.toContain("twoFactorPendingSecretEncrypted");
    expect(res.body.data.twoFactorEnabled).toBe(true);
  });
});

describe("2FA login challenge", () => {
  it("completes login with a valid TOTP and issues a normal JWT", async () => {
    const { secret } = await enrollAndEnable(userToken);

    const login = await request(app).post("/auth/login").send({
      email: user.email,
      password: PASSWORD,
    });
    const challengeToken = login.body.data.challengeToken;

    const code = await generate({ secret });
    const verify = await request(app)
      .post("/auth/2fa/verify-login")
      .send({ challengeToken, code });

    expect(verify.status).toBe(200);
    const accessToken = verify.body.data.accessToken;
    expect(accessToken).toBeTruthy();
    const decoded = jwt.verify(accessToken, TEST_SECRET) as {
      id: string;
      email: string;
    };
    expect(decoded.email).toBe(user.email);
    expect(decoded.id).toBe(String(user._id));
  });

  it("rejects an invalid OTP and burns the challenge", async () => {
    await enrollAndEnable(userToken);
    const login = await request(app).post("/auth/login").send({
      email: user.email,
      password: PASSWORD,
    });
    const challengeToken = login.body.data.challengeToken;

    const bad = await request(app)
      .post("/auth/2fa/verify-login")
      .send({ challengeToken, code: "000000" });
    expect(bad.status).toBe(401);
    expect(bad.body.data?.accessToken).toBeUndefined();

    // Challenge was consumed — a retry with a valid code must fail too.
    const fresh = await User.findById(user._id).select(
      "+twoFactorSecretEncrypted"
    );
    const plainSecret = decryptSecret(fresh!.twoFactorSecretEncrypted!);
    const code = await generate({ secret: plainSecret });
    const replay = await request(app)
      .post("/auth/2fa/verify-login")
      .send({ challengeToken, code });
    expect(replay.status).toBe(401);
  });

  it("rejects a forged or unknown challenge token", async () => {
    const res = await request(app)
      .post("/auth/2fa/verify-login")
      .send({ challengeToken: "not-a-real-token", code: "123456" });
    expect(res.status).toBe(401);
  });

  it("cannot replay a consumed challenge", async () => {
    const { secret } = await enrollAndEnable(userToken);
    const login = await request(app).post("/auth/login").send({
      email: user.email,
      password: PASSWORD,
    });
    const challengeToken = login.body.data.challengeToken;
    const code = await generate({ secret });

    const first = await request(app)
      .post("/auth/2fa/verify-login")
      .send({ challengeToken, code });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/auth/2fa/verify-login")
      .send({ challengeToken, code });
    expect(second.status).toBe(401);
    expect(second.body.data?.accessToken).toBeUndefined();
  });
});

describe("2FA recovery codes", () => {
  it("recovery codes are single-use", async () => {
    const { recoveryCodes } = await enrollAndEnable(userToken);

    const login = await request(app).post("/auth/login").send({
      email: user.email,
      password: PASSWORD,
    });
    const challengeToken = login.body.data.challengeToken;

    const first = await request(app)
      .post("/auth/2fa/verify-login")
      .send({ challengeToken, code: recoveryCodes[0] });
    expect(first.status).toBe(200);

    const login2 = await request(app).post("/auth/login").send({
      email: user.email,
      password: PASSWORD,
    });
    const second = await request(app)
      .post("/auth/2fa/verify-login")
      .send({
        challengeToken: login2.body.data.challengeToken,
        code: recoveryCodes[0],
      });
    expect(second.status).toBe(401);
  });

  it("concurrent recovery-code attempts cannot both succeed", async () => {
    const { recoveryCodes } = await enrollAndEnable(userToken);

    const login = await request(app).post("/auth/login").send({
      email: user.email,
      password: PASSWORD,
    });
    const challengeToken = login.body.data.challengeToken;

    const [a, b] = await Promise.all([
      request(app)
        .post("/auth/2fa/verify-login")
        .send({ challengeToken, code: recoveryCodes[1] }),
      request(app)
        .post("/auth/2fa/verify-login")
        .send({ challengeToken, code: recoveryCodes[1] }),
    ]);
    const successes = [a, b].filter((r) => r.status === 200);
    expect(successes).toHaveLength(1);
  });

  it("regenerating recovery codes invalidates all previous codes", async () => {
    const { recoveryCodes } = await enrollAndEnable(userToken);

    const regen = await request(app)
      .post("/auth/2fa/recovery-codes/regenerate")
      .set(authHeader(userToken))
      .send({ password: PASSWORD, code: recoveryCodes[2] });
    expect(regen.status).toBe(200);
    const newCodes = regen.body.data.recoveryCodes as string[];
    expect(newCodes).toHaveLength(10);
    expect(newCodes).not.toContain(recoveryCodes[2]);

    // Old code is dead; new code works at login.
    const login1 = await request(app).post("/auth/login").send({
      email: user.email,
      password: PASSWORD,
    });
    const oldCodeRes = await request(app)
      .post("/auth/2fa/verify-login")
      .send({
        challengeToken: login1.body.data.challengeToken,
        code: recoveryCodes[0],
      });
    expect(oldCodeRes.status).toBe(401);

    const login2 = await request(app).post("/auth/login").send({
      email: user.email,
      password: PASSWORD,
    });
    const newCodeRes = await request(app)
      .post("/auth/2fa/verify-login")
      .send({
        challengeToken: login2.body.data.challengeToken,
        code: newCodes[0],
      });
    expect(newCodeRes.status).toBe(200);
  });
});

describe("2FA disable", () => {
  it("requires a valid current factor to disable", async () => {
    const { recoveryCodes } = await enrollAndEnable(userToken);

    const bad = await request(app)
      .post("/auth/2fa/disable")
      .set(authHeader(userToken))
      .send({ password: PASSWORD, code: "000000" });
    expect(bad.status).toBe(401);

    const stillOn = await User.findById(user._id);
    expect(stillOn?.twoFactorEnabled).toBe(true);

    const ok = await request(app)
      .post("/auth/2fa/disable")
      .set(authHeader(userToken))
      .send({ password: PASSWORD, code: recoveryCodes[3] });
    expect(ok.status).toBe(200);

    const off = await User.findById(user._id).select(
      "+twoFactorSecretEncrypted +twoFactorRecoveryCodes"
    );
    expect(off?.twoFactorEnabled).toBe(false);
    expect(off?.twoFactorSecretEncrypted).toBeNull();
    expect(off?.twoFactorRecoveryCodes).toHaveLength(0);
  });

  it("after disabling, password login issues a full session again", async () => {
    const { recoveryCodes } = await enrollAndEnable(userToken);
    await request(app)
      .post("/auth/2fa/disable")
      .set(authHeader(userToken))
      .send({ password: PASSWORD, code: recoveryCodes[3] });

    const login = await request(app).post("/auth/login").send({
      email: user.email,
      password: PASSWORD,
    });
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toBeTruthy();
  });

  it("a user cannot disable another user's 2FA", async () => {
    await enrollAndEnable(userToken);

    const attacker = await User.create({
      name: "Attacker",
      email: "attacker@example.com",
      password: PASSWORD,
    });
    const attackerToken = makeToken(attacker);

    // Attacker's own disable fails (2FA not enabled on their account)…
    const own = await request(app)
      .post("/auth/2fa/disable")
      .set(authHeader(attackerToken))
      .send({ code: "123456" });
    expect(own.status).toBe(409);

    // …and the victim's 2FA is untouched.
    const victim = await User.findById(user._id);
    expect(victim?.twoFactorEnabled).toBe(true);
  });
});
