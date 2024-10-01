import express from "express";
import { PostControllers } from "./post.controller";
import Auth from "../../middlewares/auth";
import { USER_ROLE } from "../User/user.constants";

const router = express.Router();

// More specific route for premium posts
router.get(
  "/premium",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  PostControllers.getAllPremiumPosts
);

// Dynamic route for post by ID
router.get(
  "/:id",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  PostControllers.getPostById
);

// General routes
router.post(
  "/",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  PostControllers.createPost
);

router.get(
  "/",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  PostControllers.getAllPosts
);

router.patch("/:id", Auth(USER_ROLE.USER), PostControllers.updatePost);

router.delete(
  "/:id",
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  PostControllers.deletePost
);

router.put(
  "/report/:id/",
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  PostControllers.reportPost
);

export const PostRoutes = router;
