"use strict";
"us3e client";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRoutes = void 0;
const express_1 = __importDefault(require("express"));
const user_controller_1 = require("./user.controller");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const user_constants_1 = require("./user.constants");
const router = express_1.default.Router();
// Get all normal users (Admin only)
router.get("/normal-users", user_controller_1.UserControllers.getAllUser);
// Get all premium users (Admin only)
router.get("/premium-users", user_controller_1.UserControllers.getAlPremiumUser);
// Get all normal users (Admin only)
router.get("/normal-users-analytics", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), user_controller_1.UserControllers.getAllUserForAnalytics);
// Get all premium users (Admin only)
router.get("/premium-users-analytics", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN), user_controller_1.UserControllers.getAlPremiumUser);
// Get a single user by ID
router.get("/:id", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), user_controller_1.UserControllers.getUser);
// Update user status by ID (Admin only)
router.patch("/:id/status", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN), user_controller_1.UserControllers.updateUserStatus);
// Update user role by ID (Admin only)
router.patch("/:id/role", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN), user_controller_1.UserControllers.updateUserRole);
// Get all posts from a specific user by userId
router.get("/posts/:userId", user_controller_1.UserControllers.getSingleUserPosts);
// Follow a user (User and Admin roles allowed)
router.patch("/follow/:followedUserId", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), user_controller_1.UserControllers.followUser);
// Unfollow a user (User and Admin roles allowed)
router.patch("/un-follow/:unFollowedUserId", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), user_controller_1.UserControllers.unFollowUser);
exports.UserRoutes = router;
