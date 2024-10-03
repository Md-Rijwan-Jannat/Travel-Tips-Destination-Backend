import express from "express";
import { ReactController } from "./react.controller";
import Auth from "../../middlewares/auth";
import { USER_ROLE } from "../User/user.constants";

const router = express.Router();

// Routes for reacting to :post
router.get(
  "/",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ReactController.getAllReacts
);
router.post(
  "/:type/:targetId/like",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ReactController.like
);
router.post(
  "/:type/:targetId/unlike",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ReactController.unlike
);
router.post(
  "/:type/:targetId/dislike",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ReactController.dislike
);
router.post(
  "/:type/:targetId/undislike",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ReactController.undislike
);

export const ReactRoutes = router;
