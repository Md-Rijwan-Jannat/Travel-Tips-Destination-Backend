import express from "express";
import { ReactController } from "./react.controller";
import { ReactValidation } from "./react.validation";
import Auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { socialActionLimiter } from "../../middlewares/rateLimiter";
import { USER_ROLE } from "../User/user.constants";

const router = express.Router();

// Routes for reacting to :post

// Get all likes
router.get("/:type/likes", Auth(USER_ROLE.ADMIN), ReactController.getAllLikes);

// Get all dislikes
router.get(
  "/:type/dislikes",
  Auth(USER_ROLE.ADMIN),
  ReactController.getAllDislikes,
);

// Aggregated counts per reaction type + caller's own reaction.
// Declared before the generic dynamic routes for clarity.
router.get(
  "/summary/:targetType/:targetId",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ReactController.getReactionSummary,
);

// Unified 7-type reaction: create or change the caller's single reaction.
router.post(
  "/:targetType/:targetId",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  socialActionLimiter,
  validateRequest(ReactValidation.setReactionValidationSchema),
  ReactController.setReaction,
);

// Unified: remove the caller's reaction.
router.delete(
  "/:targetType/:targetId",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  socialActionLimiter,
  ReactController.removeReaction,
);

// Like
router.post(
  "/:type/:targetId/like",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ReactController.like,
);

// Unlike
router.post(
  "/:type/:targetId/unlike",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ReactController.unlike,
);

// dislike
router.post(
  "/:type/:targetId/dislike",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ReactController.dislike,
);

// undislike
router.post(
  "/:type/:targetId/undislike",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ReactController.undislike,
);

export const ReactRoutes = router;
