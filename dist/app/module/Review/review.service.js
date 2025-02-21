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
exports.ReviewService = void 0;
const QueryBuilder_1 = __importDefault(require("../../builder/QueryBuilder"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const review_mnodel_1 = require("./review.mnodel");
const createReview = (userId, data) => __awaiter(void 0, void 0, void 0, function* () {
    const review = yield review_mnodel_1.Review.create(Object.assign(Object.assign({}, data), { user: userId }));
    return review;
});
const getReviews = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const reviewQueryBuilder = new QueryBuilder_1.default(review_mnodel_1.Review.find().populate({
        path: "user",
    }), query)
        .search(["content"])
        .sort()
        .fields()
        .filter()
        .paginate();
    // Execute the query
    const result = yield reviewQueryBuilder.modelQuery;
    const meta = yield reviewQueryBuilder.countTotal();
    return { result, meta };
});
const updateReview = (reviewId, userId, data) => __awaiter(void 0, void 0, void 0, function* () {
    const review = yield review_mnodel_1.Review.findOneAndUpdate({ _id: reviewId, user: userId }, data, { new: true });
    if (!review)
        throw new AppError_1.default(404, "Review not found or unauthorized");
    return review;
});
const deleteReview = (reviewId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const review = yield review_mnodel_1.Review.findOneAndDelete({ _id: reviewId, user: userId });
    if (!review)
        throw new AppError_1.default(404, "Review not found or unauthorized");
    return review;
});
exports.ReviewService = {
    createReview,
    getReviews,
    updateReview,
    deleteReview,
};
