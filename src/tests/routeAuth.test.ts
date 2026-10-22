import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import globalErrorHandler from "../app/middlewares/globalErrorhandler";
import { StoryRoutes } from "../app/module/Story/story.routes";

// Regression: routes touched in this batch must still require authentication
// (the Auth middleware short-circuits with 401 before any DB access when no
// token is provided, so these tests need no database).
const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/stories", StoryRoutes);
  app.use(globalErrorHandler);
  return app;
};

describe("story routes auth regression", () => {
  const app = buildApp();

  it("GET /stories requires a token", async () => {
    const res = await request(app).get("/stories");
    expect(res.status).toBe(401);
  });

  it("GET /stories/:storyId requires a token (route binding fix kept Auth)", async () => {
    const res = await request(app).get("/stories/652f1c2e8b0000000000abcd");
    expect(res.status).toBe(401);
  });

  it("GET /stories/all-users-stories requires a token", async () => {
    const res = await request(app).get("/stories/all-users-stories");
    expect(res.status).toBe(401);
  });
});
