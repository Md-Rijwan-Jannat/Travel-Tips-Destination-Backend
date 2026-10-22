"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Defense-in-depth against NoSQL operator injection in JSON bodies and query
// strings (`{"email": {"$gt": ""}}`, `?email[$ne]=x`, dotted paths like
// `a.b`, prototype-pollution keys). The zod `validateRequest` whitelist and
// the hardened `QueryBuilder` are the primary guards; this strips operators
// before anything downstream ever sees them.
const isForbiddenKey = (key) => key.startsWith("$") ||
    key.includes(".") ||
    key === "__proto__" ||
    key === "constructor" ||
    key === "prototype";
const sanitizeObject = (obj) => {
    for (const key of Object.keys(obj)) {
        if (isForbiddenKey(key)) {
            delete obj[key];
            continue;
        }
        const value = obj[key];
        if (Array.isArray(value)) {
            for (const item of value) {
                if (item && typeof item === "object" && !Array.isArray(item)) {
                    sanitizeObject(item);
                }
            }
        }
        else if (value && typeof value === "object") {
            sanitizeObject(value);
            // An object that contained only forbidden keys (e.g. `{"$gt": ""}`)
            // must not survive as `{}` — in a query that would still mean
            // "match anything". Prune emptied containers.
            if (Object.keys(value).length === 0) {
                delete obj[key];
            }
        }
    }
};
const sanitize = (req, _res, next) => {
    if (req.body && typeof req.body === "object") {
        if (Array.isArray(req.body)) {
            for (const item of req.body) {
                if (item && typeof item === "object" && !Array.isArray(item)) {
                    sanitizeObject(item);
                }
            }
        }
        else {
            sanitizeObject(req.body);
        }
    }
    // `req.query` is a lazily parsed getter on Express 4 — the cleaned copy is
    // installed via defineProperty so later reads see it.
    if (req.query && typeof req.query === "object") {
        const cleaned = Object.assign({}, req.query);
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
exports.default = sanitize;
