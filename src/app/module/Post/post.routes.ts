import express from "express";
import { PostControllers } from "./post.controller";
import Auth from "../../middlewares/auth";
import { USER_ROLE } from "../User/user.constants";

const router = express.Router();

router.post("/", Auth(USER_ROLE.USER), PostControllers.createPost);

router.get("/:id", PostControllers.getPostById);

router.get("/", PostControllers.getAllPosts);

router.patch("/:id", Auth(USER_ROLE.USER), PostControllers.updatePost);

router.delete(
  "/:id",
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  PostControllers.deletePost
);

// router.put(
//   "/:id",
//   Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
//   PostControllers.recoverPost
// );

router.put(
  "/report/:id/",
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  PostControllers.reportPost
);
export const PostRoutes = router;
