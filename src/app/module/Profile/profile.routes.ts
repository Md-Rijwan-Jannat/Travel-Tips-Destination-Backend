import express from "express";
import { ProfileControllers } from "./profile.controler";
import Auth from "../../middlewares/auth";
import { USER_ROLE } from "../User/user.constants";
import { ProfileValidation } from "./profile.validation";
import validateRequest from "../../middlewares/validateRequest";

const router = express.Router();

router.get(
  "/",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ProfileControllers.getMyProfile
);
router.get(
  "/my-posts",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ProfileControllers.getMyPosts
);
router.get(
  "/my-premium-posts",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ProfileControllers.getMyPremiumPosts
);

router.patch(
  "/:id",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(ProfileValidation.updateMyProfileValidationSchema),
  ProfileControllers.updateMyProfile
);

router.delete(
  "/:id",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ProfileControllers.deleteMyProfile
);

router.get(
  "/followers",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ProfileControllers.getMyFollowers
);
router.get(
  "/following",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ProfileControllers.getMyFollowing
);

export const ProfileRoutes = router;
