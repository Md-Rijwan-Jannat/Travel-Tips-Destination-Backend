import express from "express";
import { PostControllers } from "./post.controller";
import Auth from "../../middlewares/auth";
import { USER_ROLE } from "../User/user.constants";
import validateRequest from "../../middlewares/validateRequest";
import { PostValidation } from "./post.validation";

const router = express.Router();

// More specific route for premium posts
router.get(
  "/premium",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  PostControllers.getAllPremiumPosts,
);

// get All normal posts
router.get(
  "/",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  PostControllers.getAllPosts,
);
// get All normal posts
router.get(
  "/normal-posts-analytics",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  PostControllers.getAllPostsNormalForAnalytics,
);
// get All premium posts
router.get(
  "/premium-posts-analytics",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  PostControllers.getAllPostsPremiumForAnalytics,
);

// Dynamic route for post by ID
router.get(
  "/:id",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  PostControllers.getPostById,
);

// General routes
router.post(
  "/",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(PostValidation.createPostValidationSchema),
  PostControllers.createPost,
);

// update posts (owner or admin; ownership enforced in the service)
router.patch(
  "/:id",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(PostValidation.updatePostValidationSchema),
  PostControllers.updatePost,
);

// delete post
router.delete(
  "/:id",
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  PostControllers.deletePost,
);

// report a post
router.put(
  "/report/:id/",
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  PostControllers.reportPost,
);

// Profile pin / highlight (owner or admin; enforced in the service)
router.post(
  "/:id/pin",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(PostValidation.setFlagValidationSchema),
  PostControllers.setPin,
);

router.post(
  "/:id/feature",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(PostValidation.setFeatureFlagValidationSchema),
  PostControllers.setFeature,
);

// Group pin (group staff with `group:moderatePost`)
router.post(
  "/:id/group-pin",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(PostValidation.setFlagValidationSchema),
  PostControllers.setGroupPin,
);

// Per-user hide from my feed (idempotent)
router.post(
  "/:id/hide",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  PostControllers.hidePost,
);
router.delete(
  "/:id/hide",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  PostControllers.unhidePost,
);

// Post owner's comment ordering + featured-comment policy
router.patch(
  "/:id/comment-settings",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(PostValidation.commentSettingsValidationSchema),
  PostControllers.updateCommentSettings,
);

export const PostRoutes = router;
