import { Schema, Types, model } from 'mongoose';

export type TAuthChallengeType = 'LOGIN_2FA' | 'EMAIL_VERIFY' | 'ENABLE_EMAIL_2FA';

export interface TAuthChallenge {
  userId: Types.ObjectId;
  type: TAuthChallengeType;
  // SHA-256 of the opaque challenge token handed to the client. The raw
  // token is never stored, so a DB leak cannot replay challenges. For
  // EMAIL_VERIFY / ENABLE_EMAIL_2FA challenges the token is never handed
  // out at all — the random hash only satisfies the unique constraint /
  // document identity. The challenge TYPE is the OTP purpose: a login OTP
  // can never verify an enrollment and vice versa.
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  // Email OTP state (alternative 2FA factor and account-email verification).
  // Only a keyed HMAC of the code is stored — never the plaintext.
  emailOtpHash: string | null;
  emailOtpExpiresAt: Date | null;
  emailOtpSentAt: Date | null;
  emailOtpSendCount: number;
}

const authChallengeSchema = new Schema<TAuthChallenge>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['LOGIN_2FA', 'EMAIL_VERIFY', 'ENABLE_EMAIL_2FA'],
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    emailOtpHash: {
      type: String,
      default: null,
    },
    emailOtpExpiresAt: {
      type: Date,
      default: null,
    },
    emailOtpSentAt: {
      type: Date,
      default: null,
    },
    emailOtpSendCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index: expired challenges are removed by MongoDB in the background.
authChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthChallenge = model<TAuthChallenge>(
  'AuthChallenge',
  authChallengeSchema
);
