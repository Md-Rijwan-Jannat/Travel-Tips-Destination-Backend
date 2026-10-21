import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";

export const createToken = (
  jwtPayload: { email: string; role: string },
  secret: string,
  expiresIn: string | number,
) => {
  // Cast: jsonwebtoken v9 types expect branded StringValue; callers pass
  // plain config strings like "7d" which are valid at runtime.
  return jwt.sign(jwtPayload, secret, {
    expiresIn: expiresIn as SignOptions["expiresIn"],
  });
};

export const verifyToken = (token: string, secret: string) => {
  return jwt.verify(token, secret) as JwtPayload;
};
