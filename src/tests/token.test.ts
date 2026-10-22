import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { createToken, verifyToken } from "../app/utils/tokenGenerateFunction";

const SECRET = "test-secret";

describe("token helpers", () => {
  it("round-trips a signed token", () => {
    const token = createToken(
      { email: "user@aura.trip", role: "USER" },
      SECRET,
      "1h",
    );

    const decoded = verifyToken(token, SECRET);
    expect(decoded.email).toBe("user@aura.trip");
    expect(decoded.role).toBe("USER");
  });

  it("accepts numeric expiry values", () => {
    const token = createToken(
      { email: "user@aura.trip", role: "USER" },
      SECRET,
      3600,
    );

    expect(verifyToken(token, SECRET).email).toBe("user@aura.trip");
  });

  it("rejects tokens signed with a different secret", () => {
    const token = createToken(
      { email: "user@aura.trip", role: "USER" },
      "other-secret",
      "1h",
    );

    expect(() => verifyToken(token, SECRET)).toThrow(
      jwt.JsonWebTokenError,
    );
  });

  it("rejects tampered payloads", () => {
    const token = createToken(
      { email: "user@aura.trip", role: "USER" },
      SECRET,
      "1h",
    );
    const [header, , signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(header, "base64url").toString()),
      }),
    ).toString("base64url");
    const bad = `${forged}.${Buffer.from(
      JSON.stringify({
        email: "admin@aura.trip",
        role: "ADMIN",
      }),
    ).toString("base64url")}.${signature}`;

    expect(() => verifyToken(bad, SECRET)).toThrow();
  });
});
