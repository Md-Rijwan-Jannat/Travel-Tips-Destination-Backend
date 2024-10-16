"us3e client";

import express from "express";
import { UserControllers } from "./user.controller";
import Auth from "../../middlewares/auth";
import { USER_ROLE } from "./user.constants";

const router = express.Router();

// Get all normal users (Admin only)
router.get("/normal-users", UserControllers.getAllUser);

// Get all premium users (Admin only)
router.get("/premium-users", UserControllers.getAlPremiumUser);

// Get all normal users (Admin only)
router.get(
  "/normal-users-analytics",
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  UserControllers.getAllUserForAnalytics
);

// Get all premium users (Admin only)
router.get(
  "/premium-users-analytics",
  Auth(USER_ROLE.ADMIN),
  UserControllers.getAlPremiumUser
);

// Get a single user by ID
router.get(
  "/:id",
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  UserControllers.getUser
);

// Update user status by ID (Admin only)
router.patch(
  "/:id/status",
  Auth(USER_ROLE.ADMIN),
  UserControllers.updateUserStatus
);

// Update user role by ID (Admin only)
router.patch(
  "/:id/role",
  Auth(USER_ROLE.ADMIN),
  UserControllers.updateUserRole
);

// Get all posts from a specific user by userId
router.get("/posts/:userId", UserControllers.getSingleUserPosts);

// Follow a user (User and Admin roles allowed)
router.patch(
  "/follow/:followedUserId",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  UserControllers.followUser
);

// Unfollow a user (User and Admin roles allowed)
router.patch(
  "/un-follow/:unFollowedUserId",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  UserControllers.unFollowUser
);

export const UserRoutes = router;
