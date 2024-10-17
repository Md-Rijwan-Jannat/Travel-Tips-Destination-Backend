import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { UserServices } from "./auth.service";
import config from "../../../config";

const registerUser = catchAsync(async (req, res) => {
  const result = await UserServices.registerUserIntoDB(req.body);

  res.cookie("accessToken", result?.accessToken, {
    secure: config.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax", // Consider 'none' if needed
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User is created successfully",
    data: result,
  });
});

const loginUser = catchAsync(async (req, res) => {
  const result = await UserServices.loginUserFromDB(req.body);

  res.cookie("accessToken", result?.accessToken, {
    secure: config.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User login successfully",
    data: result,
  });
});

const forgetPassword = catchAsync(async (req, res) => {
  const email = req.body.email;
  const result = await UserServices.forgetPasswordIntoDB(email);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "The link create successfully!",
    data: result,
  });
});

const resetPassword = catchAsync(async (req, res) => {
  const token = req.headers.authorization;
  const result = await UserServices.resetPasswordIntoDB(
    req.body,
    token as string,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password reset successful!",
    data: result,
  });
});

export const UserControllers = {
  registerUser,
  loginUser,
  forgetPassword,
  resetPassword,
};
