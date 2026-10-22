"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserControllers = void 0;
const http_status_1 = __importDefault(require("http-status"));
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const auth_service_1 = require("./auth.service");
const config_1 = __importDefault(require("../../../config"));
const setAuthCookie = (res, token) => {
    res.cookie('accessToken', token, {
        secure: config_1.default.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax', // Consider 'none' if needed
    });
};
const registerUser = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield auth_service_1.UserServices.registerUserIntoDB(req.body);
    setAuthCookie(res, result === null || result === void 0 ? void 0 : result.accessToken);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'User is created successfully',
        data: result,
    });
}));
const loginUser = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield auth_service_1.UserServices.loginUserFromDB(req.body);
    // When 2FA is enabled no session is issued yet — only a short-lived,
    // single-purpose challenge. Never set auth cookies before the second
    // factor is verified.
    if (result && 'twoFactorRequired' in result) {
        (0, sendResponse_1.default)(res, {
            statusCode: http_status_1.default.OK,
            success: true,
            message: 'Two-factor verification required',
            data: result,
        });
        return;
    }
    setAuthCookie(res, result.accessToken);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'User login successfully',
        data: result,
    });
}));
const googleAuth = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield auth_service_1.UserServices.googleAuthIntoDB(req.body);
    if (result && 'twoFactorRequired' in result) {
        (0, sendResponse_1.default)(res, {
            statusCode: http_status_1.default.OK,
            success: true,
            message: 'Two-factor verification required',
            data: result,
        });
        return;
    }
    setAuthCookie(res, result.accessToken);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Google authentication successful',
        data: result,
    });
}));
const linkGoogle = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const result = yield auth_service_1.UserServices.linkGoogleAccountIntoDB((_a = req.user) === null || _a === void 0 ? void 0 : _a.id, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Google account connected successfully',
        data: result,
    });
}));
const unlinkGoogle = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const result = yield auth_service_1.UserServices.unlinkGoogleAccountIntoDB((_a = req.user) === null || _a === void 0 ? void 0 : _a.id, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Google account disconnected successfully',
        data: result,
    });
}));
const twoFactorStatus = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const result = yield auth_service_1.UserServices.getTwoFactorStatus((_a = req.user) === null || _a === void 0 ? void 0 : _a.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Two-factor status retrieved',
        data: result,
    });
}));
const enrollTwoFactor = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const result = yield auth_service_1.UserServices.enrollTwoFactorIntoDB((_a = req.user) === null || _a === void 0 ? void 0 : _a.id, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Scan the QR code and enter a verification code to finish setup',
        data: result,
    });
}));
const verifyTwoFactorEnrollment = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const result = yield auth_service_1.UserServices.verifyTwoFactorEnrollmentIntoDB((_a = req.user) === null || _a === void 0 ? void 0 : _a.id, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Two-factor authentication enabled',
        data: result,
    });
}));
const verifyTwoFactorLogin = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield auth_service_1.UserServices.verifyTwoFactorLoginIntoDB(req.body);
    setAuthCookie(res, result === null || result === void 0 ? void 0 : result.accessToken);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Two-factor verification successful',
        data: result,
    });
}));
const twoFactorChallengeInfo = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield auth_service_1.UserServices.getTwoFactorChallengeInfoIntoDB(req.body.challengeToken);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Challenge information retrieved',
        data: result,
    });
}));
const sendTwoFactorEmailOtp = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield auth_service_1.UserServices.sendTwoFactorEmailOtpIntoDB(req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'If the account is eligible, a verification code has been sent',
        data: result,
    });
}));
const verifyTwoFactorEmailLogin = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield auth_service_1.UserServices.verifyTwoFactorLoginEmailIntoDB(req.body);
    setAuthCookie(res, result === null || result === void 0 ? void 0 : result.accessToken);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Two-factor verification successful',
        data: result,
    });
}));
const sendEmailVerificationOtp = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const result = yield auth_service_1.UserServices.sendEmailVerificationOtpIntoDB((_a = req.user) === null || _a === void 0 ? void 0 : _a.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'If the account is eligible, a verification code has been sent',
        data: result,
    });
}));
const verifyEmailOwnership = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const result = yield auth_service_1.UserServices.verifyEmailOwnershipIntoDB((_a = req.user) === null || _a === void 0 ? void 0 : _a.id, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Account email verified',
        data: result,
    });
}));
const enableEmailOtp = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const result = yield auth_service_1.UserServices.enableEmailOtpIntoDB((_a = req.user) === null || _a === void 0 ? void 0 : _a.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'If the account is eligible, a verification code has been sent',
        data: result,
    });
}));
const verifyEnableEmailOtp = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const result = yield auth_service_1.UserServices.verifyEnableEmailOtpIntoDB((_a = req.user) === null || _a === void 0 ? void 0 : _a.id, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Email OTP enabled as your second factor',
        data: result,
    });
}));
const disableTwoFactor = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const result = yield auth_service_1.UserServices.disableTwoFactorIntoDB((_a = req.user) === null || _a === void 0 ? void 0 : _a.id, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Two-factor authentication disabled',
        data: result,
    });
}));
const regenerateRecoveryCodes = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const result = yield auth_service_1.UserServices.regenerateRecoveryCodesIntoDB((_a = req.user) === null || _a === void 0 ? void 0 : _a.id, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'New recovery codes generated',
        data: result,
    });
}));
const resetLink = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield auth_service_1.UserServices.resetLinkIntoDB(req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'The link create successfully!',
        data: result,
    });
}));
const forgetPassword = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield auth_service_1.UserServices.forgetPasswordIntoDB(req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'The link create successfully!',
        data: result,
    });
}));
const changePassword = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const token = req.headers.authorization;
    const result = yield auth_service_1.UserServices.changePasswordIntoDB(req.body, token);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Password reset successful!',
        data: result,
    });
}));
exports.UserControllers = {
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
