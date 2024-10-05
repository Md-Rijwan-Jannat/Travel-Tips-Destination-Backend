import express from "express";
import { CommentControllers } from "./comment.controller";
import { CommentValidation } from "./comment.validation";
import validateRequest from "../../middlewares/validateRequest";
import Auth from "../../middlewares/auth";
import { USER_ROLE } from "../User/user.constants";

const router = express.Router();

// Add a comment
router.post(
  "/",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(CommentValidation.createCommentValidationSchema),
  CommentControllers.addComment,
);

// Get comments for a post
router.get(
  "/all-comments",
  Auth(USER_ROLE.ADMIN),
  CommentControllers.getAllComment,
);

// Get comments for a post
router.get(
  "/:postId",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  CommentControllers.getCommentForPost,
);

// Update a comment
router.patch(
  "/:id",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(CommentValidation.updateCommentValidationSchema),
  CommentControllers.updateComment,
);

// Delete a comment
router.delete(
  "/:id",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  CommentControllers.deleteComment,
);

// Reply to a comment
router.post(
  "/:id/reply",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(CommentValidation.replyValidationSchema),
  CommentControllers.replyToComment,
);

export const CommentRoutes = router;
