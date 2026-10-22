import httpStatus from 'http-status';
import { Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { UserServices } from './auth.service';
import config from '../../../config';

const setAuthCookie = (res: Response, token: string) => {
  res.cookie('accessToken', token, {
    secure: config.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax', // Consider 'none' if needed
  });
};

const registerUser = catchAsync(async (req, res) => {
  const result = await UserServices.registerUserIntoDB(req.body);

  setAuthCookie(res, result?.accessToken as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User is created successfully',
    data: result,
  });
});

const loginUser = catchAsync(async (req, res) => {
  const result = await UserServices.loginUserFromDB(req.body);

  // When 2FA is enabled no session is issued yet — only a short-lived,
  // single-purpose challenge. Never set auth cookies before the second
  // factor is verified.
  if (result && 'twoFactorRequired' in result) {
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Two-factor verification required',
      data: result,
    });
    return;
  }

  setAuthCookie(res, (result as { accessToken: string }).accessToken);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User login successfully',
    data: result,
  });
});

const googleAuth = catchAsync(async (req, res) => {
  const result = await UserServices.googleAuthIntoDB(req.body);

  if (result && 'twoFactorRequired' in result) {
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Two-factor verification required',
      data: result,
    });
    return;
  }

  setAuthCookie(res, (result as { accessToken: string }).accessToken);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Google authentication successful',
    data: result,
  });
});

const linkGoogle = catchAsync(async (req, res) => {
  const result = await UserServices.linkGoogleAccountIntoDB(
    req.user?.id,
    req.body
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Google account connected successfully',
    data: result,
  });
});

const unlinkGoogle = catchAsync(async (req, res) => {
  const result = await UserServices.unlinkGoogleAccountIntoDB(
    req.user?.id,
    req.body
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Google account disconnected successfully',
    data: result,
  });
});

const twoFactorStatus = catchAsync(async (req, res) => {
  const result = await UserServices.getTwoFactorStatus(req.user?.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Two-factor status retrieved',
    data: result,
  });
});

const enrollTwoFactor = catchAsync(async (req, res) => {
  const result = await UserServices.enrollTwoFactorIntoDB(
    req.user?.id,
    req.body
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Scan the QR code and enter a verification code to finish setup',
    data: result,
  });
});

const verifyTwoFactorEnrollment = catchAsync(async (req, res) => {
  const result = await UserServices.verifyTwoFactorEnrollmentIntoDB(
    req.user?.id,
    req.body
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Two-factor authentication enabled',
    data: result,
  });
});

const verifyTwoFactorLogin = catchAsync(async (req, res) => {
  const result = await UserServices.verifyTwoFactorLoginIntoDB(req.body);

  setAuthCookie(res, result?.accessToken);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Two-factor verification successful',
    data: result,
  });
});

const twoFactorChallengeInfo = catchAsync(async (req, res) => {
  const result = await UserServices.getTwoFactorChallengeInfoIntoDB(
    req.body.challengeToken
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Challenge information retrieved',
    data: result,
  });
});

const sendTwoFactorEmailOtp = catchAsync(async (req, res) => {
  const result = await UserServices.sendTwoFactorEmailOtpIntoDB(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'If the account is eligible, a verification code has been sent',
    data: result,
  });
});

const verifyTwoFactorEmailLogin = catchAsync(async (req, res) => {
  const result = await UserServices.verifyTwoFactorLoginEmailIntoDB(req.body);

  setAuthCookie(res, result?.accessToken);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Two-factor verification successful',
    data: result,
  });
});

const sendEmailVerificationOtp = catchAsync(async (req, res) => {
  const result = await UserServices.sendEmailVerificationOtpIntoDB(
    req.user?.id
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'If the account is eligible, a verification code has been sent',
    data: result,
  });
});

const verifyEmailOwnership = catchAsync(async (req, res) => {
  const result = await UserServices.verifyEmailOwnershipIntoDB(
    req.user?.id,
    req.body
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Account email verified',
    data: result,
  });
});

const enableEmailOtp = catchAsync(async (req, res) => {
  const result = await UserServices.enableEmailOtpIntoDB(req.user?.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'If the account is eligible, a verification code has been sent',
    data: result,
  });
});

const verifyEnableEmailOtp = catchAsync(async (req, res) => {
  const result = await UserServices.verifyEnableEmailOtpIntoDB(
    req.user?.id,
    req.body
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Email OTP enabled as your second factor',
    data: result,
  });
});

const disableTwoFactor = catchAsync(async (req, res) => {
  const result = await UserServices.disableTwoFactorIntoDB(
    req.user?.id,
    req.body
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Two-factor authentication disabled',
    data: result,
  });
});

const regenerateRecoveryCodes = catchAsync(async (req, res) => {
  const result = await UserServices.regenerateRecoveryCodesIntoDB(
    req.user?.id,
    req.body
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'New recovery codes generated',
    data: result,
  });
});

const resetLink = catchAsync(async (req, res) => {
  const result = await UserServices.resetLinkIntoDB(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'The link create successfully!',
    data: result,
  });
});

const forgetPassword = catchAsync(async (req, res) => {
  const result = await UserServices.forgetPasswordIntoDB(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'The link create successfully!',
    data: result,
  });
});

const changePassword = catchAsync(async (req, res) => {
  const token = req.headers.authorization;
  const result = await UserServices.changePasswordIntoDB(
    req.body,
    token as string
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Password reset successful!',
    data: result,
  });
});

export const UserControllers = {
  registerUser,
  loginUser,
  resetLink,
  forgetPassword,
  changePassword,
  googleAuth,
  linkGoogle,
  unlinkGoogle,
  twoFactorStatus,
  enrollTwoFactor,
  verifyTwoFactorEnrollment,
  verifyTwoFactorLogin,
  twoFactorChallengeInfo,
  sendTwoFactorEmailOtp,
  verifyTwoFactorEmailLogin,
  sendEmailVerificationOtp,
  verifyEmailOwnership,
  enableEmailOtp,
  verifyEnableEmailOtp,
  disableTwoFactor,
  regenerateRecoveryCodes,
};
