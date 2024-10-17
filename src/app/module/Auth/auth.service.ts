/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import httpStatus from "http-status";
import config from "../../../config";
import AppError from "../../errors/AppError";
import { createToken } from "../../utils/tokenGenerateFunction";
import { TLoginUser, TRegister } from "./auth.interface";
import { User } from "../User/user.model";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { sendEmail } from "../../utils/sendEmail";

const registerUserIntoDB = async (payload: TRegister) => {
  const user = await User.findOne({ email: payload.email });

  if (!user) {
    const result = await User.create(payload);

    const jwtPayload = {
      id: result._id,
      email: payload.email,
      role: "USER",
    };

    const accessToken = createToken(
      jwtPayload,
      config.jwt_access_secret as string,
      config.jwt_access_expires_in as string,
    );

    const refreshToken = createToken(
      jwtPayload,
      config.jwt_access_secret as string,
      config.jwt_refresh_expires_in as string,
    );

    return {
      result,
      accessToken: accessToken,
      refreshToken: refreshToken,
    };
  }
};

const loginUserFromDB = async (payload: Partial<TLoginUser>) => {
  const user = await User.findOne({ email: payload.email });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const userStatus = user?.status;

  if (userStatus === "BLOCKED") {
    throw new AppError(httpStatus.FORBIDDEN, "This user is blocked!");
  }

  //checking if the password is correct

  if (!(await User.isPasswordMatched(payload.password!, user?.password!)))
    throw new AppError(httpStatus.FORBIDDEN, "Password do not matched");

  const jwtPayload = {
    id: user._id,
    email: user.email,
    role: user.role,
  };

  const accessToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    config.jwt_access_expires_in as string,
  );

  const refreshToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    config.jwt_refresh_expires_in as string,
  );

  return {
    accessToken: accessToken,
    refreshToken: refreshToken,
  };
};

const forgetPasswordIntoDB = async (email: string) => {
  const user = await User.findOne({ email: email });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "This user is not found!");
  }

  if (user.isDeleted === true) {
    throw new AppError(httpStatus.FORBIDDEN, "This user is deleted!");
  }

  if (user.status == "BLOCKED") {
    throw new AppError(httpStatus.FORBIDDEN, "This user is blocked!");
  }

  const jwtPayload = {
    id: user._id,
    email: user.email,
    role: user.role,
  };

  const resetToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    "10m",
  );

  const resetLink = `${config.reset_link_url}?email=${user.email}&token=${resetToken}`;

  // Send email to the user with the reset link
  await sendEmail(user.email, resetLink);
};

const resetPasswordIntoDB = async (
  payload: { email: string; newPassword: string },
  token: string,
) => {
  console.log(payload);
  const user = await User.findOne({ email: payload?.email });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "This user is not found!");
  }

  if (user.isDeleted === true) {
    throw new AppError(httpStatus.FORBIDDEN, "This user is deleted!");
  }

  if (user.status == "BLOCKED") {
    throw new AppError(httpStatus.FORBIDDEN, "This user is blocked!");
  }

  // Check if token is valid
  const decoded = jwt.verify(token, config.jwt_access_secret as string) as {
    id: string;
    email: string;
    role: string;
  };

  if (payload.email !== decoded.email) {
    throw new AppError(httpStatus.FORBIDDEN, "This user is forbidden!");
  }

  const newHashPassword = await bcrypt.hash(
    payload.newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  const result = await User.findOneAndUpdate(
    { _id: decoded.id, role: decoded.role },
    {
      password: newHashPassword,
    },
    { new: true },
  );

  return result;
};

export const UserServices = {
  registerUserIntoDB,
  loginUserFromDB,
  forgetPasswordIntoDB,
  resetPasswordIntoDB,
};
