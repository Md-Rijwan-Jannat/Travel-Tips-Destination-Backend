/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import { UserControllers } from "./user.controller";
import Auth from "../../middlewares/auth";
import { USER_ROLE } from "./user.constants";

const router = express.Router();

router.get("/", UserControllers.getAllUser);
router.get("/:id", UserControllers.getUser);
router.post(
  "/follow/:followedUserId",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  UserControllers.followUser
);
router.post(
  "/un-follow/:unFollowedUserId",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  UserControllers.unFollowUser
);

export const UserRoutes = router;
