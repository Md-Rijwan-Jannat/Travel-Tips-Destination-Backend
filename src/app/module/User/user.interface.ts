/* eslint-disable no-unused-vars */
import { Model, Types } from 'mongoose';
import { USER_ROLE, USER_STATUS } from '../User/user.constants';

export interface TRecoveryCode {
  hash: string;
  used: boolean;
  usedAt?: Date | null;
}

export interface TUser {
  name: string;
  email: string;
  password?: string;
  image?: string;
  role: TUserRole;
  bio: string;
  status: TUserStatus;
  follower: Types.ObjectId[];
  following: Types.ObjectId[];
  verified: boolean;
  country?: string;
  isActive: boolean;
  address?: string;
  isDeleted: boolean;
  // Google OAuth external identity (stable `sub` claim). Sparse-unique.
  googleSubject?: string | null;
  // Optional TOTP 2FA — OFF by default for every account.
  twoFactorEnabled: boolean;
  // Active second factor: only one at a time. May be missing on legacy docs
  // (backfilled lazily / at boot from twoFactorEnabled).
  twoFactorMethod?: 'none' | 'authenticator' | 'email';
  twoFactorSecretEncrypted?: string | null;
  twoFactorPendingSecretEncrypted?: string | null;
  twoFactorPendingExpiresAt?: Date | null;
  twoFactorEnabledAt?: Date | null;
  twoFactorRecoveryCodes: TRecoveryCode[];
  // Account-email confirmation (required for email OTP as a 2FA factor).
  emailVerified: boolean;
  emailOtpSendLog: Date[];
}
export interface TLoginUser {
  email: string;
  password: string;
}

export interface TGetUserOnDataBase {
  name: string;
  email: string;
  image?: string;
  password: string;
  role: string;
  bio: string;
  status: string;
  follower: string[];
  following: string[];
  verified: boolean;
  country: string;
  address: string;
  isDeleted: boolean;
  _id: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
}

export interface TUserModel extends Model<TUser> {
  isUserExistsByEmail(email: string): Promise<TUser>;
  isPasswordMatched(
    plainTextPassword: string,
    hashedPassword: string
  ): Promise<boolean>;
  isJWTIssuedBeforePasswordChanged(
    passwordChangedTimestamp: Date,
    jwtIssuedTimestamp: number
  ): boolean;
}

export type TUserRole = keyof typeof USER_ROLE;
export type TUserStatus = keyof typeof USER_STATUS;
