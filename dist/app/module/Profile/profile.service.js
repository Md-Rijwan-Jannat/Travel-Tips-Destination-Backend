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
exports.ProfileServices = void 0;
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const user_model_1 = require("../User/user.model");
const user_constants_1 = require("../User/user.constants");
const post_model_1 = require("../Post/post.model");
const QueryBuilder_1 = __importDefault(require("../../builder/QueryBuilder"));
const post_constants_1 = require("../Post/post.constants");
// Get my profile by email
const getMyProfileFormDB = (email) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findOne({ email });
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    if (user.status === user_constants_1.USER_STATUS.BLOCKED) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "User is blocked");
    }
    return user;
});
// Update my profile by id and email
const updateMyProfileIntoDB = (payload, id, email) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findOne({ _id: id, email });
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    if (user.status === user_constants_1.USER_STATUS.BLOCKED) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "User is blocked");
    }
    // Update user profile
    const updatedUser = yield user_model_1.User.findByIdAndUpdate(id, payload, { new: true });
    return updatedUser;
});
// Delete my profile by id and email
const deleteMyProfileFromDB = (id, email) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findOne({ _id: id, email });
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    if (user.status === user_constants_1.USER_STATUS.BLOCKED) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "User is blocked");
    }
    const result = yield user_model_1.User.findByIdAndDelete(id);
    return result;
});
// Get my posts
const getMyPosts = (id, query) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findById(id);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    if (user.status === user_constants_1.USER_STATUS.BLOCKED) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "User is blocked");
    }
    const postQueryBuilder = new QueryBuilder_1.default(post_model_1.Post.find({ user: user._id, isDeleted: false, status: "FREE" })
        .populate({
        path: "user",
    })
        .populate({
        path: "comments",
        populate: {
            path: "user",
            model: "User",
        },
    }), query)
        .search(post_constants_1.postSearchFields)
        .sort()
        .fields()
        .filter();
    const result = yield postQueryBuilder.modelQuery;
    return result;
});
// Get my premium posts
const getMyPremiumPosts = (id, query) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findById(id);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    if (user.status === user_constants_1.USER_STATUS.BLOCKED) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "User is blocked");
    }
    const postQueryBuilder = new QueryBuilder_1.default(post_model_1.Post.find({ user: user._id, isDeleted: false, status: "PREMIUM" })
        .populate({
        path: "user",
    })
        .populate({
        path: "comments",
        populate: {
            path: "user",
            model: "User",
        },
    }), query)
        .search(post_constants_1.postSearchFields)
        .sort()
        .fields()
        .filter();
    const result = yield postQueryBuilder.modelQuery;
    return result;
});
const myFollowersFromDB = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findById(userId);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    const followerIds = user.follower;
    const followers = yield user_model_1.User.find({ _id: { $in: followerIds } });
    return followers;
});
const myFollowingFromDB = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findById(userId);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    const followingIds = user.following;
    const following = yield user_model_1.User.find({ _id: { $in: followingIds } });
    return following;
});
exports.ProfileServices = {
    updateMyProfileIntoDB,
    getMyProfileFormDB,
    deleteMyProfileFromDB,
    getMyPosts,
    getMyPremiumPosts,
    myFollowersFromDB,
    myFollowingFromDB,
};
