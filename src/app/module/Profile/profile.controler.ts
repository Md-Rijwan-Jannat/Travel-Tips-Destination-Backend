import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { ProfileServices } from "./profile.service";

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

export const ProfileControllers = {
  getMyProfile,
  updateMyProfile,
  deleteMyProfile,
};
