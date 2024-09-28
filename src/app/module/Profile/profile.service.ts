import httpStatus from "http-status";
import AppError from "../../errors/AppError";
import { User } from "../User/user.model";
import { TUpdateUser } from "./profile.interface";
import { USER_STATUS } from "../User/user.constants";

// Get my profile by email
const getMyProfileFormDB = async (email: string) => {
  const user = await User.findOne({ email });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.status === USER_STATUS.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
  }

  return user;
};

// Update my profile by id and email
const updateMyProfileIntoDB = async (
  payload: Partial<TUpdateUser>,
  id: string,
  email: string
) => {
  const user = await User.findOne({ _id: id, email });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.status === USER_STATUS.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
  }

  // Update user profile
  const updatedUser = await User.findByIdAndUpdate(id, payload, { new: true });
  return updatedUser;
};

// Delete my profile by id and email
const deleteMyProfileFromDB = async (id: string, email: string) => {
  const user = await User.findOne({ _id: id, email });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.status === USER_STATUS.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
  }

  const result = await User.findByIdAndDelete(id);
  return result;
};

export const ProfileServices = {
  updateMyProfileIntoDB,
  getMyProfileFormDB,
  deleteMyProfileFromDB,
};
