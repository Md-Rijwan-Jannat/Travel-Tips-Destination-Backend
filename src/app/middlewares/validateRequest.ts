import { NextFunction, Request, Response } from "express";
import { AnyZodObject } from "zod";
import catchAsync from "../utils/catchAsync";

const validateRequest = (schema: AnyZodObject) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const parsed = await schema.parseAsync({
      body: req.body,
      query: req.query,
      cookies: req.cookies,
    });

    // Use the parsed (validated + transformed + stripped) values so that
    // unknown fields (e.g. role, verified) are dropped and transforms apply.
    if (parsed.body !== undefined) {
      req.body = parsed.body;
    }
    if (parsed.cookies !== undefined) {
      req.cookies = parsed.cookies;
    }
    if (parsed.query !== undefined) {
      req.query = parsed.query;
    }

    next();
  });
};

export default validateRequest;
