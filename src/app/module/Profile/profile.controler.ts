import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { ProfileServices } from "./profile.service";
import { JwtPayload } from "jsonwebtoken";

// Get my profile by email
const getMyProfile = catchAsync(async (req, res) => {
  const { email } = req.user;
  const result = await ProfileServices.getMyProfileFormDB(email);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile retrieved successfully",
    data: result,
  });
});

// Update my profile by req.params.id and req.user.email
const updateMyProfile = catchAsync(async (req, res) => {
  const { email } = req.user;
  const { id } = req.params;
  const result = await ProfileServices.updateMyProfileIntoDB(
    req.body,
    id,
    email
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile updated successfully",
    data: result,
  });
});

// Delete my profile by req.params.id and req.user.email
const deleteMyProfile = catchAsync(async (req, res) => {
  const { email } = req.user;
  const { id } = req.params;
  const result = await ProfileServices.deleteMyProfileFromDB(id, email);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile deleted successfully",
    data: result,
  });
});

// Get my posts
const getMyPosts = catchAsync(async (req, res) => {
  const user = req.user as JwtPayload;
  const result = await ProfileServices.getMyPosts(user?.id, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "My posts retrieved successfully",
    data: result,
  });
});

// Get my posts
const getMyPremiumPosts = catchAsync(async (req, res) => {
  const user = req.user as JwtPayload;
  const result = await ProfileServices.getMyPremiumPosts(user?.id, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "My premium posts retrieved successfully",
    data: result,
  });
});

// Get my posts
const getMyFollowers = catchAsync(async (req, res) => {
  const user = req.user as JwtPayload;

  const result = await ProfileServices.myFollowersFromDB(user?.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Followers retrieved successfully",
    data: result,
  });
});

// Get my posts
const getMyFollowing = catchAsync(async (req, res) => {
  const user = req.user as JwtPayload;

  const result = await ProfileServices.myFollowingFromDB(user?.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Following retrieved successfully",
    data: result,
  });
});

export const ProfileControllers = {
  getMyProfile,
  updateMyProfile,
  deleteMyProfile,
  getMyPosts,
  getMyPremiumPosts,
  getMyFollowers,
  getMyFollowing,
};
