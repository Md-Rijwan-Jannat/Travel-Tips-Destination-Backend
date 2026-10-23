/* eslint-disable @typescript-eslint/no-this-alias */
import bcrypt from 'bcrypt';
import { Schema, Types, model, Document } from 'mongoose';
import config from '../../../config';
import { TUser, TUserModel } from './user.interface';

// Extend the Mongoose Document interface for the 'this' context in hooks
interface TUserDocument extends TUser, Document {}

const userSchema = new Schema<TUser, TUserModel>(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    bio: {
      type: String,
      trim: true,
    },
    password: {
      type: String,
      // Never returned by queries/find/update results; only flows that must
      // compare hashes opt in with `.select("+password")` (e.g. login).
      select: false,
    },
    image: {
      type: String,
      trim: true,
    },
    // Profile cover/banner photo (independent from `image` avatar).
    coverImage: {
      type: String,
      trim: true,
      default: null,
    },
    role: {
      type: String,
      enum: ['ADMIN', 'USER'],
      default: 'USER',
      trim: true,
    },
    status: {
      type: String,
      enum: ['IN_PROGRESS', 'BLOCKED'],
      default: 'IN_PROGRESS',
      trim: true,
    },
    follower: [
      {
        type: Types.ObjectId,
      },
    ],
    following: [
      {
        type: Types.ObjectId,
      },
    ],
    verified: {
      type: Boolean,
      default: false,
    },
    country: {
      type: String,
      default: null,
      trim: true,
    },
    address: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    googleSubject: {
      type: String,
      default: null,
      trim: true,
    },
    // Optional TOTP 2FA — OFF by default for every account (existing and new,
    // including Google-created). Authoritative state lives only here, never
    // in frontend state.
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    // Which second factor is active. Exactly one at a time:
    //   'none'          — 2FA disabled
    //   'authenticator' — TOTP (+ recovery codes)
    //   'email'         — email OTP to the verified account email
    // NO schema default on purpose: legacy documents predate this field and
    // must be backfilled (see migrateLegacyTwoFactorMethods), not silently
    // hydrated as 'none' (which would disable their 2FA). `twoFactorEnabled`
    // stays in sync as a legacy mirror (true iff method !== 'none').
    twoFactorMethod: {
      type: String,
      enum: ['none', 'authenticator', 'email'],
    },
    // AES-256-GCM encrypted TOTP secrets (never plaintext, never logged).
    twoFactorSecretEncrypted: {
      type: String,
      default: null,
      select: false,
    },
    twoFactorPendingSecretEncrypted: {
      type: String,
      default: null,
      select: false,
    },
    twoFactorPendingExpiresAt: {
      type: Date,
      default: null,
    },
    twoFactorEnabledAt: {
      type: Date,
      default: null,
    },
    // Single-use hashed recovery codes (plaintext shown only once at creation).
    twoFactorRecoveryCodes: {
      type: [
        {
          hash: { type: String, required: true },
          used: { type: Boolean, default: false },
          usedAt: { type: Date, default: null },
        },
      ],
      default: [],
      select: false,
    },
    // Whether the account email has been confirmed as under the user's
    // control (Google-verified at creation/link, or verified via email OTP
    // from Settings). Required before email OTP can act as a login second
    // factor. Distinct from `verified`, which is the premium flag.
    emailVerified: {
      type: Boolean,
      default: false,
    },
    // Recent email-OTP send timestamps (login 2FA + email verification),
    // pruned to the rate-limit window on each send. Pruned server-side only.
    emailOtpSendLog: {
      type: [Date],
      default: [],
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// Partial-unique so multiple users may have no googleSubject (null/missing)
// while a given Google subject can only ever map to one account. A sparse
// index alone would NOT work because the schema default writes an explicit
// null, which sparse indexes still index.
userSchema.index(
  { googleSubject: 1 },
  { unique: true, partialFilterExpression: { googleSubject: { $type: 'string' } } }
);

export default userSchema;

// Pre-save hook for password hashing
userSchema.pre('save', async function (next) {
  const user = this as TUserDocument; // Cast this as TUserDocument

  // Hash the password only if it has been modified or is new
  if (user.isModified('password')) {
    user.password = await bcrypt.hash(
      user?.password as string,
      Number(config.bcrypt_salt_rounds)
    );
  }
  next();
});

// Post-save hook: drop the password from the returned document entirely so it
// is never serialized into an API response (previously set to an empty string,
// which still emitted a `password` key).
userSchema.post('save', function (doc, next) {
  doc.password = undefined;
  next();
});

// Static method to find user by email (password is excluded by schema default)
userSchema.statics.isUserExistsByEmail = async function (email) {
  return await User.findOne({ email });
};

// Static method to compare passwords
userSchema.statics.isPasswordMatched = async function (
  plainTextPassword: string,
  hashedPassword: string
) {
  return await bcrypt.compare(plainTextPassword, hashedPassword);
};

// Static method to check if the JWT was issued before the password was changed
userSchema.statics.isJWTIssuedBeforePasswordChanged = function (
  passwordChangedTimestamp: Date,
  jwtIssuedTimestamp: number
) {
  const passwordChangedTime =
    new Date(passwordChangedTimestamp).getTime() / 1000;
  return passwordChangedTime > jwtIssuedTimestamp;
};

// Exporting the User model
export const User = model<TUser, TUserModel>('User', userSchema);
