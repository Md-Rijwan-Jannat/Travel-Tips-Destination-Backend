import { NextFunction, Request, Response } from "express";
import { AnyZodObject } from "zod";
import catchAsync from "../utils/catchAsync";

const validateRequest = (schema: AnyZodObject) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    // Parse validates AND produces transformed/stripped data
    // (zod objects strip unknown keys by default).
    const parsed = await schema.parseAsync({
      body: req.body,
      query: req.query,
      cookies: req.cookies,
    });

    // Use the parsed result so transforms apply and unknown fields
    // (e.g. role, verified) never reach service/controller code.
    if (parsed.body !== undefined) {
      req.body = parsed.body;
    }
    if (parsed.query !== undefined) {
      req.query = parsed.query as Request["query"];
    }
    if (parsed.cookies !== undefined) {
      req.cookies = parsed.cookies;
    }

    next();
  });
};

export default validateRequest;
