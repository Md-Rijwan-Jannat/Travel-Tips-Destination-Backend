import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../app";
import sanitize from "../app/middlewares/sanitize";
import { createRateLimiter } from "../app/middlewares/rateLimiter";

describe("helmet security headers (real app)", () => {
  it("serves responses with standard security headers", async () => {
    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeTruthy();
    expect(res.headers["x-content-type-options"]).toBeDefined();
    expect(res.headers["cross-origin-resource-policy"]).toBeTruthy();
  });

  it("keeps the auth pipeline intact: validation runs behind helmet + rate limit", async () => {
    // invalid body → zod rejects BEFORE any controller/DB work
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "not-an-email", password: "" });

    expect(res.status).toBe(400);
    expect(res.status).not.toBe(429);
  });
});

describe("NoSQL injection sanitization", () => {
  const buildProbeApp = () => {
    const probe = express();
    probe.use(express.json());
    probe.use(sanitize);
    probe.post("/body", (req, res) => {
      res.json({ body: req.body });
    });
    probe.get("/query", (req, res) => {
      res.json({ query: req.query });
    });
    return probe;
  };

  it("strips $-operators, dotted keys, and nested operators from JSON bodies", async () => {
    const res = await request(buildProbeApp())
      .post("/body")
      .send({
        email: "someone@example.com",
        password: { $gt: "" }, // classic operator-injection attempt
        meta: { $where: "1==1", ok: true },
        "a.b": "dotted",
        list: [{ $ne: "x", fine: 1 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({
      email: "someone@example.com",
      meta: { ok: true },
      list: [{ fine: 1 }],
    });
  });

  it("strips prototype-pollution keys sent as raw JSON", async () => {
    const res = await request(buildProbeApp())
      .post("/body")
      .set("Content-Type", "application/json")
      // object literals cannot carry __proto__ — send the wire format
      .send('{"safe": 1, "__proto__": {"polluted": true}}');

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({ safe: 1 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("strips operator keys from query strings", async () => {
    const res = await request(buildProbeApp()).get(
      "/query?email[$ne]=x&ok=1&deep[$gt]=5",
    );

    expect(res.status).toBe(200);
    expect(res.body.query).toEqual({ ok: "1" });
  });
});

describe("rate limiting", () => {
  const buildLimitedApp = (limit: number) => {
    const limited = express();
    limited.use(
      createRateLimiter({ windowMs: 60_000, limit }),
    );
    limited.get("/login-attempt", (_req, res) => {
      res.json({ success: true });
    });
    return limited;
  };

  it("allows requests under the budget and blocks with 429 beyond it", async () => {
    const limited = buildLimitedApp(2);

    expect((await request(limited).get("/login-attempt")).status).toBe(200);
    expect((await request(limited).get("/login-attempt")).status).toBe(200);

    const blocked = await request(limited).get("/login-attempt");
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toContain("Too many requests");
    expect(
      blocked.headers["ratelimit-limit"] || blocked.headers["ratelimit"],
    ).toBeTruthy();
  });

  it("does not trip the auth budget for a handful of legitimate calls", async () => {
    // the real app's auth limiter allows 10 / 15 min — a few probes must pass
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "not-an-email", password: "" });
      expect(res.status).toBe(400);
    }
  });
});
