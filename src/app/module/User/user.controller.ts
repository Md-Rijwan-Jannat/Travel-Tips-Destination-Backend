import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { UserServices } from "./user.service";
import { Types } from "mongoose";
import { ProfileServices } from "../Profile/profile.service";

const getAllUser = catchAsync(async (req, res) => {
  const result = await UserServices.getAllUserFromDB(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Normal users retrieved successfully",
    meta: result.meta,
    data: result.result,
  });
});

const getAlPremiumUserForAnalytics = catchAsync(async (req, res) => {
  const result = await UserServices.getAlPremiumUserForAnalytics();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Premium users retrieved successfully",
    data: result,
  });
});

const getAllUserForAnalytics = catchAsync(async (req, res) => {
  const result = await UserServices.getAllUserForAnalytics(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Normal users retrieved successfully",
    data: result,
  });
});

const getAlPremiumUser = catchAsync(async (req, res) => {
  const result = await UserServices.getAllPremiumUserFromDB(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Premium users retrieved successfully",
    meta: result.meta,
    data: result.result,
  });
});

const updateUserStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const updatedUser = await UserServices.updateUserStatus(id, { status });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User status updated successfully",
    data: updatedUser,
  });
});

const updateUserRole = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  const updatedUser = await UserServices.updateUserRole(id, { role });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User role updated successfully",
    data: updatedUser,
  });
});

const getUser = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await UserServices.getUserFromDB(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User retrieved successfully",
    data: result,
  });
});

export const followUser = catchAsync(async (req, res) => {
  const { id: userId } = req.user;
  const { followedUserId } = req.params;
  const result = await UserServices.followUser(
    userId,
    followedUserId as unknown as Types.ObjectId
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

// Un follow a user
export const unFollowUser = catchAsync(async (req, res) => {
  const { id: userId } = req.user;
  const { unFollowedUserId } = req.params;
  const result = await UserServices.unFollowUser(
    userId,
    unFollowedUserId as unknown as Types.ObjectId
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

// Get single user all posts
const getSingleUserPosts = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const result = await UserServices.getSingleUserAllPostsFromDB(
    userId,
    req.query
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "My posts retrieved successfully",
    data: result,
  });
});

export const UserControllers = {
  getAllUser,
  getAlPremiumUser,
  getAllUserForAnalytics,
  getAlPremiumUserForAnalytics,
  getUser,
  updateUserStatus,
  updateUserRole,
  followUser,
  unFollowUser,
  getSingleUserPosts,
};
