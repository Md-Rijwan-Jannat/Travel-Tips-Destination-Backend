import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { generate, generateSecret } from "otplib";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import globalErrorHandler from "../app/middlewares/globalErrorhandler";
import { AuthRoutes } from "../app/module/Auth/auth.routes";
import { User } from "../app/module/User/user.model";
import { AuthChallenge } from "../app/module/Auth/authChallenge.model";
import { createToken } from "../app/utils/tokenGenerateFunction";
import { verifyGoogleIdToken } from "../app/utils/googleAuth";

// Google OAuth: the official verifier is mocked — these tests cover account
// resolution, linking safety, 2FA interaction and error handling, not the
// crypto of Google's ID tokens (that is google-auth-library's job).

vi.mock("../app/utils/googleAuth", () => ({
  verifyGoogleIdToken: vi.fn(),
}));

const mockedVerify = vi.mocked(verifyGoogleIdToken);

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

const identity = (
  overrides: Partial<{
    sub: string;
    email: string;
    emailVerified: boolean;
    name: string;
    picture: string;
  }> = {}
) => ({
  sub: "google-sub-123",
  email: "guser@example.com",
  emailVerified: true,
  name: "Google User",
  picture: "https://example.com/pic.jpg",
  ...overrides,
});

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
  mockedVerify.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /auth/google — registration and login", () => {
  it("creates a new account for a valid Google identity (2FA OFF by default)", async () => {
    mockedVerify.mockResolvedValue(identity());

    const res = await request(app)
      .post("/auth/google")
      .send({ idToken: "valid-google-token" });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();

    const created = await User.findOne({ email: "guser@example.com" });
    expect(created).toBeTruthy();
    expect(created?.googleSubject).toBe("google-sub-123");
    expect(created?.twoFactorEnabled).toBe(false);
    expect(created?.role).toBe("USER");
    // Passwordless OAuth account — no password route access.
    expect(created?.password).toBeFalsy();
  });

  it("signs in an existing linked Google account without creating duplicates", async () => {
    mockedVerify.mockResolvedValue(identity());

    await request(app).post("/auth/google").send({ idToken: "t1" });
    const second = await request(app)
      .post("/auth/google")
      .send({ idToken: "t2" });

    expect(second.status).toBe(200);
    expect(await User.countDocuments({ email: "guser@example.com" })).toBe(1);
  });

  it("rejects an invalid Google token", async () => {
    mockedVerify.mockRejectedValue(new Error("Invalid token"));

    const res = await request(app)
      .post("/auth/google")
      .send({ idToken: "bad-token" });

    expect(res.status).toBe(401);
    expect(res.body.data?.accessToken).toBeUndefined();
    expect(await User.countDocuments({})).toBe(0);
  });

  it("rejects a Google identity whose email is unverified", async () => {
    mockedVerify.mockResolvedValue(identity({ emailVerified: false }));

    const res = await request(app)
      .post("/auth/google")
      .send({ idToken: "unverified" });

    expect(res.status).toBe(403);
    expect(await User.countDocuments({})).toBe(0);
  });

  it("does not auto-link or take over an existing password account", async () => {
    await User.create({
      name: "Password User",
      email: "guser@example.com",
      password: PASSWORD,
    });
    mockedVerify.mockResolvedValue(identity());

    const res = await request(app)
      .post("/auth/google")
      .send({ idToken: "takeover-attempt" });

    expect(res.status).toBe(409);
    expect(res.body.data?.accessToken).toBeUndefined();

    const existing = await User.findOne({ email: "guser@example.com" }).select(
      "+password"
    );
    expect(existing?.googleSubject).toBeFalsy();
    // Password remains the only credential — account was not hijacked.
    expect(existing?.password).toBeTruthy();
  });

  it("preserves role and premium status of an already-linked account", async () => {
    const admin = await User.create({
      name: "Admin",
      email: "admin-linked@example.com",
      password: PASSWORD,
      role: "ADMIN",
      verified: true,
    });
    mockedVerify.mockResolvedValue(
      identity({ sub: "admin-google-sub", email: "admin-linked@example.com" })
    );
    await User.updateOne(
      { _id: admin._id },
      { $set: { googleSubject: "admin-google-sub" } }
    );

    const res = await request(app)
      .post("/auth/google")
      .send({ idToken: "admin-token" });

    expect(res.status).toBe(200);
    const decodedRole = JSON.parse(
      Buffer.from(res.body.data.accessToken.split(".")[1], "base64").toString()
    );
    expect(decodedRole.role).toBe("ADMIN");

    const stillAdmin = await User.findById(admin._id);
    expect(stillAdmin?.role).toBe("ADMIN");
    expect(stillAdmin?.verified).toBe(true);
  });

  it("rejects sign-in for a blocked account", async () => {
    const blocked = await User.create({
      name: "Blocked",
      email: "blocked@example.com",
      googleSubject: "blocked-sub",
      status: "BLOCKED",
    });
    mockedVerify.mockResolvedValue(
      identity({ sub: "blocked-sub", email: "blocked@example.com" })
    );

    const res = await request(app)
      .post("/auth/google")
      .send({ idToken: "blocked-token" });

    expect(res.status).toBe(403);
    expect(res.body.data?.accessToken).toBeUndefined();
    void blocked;
  });

  it("does not bypass enabled 2FA — returns a challenge with no session", async () => {
    const user = await User.create({
      name: "2FA Google User",
      email: "guser@example.com",
      googleSubject: "google-sub-123",
      twoFactorEnabled: true,
    });
    mockedVerify.mockResolvedValue(identity());

    const res = await request(app)
      .post("/auth/google")
      .send({ idToken: "2fa-google" });

    expect(res.status).toBe(200);
    expect(res.body.data.twoFactorRequired).toBe(true);
    expect(res.body.data.challengeToken).toBeTruthy();
    expect(res.body.data.accessToken).toBeUndefined();

    // Completing 2FA issues the session.
    const { encryptSecret } = await import("../app/utils/twoFactor");
    const enrollSecret = generateSecret();
    await User.updateOne(
      { _id: user._id },
      { $set: { twoFactorSecretEncrypted: encryptSecret(enrollSecret) } }
    );
    const code = await generate({ secret: enrollSecret });
    const verify = await request(app)
      .post("/auth/2fa/verify-login")
      .send({ challengeToken: res.body.data.challengeToken, code });
    expect(verify.status).toBe(200);
    expect(verify.body.data.accessToken).toBeTruthy();
  });

  it("does not expose Google secrets or tokens in responses", async () => {
    mockedVerify.mockResolvedValue(identity());

    const res = await request(app)
      .post("/auth/google")
      .send({ idToken: "valid-google-token" });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain("client_secret");
    expect(body).not.toContain("GOOGLE_CLIENT_SECRET");
    expect(body).not.toContain("valid-google-token");
    // No password hash leakage either.
    expect(body).not.toContain("password");
  });
});

