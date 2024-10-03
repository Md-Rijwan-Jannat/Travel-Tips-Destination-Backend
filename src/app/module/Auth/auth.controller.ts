import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { UserServices } from "./auth.service";
import config from "../../../config";

const registerUser = catchAsync(async (req, res) => {
  const result = await UserServices.registerUserIntoDB(req.body);

  // const { refreshToken, accessToken } = result;

  // res.cookie("refreshToken", refreshToken, {
  //   secure: config.NODE_ENV === "production",
  //   httpOnly: true,
  // });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User is created successfully",
    data: result,
  });
});

const loginUser = catchAsync(async (req, res) => {
  const result = await UserServices.loginUserFromDB(req.body);

  const { refreshToken, accessToken } = result;

  res.cookie("refreshToken", refreshToken, {
    secure: config.NODE_ENV === "production",
    httpOnly: true,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User login successfully",
    data: result,
  });
});

const forgetPassword = catchAsync(async (req, res) => {
  const userId = req.body._id;
  const result = await UserServices.forgetPasswordIntoDB(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "The link create successfully!",
    data: result,
  });
});

const resetPassword = catchAsync(async (req, res) => {
  const token = req.headers.authorization;
  console.log("Token =>>", token);
  const result = await UserServices.resetPasswordIntoDB(
    req.body,
    token as string
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
