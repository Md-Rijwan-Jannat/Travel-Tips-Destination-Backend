import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import globalErrorHandler from "../app/middlewares/globalErrorhandler";
import { AuthRoutes } from "../app/module/Auth/auth.routes";
import { ProfileRoutes } from "../app/module/Profile/profile.routes";
import { UserRoutes } from "../app/module/User/user.routes";
import { User } from "../app/module/User/user.model";
import { createToken } from "../app/utils/tokenGenerateFunction";

// Batch 3 (Sensitive data): password hashes must never leave the API, login
// must keep working now that `password` has `select: false`, and the register
// whitelist must not accept privilege fields.

const TEST_SECRET = process.env.jwt_access_secret as string;

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/auth", AuthRoutes);
  app.use("/profile", ProfileRoutes);
  app.use("/users", UserRoutes);
  app.use(globalErrorHandler);
  return app;
};

let mongod: MongoMemoryServer;
const app = buildApp();

const ORIGINAL_PASSWORD = "OriginalPass123";
const CHANGED_PASSWORD = "ChangedPass456";
const FORGET_PASSWORD = "ForgottenPass789";

let alice: any;
let aliceToken: string;

const expectNoPasswordField = (value: unknown, where: string) => {
  if (value && typeof value === "object") {
    expect(
      "password" in (value as Record<string, unknown>),
      `${where} must not contain a password field`
    ).toBe(false);
  }
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  await Promise.all([User.deleteMany({})]);

  alice = await User.create({
    name: "Alice",
    email: "alice@example.com",
    password: ORIGINAL_PASSWORD,
  });

  aliceToken = createToken(
    { id: String(alice._id), email: alice.email, role: "USER" },
    TEST_SECRET,
    "1h"
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

describe("registration whitelist", () => {
  it("registers a user without accepting privilege fields (200)", async () => {
    const res = await request(app).post("/auth/register").send({
      name: "New User",
      email: "newuser@example.com",
      password: "NewUserPass123",
      // hostile/ignored: must be stripped by the register whitelist
      role: "admin",
      verified: true,
      status: "BLOCKED",
      isDeleted: true,
    });

    expect(res.status).toBe(200);
    const created = res.body?.data?.result;
    expect(created).toBeTruthy();

    // password never serialized (post-save drops the key entirely)
    expectNoPasswordField(created, "register response");

    // privilege fields got model defaults, not client values
    expect(created.role).toBe("USER");
    expect(created.verified).toBe(false);
    expect(created.isDeleted).toBe(false);
    expect(created.status).toBe("IN_PROGRESS");

    // ...and the account can actually log in with the submitted password
    const login = await request(app).post("/auth/login").send({
      email: "newuser@example.com",
      password: "NewUserPass123",
    });
    expect(login.status).toBe(200);
  });
});

describe("login works with password select:false", () => {
  it("accepts the correct password (200)", async () => {
    const res = await request(app).post("/auth/login").send({
      email: "alice@example.com",
      password: ORIGINAL_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.accessToken).toBeTruthy();
  });

  it("rejects a wrong password (403)", async () => {
    const res = await request(app).post("/auth/login").send({
      email: "alice@example.com",
      password: "wrong-password",
    });
    expect(res.status).toBe(403);
  });
});

describe("API responses never contain a password field", () => {
  it("GET /profile (my profile) response has no password", async () => {
    const res = await request(app)
      .get("/profile")
      .set("Authorization", aliceToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeTruthy();
    expectNoPasswordField(res.body.data, "GET /profile");
  });

  it("PATCH /profile/:id response has no password", async () => {
    const res = await request(app)
      .patch(`/profile/${String(alice._id)}`)
      .set("Authorization", aliceToken)
      .send({ name: "Alice Renamed" });
    expect(res.status).toBe(200);
    expectNoPasswordField(res.body.data, "PATCH /profile/:id");
  });

  it("GET /users/normal-users items have no password", async () => {
    const res = await request(app)
      .get("/users/normal-users")
      .set("Authorization", aliceToken);
    expect(res.status).toBe(200);
    const items: unknown[] = res.body.data ?? [];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expectNoPasswordField(item, "user-list item");
    }
  });

  it("change-password response has no password, and the new password works", async () => {
    const res = await request(app)
      .post("/auth/change-password")
      .set("Authorization", aliceToken)
      .send({ email: "alice@example.com", newPassword: CHANGED_PASSWORD });
    expect(res.status).toBe(200);
    expectNoPasswordField(res.body.data, "change-password response");

    // old password no longer works, new one does (hash persisted intact)
    const oldLogin = await request(app).post("/auth/login").send({
      email: "alice@example.com",
      password: ORIGINAL_PASSWORD,
    });
    expect(oldLogin.status).toBe(403);

    const newLogin = await request(app).post("/auth/login").send({
      email: "alice@example.com",
      password: CHANGED_PASSWORD,
    });
    expect(newLogin.status).toBe(200);
  });

  it("forget-password response has no password, and the reset works", async () => {
    // same token shape the reset-link flow issues
    const resetToken = createToken(
      { id: String(alice._id), email: alice.email, role: "USER" },
      TEST_SECRET,
      "10m"
    );

    const res = await request(app).post("/auth/forget-password").send({
      email: "alice@example.com",
      newPassword: FORGET_PASSWORD,
      token: resetToken,
    });
    expect(res.status).toBe(200);
    expectNoPasswordField(res.body.data, "forget-password response");

    const login = await request(app).post("/auth/login").send({
      email: "alice@example.com",
      password: FORGET_PASSWORD,
    });
    expect(login.status).toBe(200);
  });
});
