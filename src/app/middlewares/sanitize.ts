import { NextFunction, Request, Response } from "express";

// Defense-in-depth against NoSQL operator injection in JSON bodies and query
// strings (`{"email": {"$gt": ""}}`, `?email[$ne]=x`, dotted paths like
// `a.b`, prototype-pollution keys). The zod `validateRequest` whitelist and
// the hardened `QueryBuilder` are the primary guards; this strips operators
// before anything downstream ever sees them.
const isForbiddenKey = (key: string): boolean =>
  key.startsWith("$") ||
  key.includes(".") ||
  key === "__proto__" ||
  key === "constructor" ||
  key === "prototype";

const sanitizeObject = (obj: Record<string, unknown>): void => {
  for (const key of Object.keys(obj)) {
    if (isForbiddenKey(key)) {
      delete obj[key];
      continue;
    }

    const value = obj[key];

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          sanitizeObject(item as Record<string, unknown>);
        }
      }
    } else if (value && typeof value === "object") {
      sanitizeObject(value as Record<string, unknown>);
      // An object that contained only forbidden keys (e.g. `{"$gt": ""}`)
      // must not survive as `{}` — in a query that would still mean
      // "match anything". Prune emptied containers.
      if (Object.keys(value).length === 0) {
        delete obj[key];
      }
    }
  }
};

const sanitize = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.body && typeof req.body === "object") {
    if (Array.isArray(req.body)) {
      for (const item of req.body) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          sanitizeObject(item as Record<string, unknown>);
        }
      }
    } else {
      sanitizeObject(req.body as Record<string, unknown>);
    }
  }

  // `req.query` is a lazily parsed getter on Express 4 — the cleaned copy is
  // installed via defineProperty so later reads see it.
  if (req.query && typeof req.query === "object") {
    const cleaned: Record<string, unknown> = {
      ...(req.query as Record<string, unknown>),
    };
    sanitizeObject(cleaned);
    Object.defineProperty(req, "query", {
      value: cleaned,
      writable: false,
      configurable: true,
      enumerable: true,
    });
  }

  // Route params are single path segments; downstream ObjectId casts and zod
  // schemas reject anything that is not a legitimate id.

  next();
};

export default sanitize;
