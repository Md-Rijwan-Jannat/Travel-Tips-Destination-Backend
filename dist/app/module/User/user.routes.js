"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRoutes = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
const express_1 = __importDefault(require("express"));
const user_controller_1 = require("./user.controller");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const user_constants_1 = require("./user.constants");
const router = express_1.default.Router();
router.get("/", user_controller_1.UserControllers.getAllUser);
router.get("/:id", user_controller_1.UserControllers.getUser);
router.get("/posts/:userId", user_controller_1.UserControllers.getSingleUserPosts);
router.post("/follow/:followedUserId", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), user_controller_1.UserControllers.followUser);
router.post("/un-follow/:unFollowedUserId", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), user_controller_1.UserControllers.unFollowUser);
exports.UserRoutes = router;
