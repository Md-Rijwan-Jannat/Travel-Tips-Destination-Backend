/* eslint-disable no-unused-vars */
import { Model } from "mongoose";
import { USER_ROLE } from "../User/user.constants";

export interface TRegister {
  name: string;
  email: string;
  password?: string;
  image?: string;
  role: TUserRole;
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

export type TUserRole = keyof typeof USER_ROLE;
