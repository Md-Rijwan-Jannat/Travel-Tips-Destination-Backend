import express from "express";
import { ReviewController } from "./review.controller";
import Auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { ReviewValidation } from "./review.validations";
import { USER_ROLE } from "../User/user.constants";

const router = express.Router();

router.post(
  "/",
  validateRequest(ReviewValidation.createReviewValidationSchema),
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  ReviewController.createReview
);

router.get("/", ReviewController.getReviews);

router.patch(
  "/:reviewId",
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  validateRequest(ReviewValidation.updateReviewValidationSchema),
  ReviewController.updateReview
);

router.delete(
  "/:reviewId",
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  ReviewController.deleteReview
);

export const ReviewRoutes = router;
