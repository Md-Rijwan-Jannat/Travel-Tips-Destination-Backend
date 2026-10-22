"use strict";
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
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
const http_status_1 = __importDefault(require("http-status"));
const QueryBuilder_1 = __importDefault(require("../../builder/QueryBuilder"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const user_model_1 = require("./user.model");
const user_utils_1 = require("./user.utils");
const mongoose_1 = __importDefault(require("mongoose"));
const user_constants_1 = require("./user.constants");
const post_model_1 = require("../Post/post.model");
const post_constants_1 = require("../Post/post.constants");
const getAllUserFromDB = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const usersQueryBuilder = new QueryBuilder_1.default(user_model_1.User.find({ verified: false }), query)
        .fields()
        .paginate()
        .sort()
        .filter()
        .search(user_utils_1.UserSearchableFields);
    const result = yield usersQueryBuilder.modelQuery;
    const meta = yield usersQueryBuilder.countTotal();
    return {
        meta: meta,
        result: result,
    };
});
const getAllPremiumUserFromDB = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const usersQueryBuilder = new QueryBuilder_1.default(user_model_1.User.find({ verified: true }), query)
        .fields()
        .paginate()
        .sort()
        .filter()
        .search(user_utils_1.UserSearchableFields);
    const result = yield usersQueryBuilder.modelQuery;
    const meta = yield usersQueryBuilder.countTotal();
    return {
        meta: meta,
        result: result,
    };
});
const getAllUserForAnalytics = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const usersQueryBuilder = new QueryBuilder_1.default(user_model_1.User.find(), query).search(user_utils_1.UserSearchableFields);
    const result = yield usersQueryBuilder.modelQuery;
    return result;
});
const getAlPremiumUserForAnalytics = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_model_1.User.find({ verified: true });
    return result;
});
const updateUserStatus = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_model_1.User.findByIdAndUpdate(id, { status: payload.status }, { new: true });
    if (!result) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    return result;
});
const updateUserRole = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_model_1.User.findByIdAndUpdate(id, { role: payload.role }, { new: true });
    if (!result) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
    }
    return result;
});
const getUserFromDB = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_model_1.User.findById(id);
    if (!result) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "This user not found");
    }
    return result;
});
// Follow a user with transaction
const followUser = (userId, followedUserId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const session = yield mongoose_1.default.startSession();
    session.startTransaction();
    try {
        if (userId === followedUserId) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "You cannot follow yourself.");
        }
        const followerObjectId = new mongoose_1.default.Types.ObjectId(userId);
        const followedObjectId = new mongoose_1.default.Types.ObjectId(followedUserId);
        const user = yield user_model_1.User.findById(followerObjectId).session(session);
        const followedUser = yield user_model_1.User.findById(followedObjectId).session(session);
        if (!user || !followedUser) {
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
        }
        if (!((_a = user === null || user === void 0 ? void 0 : user.following) === null || _a === void 0 ? void 0 : _a.includes(followedObjectId))) {
            (_b = user === null || user === void 0 ? void 0 : user.following) === null || _b === void 0 ? void 0 : _b.push(followedObjectId);
        }
        else {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "You're already following");
        }
        if (!((_c = followedUser === null || followedUser === void 0 ? void 0 : followedUser.follower) === null || _c === void 0 ? void 0 : _c.includes(followerObjectId))) {
            (_d = followedUser === null || followedUser === void 0 ? void 0 : followedUser.follower) === null || _d === void 0 ? void 0 : _d.push(followerObjectId);
        }
        else {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "You're already following");
        }
        yield user.save({ session });
        yield followedUser.save({ session });
        // Commit the transaction
        yield session.commitTransaction();
        session.endSession();
        return {
            message: `You are now following ${followedUser.name}`,
        };
    }
    catch (error) {
        // If any error occurs, abort the transaction
        yield session.abortTransaction();
        session.endSession();
        throw error;
    }
});
// Unfollow a user with transaction
const unFollowUser = (userId, unFollowedUserId) => __awaiter(void 0, void 0, void 0, function* () {
    const session = yield mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const userObjectId = new mongoose_1.default.Types.ObjectId(userId);
        const unFollowedUserObjectId = new mongoose_1.default.Types.ObjectId(unFollowedUserId);
        const user = yield user_model_1.User.findById(userObjectId).session(session);
        const unFollowedUser = yield user_model_1.User.findById(unFollowedUserObjectId).session(session);
        if (!user || !unFollowedUser) {
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User not found");
        }
        const updateFollowingResult = yield user_model_1.User.updateOne({ _id: userObjectId }, { $pull: { following: unFollowedUserObjectId } }, { session });
        const updateFollowerResult = yield user_model_1.User.updateOne({ _id: unFollowedUserObjectId }, { $pull: { follower: userObjectId } }, { session });
        if (updateFollowingResult.modifiedCount === 0 ||
            updateFollowerResult.modifiedCount === 0) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Unfollow action failed");
        }
        // Commit the transaction
        yield session.commitTransaction();
        session.endSession();
        return {
            message: `You have unfollowed ${unFollowedUser.name}`,
        };
    }
    catch (error) {
        // If any error occurs, abort the transaction
        yield session.abortTransaction();
        session.endSession();
        throw error;
    }
});
// Get my posts
const getSingleUserAllPostsFromDB = (id, query) => __awaiter(void 0, void 0, void 0, function* () {
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
exports.UserServices = {
    getAllUserFromDB,
    getAllPremiumUserFromDB,
    getAlPremiumUserForAnalytics,
    getAllUserForAnalytics,
    updateUserStatus,
    updateUserRole,
    getUserFromDB,
    followUser,
    unFollowUser,
    getSingleUserAllPostsFromDB,
};
