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
    const react = yield react_service_1.ReactService.likeFromDB(userId, targetId, type);
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
    yield react_service_1.ReactService.unlikeFromDB(userId, targetId, type);
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
    const react = yield react_service_1.ReactService.dislikeFromDB(userId, targetId, type);
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
    yield react_service_1.ReactService.undislikeFromDB(userId, targetId, type);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: `You undisliked the ${type} successfully.`,
        data: "",
    });
}));
exports.ReactController = {
    getAllLikes,
    getAllDislikes,
    like,
    unlike,
    dislike,
    undislike,
};