describe("POST /auth/google/link and /unlink", () => {
  const makeUserToken = (u: any) =>
    createToken(
      { id: String(u._id), email: u.email, role: u.role },
      TEST_SECRET,
      "1h"
    );

  it("links Google to an authenticated password account (same email + password re-auth)", async () => {
    const user = await User.create({
      name: "Linker",
      email: "linker@example.com",
      password: PASSWORD,
    });
    const token = makeUserToken(user);
    mockedVerify.mockResolvedValue(
      identity({ sub: "linker-sub", email: "linker@example.com" })
    );

    const res = await request(app)
      .post("/auth/google/link")
      .set({ authorization: token })
      .send({ idToken: "link-token", password: PASSWORD });

    expect(res.status).toBe(200);
    const fresh = await User.findById(user._id);
    expect(fresh?.googleSubject).toBe("linker-sub");
  });

  it("refuses to link when the Google email differs from the account email", async () => {
    const user = await User.create({
      name: "Linker",
      email: "linker@example.com",
      password: PASSWORD,
    });
    const token = makeUserToken(user);
    mockedVerify.mockResolvedValue(
      identity({ sub: "other-sub", email: "other@example.com" })
    );

    const res = await request(app)
      .post("/auth/google/link")
      .set({ authorization: token })
      .send({ idToken: "link-token", password: PASSWORD });

    expect(res.status).toBe(403);
    const fresh = await User.findById(user._id);
    expect(fresh?.googleSubject).toBeFalsy();
  });

  it("refuses to link without the required password re-authentication", async () => {
    const user = await User.create({
      name: "Linker",
      email: "linker@example.com",
      password: PASSWORD,
    });
    const token = makeUserToken(user);
    mockedVerify.mockResolvedValue(
      identity({ sub: "linker-sub", email: "linker@example.com" })
    );

    const res = await request(app)
      .post("/auth/google/link")
      .set({ authorization: token })
      .send({ idToken: "link-token" });

    expect(res.status).toBe(403);
  });

  it("unlinks Google only when a password remains", async () => {
    const user = await User.create({
      name: "Linker",
      email: "linker@example.com",
      password: PASSWORD,
      googleSubject: "linker-sub",
    });
    const token = makeUserToken(user);

    const res = await request(app)
      .post("/auth/google/unlink")
      .set({ authorization: token })
      .send({ password: PASSWORD });

    expect(res.status).toBe(200);
    const fresh = await User.findById(user._id);
    expect(fresh?.googleSubject).toBeFalsy();
  });

  it("blocks unlink when Google is the only sign-in method", async () => {
    const user = await User.create({
      name: "Google Only",
      email: "gonly@example.com",
      googleSubject: "gonly-sub",
    });
    const token = makeUserToken(user);

    const res = await request(app)
      .post("/auth/google/unlink")
      .set({ authorization: token })
      .send({});

    expect(res.status).toBe(403);
    const fresh = await User.findById(user._id);
    expect(fresh?.googleSubject).toBe("gonly-sub");
  });

  it("requires authentication for link/unlink", async () => {
    const linkRes = await request(app)
      .post("/auth/google/link")
      .send({ idToken: "x" });
    expect(linkRes.status).toBe(401);

    const unlinkRes = await request(app)
      .post("/auth/google/unlink")
      .send({});
    expect(unlinkRes.status).toBe(401);
  });
});
