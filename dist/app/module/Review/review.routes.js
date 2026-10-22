"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewRoutes = void 0;
const express_1 = __importDefault(require("express"));
const review_controller_1 = require("./review.controller");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const validateRequest_1 = __importDefault(require("../../middlewares/validateRequest"));
const review_validations_1 = require("./review.validations");
const user_constants_1 = require("../User/user.constants");
const router = express_1.default.Router();
router.post("/", (0, validateRequest_1.default)(review_validations_1.ReviewValidation.createReviewValidationSchema), (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), review_controller_1.ReviewController.createReview);
router.get("/", review_controller_1.ReviewController.getReviews);
router.patch("/:reviewId", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), (0, validateRequest_1.default)(review_validations_1.ReviewValidation.updateReviewValidationSchema), review_controller_1.ReviewController.updateReview);
router.delete("/:reviewId", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), review_controller_1.ReviewController.deleteReview);
exports.ReviewRoutes = router;
