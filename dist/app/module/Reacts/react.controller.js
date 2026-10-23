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
exports.ReactController = void 0;
const react_service_1 = require("./react.service");
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
// Like a post or comment
const getAllLikes = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const react = yield react_service_1.ReactService.getAllLikes();
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: `Likes are retrieved successfully.`,
        data: react,
    });
}));
// Like a post or comment
const getAllDislikes = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const react = yield react_service_1.ReactService.getAllDisLikes();
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: `Dislikes are retrieved successfully.`,
        data: react,
    });
}));
// Like a post or comment
const like = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { targetId, type } = req.params;
    const userId = req.user.id;
    const react = yield react_service_1.ReactService.likeFromDB(userId, targetId, type, { id: userId, role: req.user.role });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: `You liked the ${type} successfully.`,
        data: react,
    });
}));
// Unlike a post or comment
const unlike = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { targetId, type } = req.params;
    const userId = req.user.id;
    yield react_service_1.ReactService.unlikeFromDB(userId, targetId, type, {
        id: userId,
        role: req.user.role,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: `You unliked the ${type} successfully.`,
        data: "",
    });
}));
// Dislike a post or comment
const dislike = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { targetId, type } = req.params;
    const userId = req.user.id;
    const react = yield react_service_1.ReactService.dislikeFromDB(userId, targetId, type, { id: userId, role: req.user.role });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: `You disliked the ${type} successfully.`,
        data: react,
    });
}));
// Undislike a post or comment
const undislike = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { targetId, type } = req.params;
    const userId = req.user.id;
    yield react_service_1.ReactService.undislikeFromDB(userId, targetId, type, { id: userId, role: req.user.role });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: `You undisliked the ${type} successfully.`,
        data: "",
    });
}));
// Unified: set (create or change) one of the seven reactions.
const setReaction = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { targetType, targetId } = req.params;
    const userId = req.user.id;
    if (!react_service_1.ReactService.isTargetType(targetType)) {
        (0, sendResponse_1.default)(res, {
            statusCode: 400,
            success: false,
            message: "Invalid target type. Use post, comment or short.",
            data: "",
        });
        return;
    }
    const summary = yield react_service_1.ReactService.setReactionFromDB(userId, targetType, targetId, req.body.type, { id: userId, role: req.user.role });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Reaction updated successfully.",
        data: summary,
    });
}));
// Unified: remove the caller's reaction from a target.
const removeReaction = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { targetType, targetId } = req.params;
    const userId = req.user.id;
    if (!react_service_1.ReactService.isTargetType(targetType)) {
        (0, sendResponse_1.default)(res, {
            statusCode: 400,
            success: false,
            message: "Invalid target type. Use post, comment or short.",
            data: "",
        });
        return;
    }
    const summary = yield react_service_1.ReactService.removeReactionFromDB(userId, targetType, targetId, { id: userId, role: req.user.role });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Reaction removed successfully.",
        data: summary,
    });
}));
// Aggregated counts per type + the caller's own reaction.
const getReactionSummary = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { targetType, targetId } = req.params;
    const userId = req.user.id;
    if (!react_service_1.ReactService.isTargetType(targetType)) {
        (0, sendResponse_1.default)(res, {
            statusCode: 400,
            success: false,
            message: "Invalid target type. Use post, comment or short.",
            data: "",
        });
        return;
    }
    const summary = yield react_service_1.ReactService.getReactionSummary(userId, targetType, targetId, { requester: { id: userId, role: req.user.role } });
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: "Reaction summary retrieved successfully",
        data: summary,
    });
}));
exports.ReactController = {
    getAllLikes,
    getAllDislikes,
    like,
    unlike,
    dislike,
    undislike,
    setReaction,
    removeReaction,
    getReactionSummary,
};
