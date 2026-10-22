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
exports.ProfileControllers = void 0;
const http_status_1 = __importDefault(require("http-status"));
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const profile_service_1 = require("./profile.service");
// Get my profile by email
const getMyProfile = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email } = req.user;
    const result = yield profile_service_1.ProfileServices.getMyProfileFormDB(email);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Profile retrieved successfully",
        data: result,
    });
}));
// Update my profile by req.params.id and req.user.email
const updateMyProfile = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email } = req.user;
    const { id } = req.params;
    const result = yield profile_service_1.ProfileServices.updateMyProfileIntoDB(req.body, id, email);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Profile updated successfully",
        data: result,
    });
}));
// Delete my profile by req.params.id and req.user.email
const deleteMyProfile = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email } = req.user;
    const { id } = req.params;
    const result = yield profile_service_1.ProfileServices.deleteMyProfileFromDB(id, email);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Profile deleted successfully",
        data: result,
    });
}));
// Get my posts
const getMyPosts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = req.user;
    const result = yield profile_service_1.ProfileServices.getMyPosts(user === null || user === void 0 ? void 0 : user.id, req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "My posts retrieved successfully",
        data: result,
    });
}));
// Get my posts
const getMyPremiumPosts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = req.user;
    const result = yield profile_service_1.ProfileServices.getMyPremiumPosts(user === null || user === void 0 ? void 0 : user.id, req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "My premium posts retrieved successfully",
        data: result,
    });
}));
// Get my posts
const getMyFollowers = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = req.user;
    const result = yield profile_service_1.ProfileServices.myFollowersFromDB(user === null || user === void 0 ? void 0 : user.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Followers retrieved successfully",
        data: result,
    });
}));
// Get my posts
const getMyFollowing = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = req.user;
    const result = yield profile_service_1.ProfileServices.myFollowingFromDB(user === null || user === void 0 ? void 0 : user.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Following retrieved successfully",
        data: result,
    });
}));
exports.ProfileControllers = {
    getMyProfile,
    updateMyProfile,
    deleteMyProfile,
    getMyPosts,
    getMyPremiumPosts,
    getMyFollowers,
    getMyFollowing,
};
