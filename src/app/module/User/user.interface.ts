/* eslint-disable no-unused-vars */
import { Model, Types } from "mongoose";
import { USER_ROLE, USER_STATUS } from "../User/user.constants";

export interface TUser {
  name: string;
  email: string;
  password?: string;
  image?: string;
  role: TUserRole;
  status: TUserStatus;
  follower: Types.ObjectId[];
  following: Types.ObjectId[];
  verified: boolean;
  country?: string;
  address?: string;
  isDeleted: boolean;
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
  status: string;
  follower: string[];
  following: string[];
  verified: boolean;
  country: any;
  address: any;
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
