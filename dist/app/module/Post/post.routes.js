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
router.post("/", (0, auth_1.default)(user_constants_1.USER_ROLE.USER), post_controller_1.PostControllers.createPost);
router.get("/:id", post_controller_1.PostControllers.getPostById);
router.get("/", post_controller_1.PostControllers.getAllPosts);
router.patch("/:id", (0, auth_1.default)(user_constants_1.USER_ROLE.USER), post_controller_1.PostControllers.updatePost);
router.delete("/:id", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), post_controller_1.PostControllers.deletePost);
router.put("/:id", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), post_controller_1.PostControllers.recoverPost);
exports.PostRoutes = router;
