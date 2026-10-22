"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentRoutes = void 0;
const express_1 = __importDefault(require("express"));
const comment_controller_1 = require("./comment.controller");
const comment_validation_1 = require("./comment.validation");
const validateRequest_1 = __importDefault(require("../../middlewares/validateRequest"));
const auth_1 = __importDefault(require("../../middlewares/auth"));
const user_constants_1 = require("../User/user.constants");
const router = express_1.default.Router();
// Add a comment
router.post("/", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), (0, validateRequest_1.default)(comment_validation_1.CommentValidation.createCommentValidationSchema), comment_controller_1.CommentControllers.addComment);
// Get comments for a post
router.get("/all-comments", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN), comment_controller_1.CommentControllers.getAllComment);
// Get comments for a post
router.get("/:postId", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), comment_controller_1.CommentControllers.getCommentForPost);
// Update a comment
router.patch("/:id", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), (0, validateRequest_1.default)(comment_validation_1.CommentValidation.updateCommentValidationSchema), comment_controller_1.CommentControllers.updateComment);
// Delete a comment
router.delete("/:id", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), comment_controller_1.CommentControllers.deleteComment);
// Reply to a comment
router.post("/:id/reply", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), (0, validateRequest_1.default)(comment_validation_1.CommentValidation.replyValidationSchema), comment_controller_1.CommentControllers.replyToComment);
exports.CommentRoutes = router;
