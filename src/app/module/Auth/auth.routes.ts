/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import validateRequest from "../../middlewares/validateRequest";
import { UserControllers } from "./auth.controller";
import { UserValidation } from "./auth.validation";
import Auth from "../../middlewares/auth";
import { USER_ROLE } from "../User/user.constants";

const router = express.Router();

router.post(
  "/register",
  validateRequest(UserValidation.registerUserValidationSchema),
  UserControllers.registerUser,
);

router.post(
  "/login",
  validateRequest(UserValidation.loginUserValidationSchema),
  UserControllers.loginUser,
);

router.post("/forget-password", UserControllers.forgetPassword);

router.post(
  "/reset-password",
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  UserControllers.resetPassword,
);
export const AuthRoutes = router;
