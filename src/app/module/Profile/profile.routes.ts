import express from "express";
import { ProfileControllers } from "./profile.controler";
import Auth from "../../middlewares/auth";
import { USER_ROLE } from "../User/user.constants";
import { ProfileValidation } from "./profile.validation";
import validateRequest from "../../middlewares/validateRequest";

const router = express.Router();

router.get("/", Auth(USER_ROLE.USER), ProfileControllers.getMyProfile);

router.patch(
  "/:id",
  Auth(USER_ROLE.USER),
  validateRequest(ProfileValidation.updateMyProfileValidationSchema),
  ProfileControllers.updateMyProfile
);

router.delete("/:id", Auth(USER_ROLE.USER), ProfileControllers.deleteMyProfile);

export const ProfileRoutes = router;