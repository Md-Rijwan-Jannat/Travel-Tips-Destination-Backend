import express from "express";
import request from "supertest";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import validateRequest from "../app/middlewares/validateRequest";
import globalErrorHandler from "../app/middlewares/globalErrorhandler";

const buildApp = () => {
  const app = express();
  app.use(express.json());

  const schema = z.object({
    body: z.object({
      name: z.string(),
      age: z.coerce.number().int().positive(),
    }),
  });

  app.post("/resource", validateRequest(schema), (req, res) => {
    res.status(200).json({ body: req.body });
  });

  app.use(globalErrorHandler);
  return app;
};

describe("validateRequest middleware", () => {
  const app = buildApp();

  it("drops unknown body fields (mass-assignment guard)", async () => {
    const res = await request(app)
      .post("/resource")
      .send({ name: "aura", age: 20, role: "ADMIN", verified: true });

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({ name: "aura", age: 20 });
    expect(res.body.body).not.toHaveProperty("role");
    expect(res.body.body).not.toHaveProperty("verified");
  });

  it("applies zod transforms from the parsed result", async () => {
    const res = await request(app).post("/resource").send({ name: "aura", age: "21" });

    expect(res.status).toBe(200);
    expect(res.body.body.age).toBe(21);
    expect(typeof res.body.body.age).toBe("number");
  });

  it("rejects invalid payloads with a 400", async () => {
    const res = await request(app)
      .post("/resource")
      .send({ name: "aura", age: -5 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("rejects payloads missing required fields", async () => {
    const res = await request(app).post("/resource").send({});

    expect(res.status).toBe(400);
  });
});
