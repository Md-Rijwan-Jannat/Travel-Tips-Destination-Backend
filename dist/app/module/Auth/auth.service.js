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
exports.UserServices = void 0;
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
const http_status_1 = __importDefault(require("http-status"));
const config_1 = __importDefault(require("../../../config"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const tokenGenerateFunction_1 = require("../../utils/tokenGenerateFunction");
const user_model_1 = require("../User/user.model");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const sendEmail_1 = require("../../utils/sendEmail");
const registerUserIntoDB = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findOne({ email: payload.email });
    if (!user) {
        const result = yield user_model_1.User.create(payload);
        const jwtPayload = {
            id: result._id,
            email: payload.email,
            role: "USER",
        };
        const accessToken = (0, tokenGenerateFunction_1.createToken)(jwtPayload, config_1.default.jwt_access_secret, config_1.default.jwt_access_expires_in);
        const refreshToken = (0, tokenGenerateFunction_1.createToken)(jwtPayload, config_1.default.jwt_access_secret, config_1.default.jwt_refresh_expires_in);
        return {
            result,
            accessToken: accessToken,
            refreshToken: refreshToken,
        };
    }
});
const loginUserFromDB = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findOne({ email: payload.email });
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    const userStatus = user === null || user === void 0 ? void 0 : user.status;
    if (userStatus === "BLOCKED") {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "This user is blocked!");
    }
    //checking if the password is correct
    if (!(yield user_model_1.User.isPasswordMatched(payload.password, user === null || user === void 0 ? void 0 : user.password)))
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Password do not matched");
    const jwtPayload = {
        id: user._id,
        email: user.email,
        role: user.role,
    };
    const accessToken = (0, tokenGenerateFunction_1.createToken)(jwtPayload, config_1.default.jwt_access_secret, config_1.default.jwt_access_expires_in);
    const refreshToken = (0, tokenGenerateFunction_1.createToken)(jwtPayload, config_1.default.jwt_access_secret, config_1.default.jwt_refresh_expires_in);
    return {
        accessToken: accessToken,
        refreshToken: refreshToken,
    };
});
const forgetPasswordIntoDB = (email) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findOne({ email: email });
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "This user is not found!");
    }
    if (user.isDeleted === true) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "This user is deleted!");
    }
    if (user.status == "BLOCKED") {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "This user is blocked!");
    }
    const jwtPayload = {
        id: user._id,
        email: user.email,
        role: user.role,
    };
    const resetToken = (0, tokenGenerateFunction_1.createToken)(jwtPayload, config_1.default.jwt_access_secret, "10m");
    const resetLink = `${config_1.default.reset_link_url}?email=${user.email}&token=${resetToken}`;
    // Send email to the user with the reset link
    yield (0, sendEmail_1.sendEmail)(user.email, resetLink);
});
const resetPasswordIntoDB = (payload, token) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(payload);
    const user = yield user_model_1.User.findOne({ email: payload === null || payload === void 0 ? void 0 : payload.email });
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "This user is not found!");
    }
    if (user.isDeleted === true) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "This user is deleted!");
    }
    if (user.status == "BLOCKED") {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "This user is blocked!");
    }
    // Check if token is valid
    const decoded = jsonwebtoken_1.default.verify(token, config_1.default.jwt_access_secret);
    if (payload.email !== decoded.email) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "This user is forbidden!");
    }
    const newHashPassword = yield bcrypt_1.default.hash(payload.newPassword, Number(config_1.default.bcrypt_salt_rounds));
    const result = yield user_model_1.User.findOneAndUpdate({ _id: decoded.id, role: decoded.role }, {
        password: newHashPassword,
    }, { new: true });
    return result;
});
exports.UserServices = {
    registerUserIntoDB,
    loginUserFromDB,
    forgetPasswordIntoDB,
    resetPasswordIntoDB,
};
