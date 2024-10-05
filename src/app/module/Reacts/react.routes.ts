import express from "express";
import { ReactController } from "./react.controller";
import Auth from "../../middlewares/auth";
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
