"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostRoutes = void 0;
const express_1 = __importDefault(require("express"));
const post_controller_1 = require("./post.controller");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const user_constants_1 = require("../User/user.constants");
const router = express_1.default.Router();
// More specific route for premium posts
router.get("/premium", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), post_controller_1.PostControllers.getAllPremiumPosts);
// get All normal posts
router.get("/", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), post_controller_1.PostControllers.getAllPosts);
// get All normal posts
router.get("/normal-posts-analytics", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), post_controller_1.PostControllers.getAllPostsNormalForAnalytics);
// get All premium posts
router.get("/premium-posts-analytics", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), post_controller_1.PostControllers.getAllPostsPremiumForAnalytics);
// Dynamic route for post by ID
router.get("/:id", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), post_controller_1.PostControllers.getPostById);
// General routes
router.post("/", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), post_controller_1.PostControllers.createPost);
// update posts
router.patch("/:id", (0, auth_1.default)(user_constants_1.USER_ROLE.USER), post_controller_1.PostControllers.updatePost);
// delete post
router.delete("/:id", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), post_controller_1.PostControllers.deletePost);
// report a post
router.put("/report/:id/", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), post_controller_1.PostControllers.reportPost);
exports.PostRoutes = router;
