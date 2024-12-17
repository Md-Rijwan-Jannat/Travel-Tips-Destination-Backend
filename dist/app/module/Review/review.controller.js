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
exports.ReviewController = void 0;
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const review_service_1 = require("./review.service");
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const createReview = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const review = yield review_service_1.ReviewService.createReview(req.user.id, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: 201,
        success: true,
        message: 'Review created successfully',
        data: review,
    });
}));
const getReviews = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { result, meta } = yield review_service_1.ReviewService.getReviews(req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Reviews fetched successfully',
        data: result,
        meta: meta,
    });
}));
const updateReview = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { reviewId } = req.params;
    const review = yield review_service_1.ReviewService.updateReview(reviewId, req.user.id, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Review updated successfully',
        data: review,
    });
}));
const deleteReview = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { reviewId } = req.params;
    yield review_service_1.ReviewService.deleteReview(reviewId, req.user.id);
    (0, sendResponse_1.default)(res, {
        statusCode: 204,
        success: true,
        message: 'Review deleted successfully',
    });
}));
exports.ReviewController = {
    createReview,
    getReviews,
    updateReview,
    deleteReview,
};
