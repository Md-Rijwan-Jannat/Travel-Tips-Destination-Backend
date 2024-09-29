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
const registerUserIntoDB = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(payload);
    const jwtPayload = {
        email: payload.email,
        role: payload.role,
    };
    const accessToken = (0, tokenGenerateFunction_1.createToken)(jwtPayload, config_1.default.jwt_access_secret, config_1.default.jwt_access_expires_in);
    const refreshToken = (0, tokenGenerateFunction_1.createToken)(jwtPayload, config_1.default.jwt_access_secret, config_1.default.jwt_refresh_expires_in);
    const result = yield user_model_1.User.create(payload);
    return {
        result,
        accessToken: accessToken,
        refreshToken: refreshToken,
    };
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
const changeStatus = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_model_1.User.findByIdAndUpdate(id, payload, {
        new: true,
    });
    return result;
});
exports.UserServices = {
    registerUserIntoDB,
    loginUserFromDB,
    changeStatus,
};
