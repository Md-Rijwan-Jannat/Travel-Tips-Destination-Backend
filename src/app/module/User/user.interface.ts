/* eslint-disable no-unused-vars */
import { Model } from "mongoose";
import { USER_ROLE } from "./user.constants";

export interface TUser {
  name: string;
  email: string;
  password?: string;
  image?: string;
  role: "admin" | "user";
  status: "in-progress" | "blocked";
  flower: number;
  flowing: number;
  verified: boolean;
  country?: string;
  address?: string;
  isDeleted: boolean;
}
export interface TLoginUser {
  email: string;
  password: string;
}

export interface UserModel extends Model<TUser> {
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
