/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import validateRequest from "../../middlewares/validateRequest";
import { UserControllers } from "./auth.controller";
import { UserValidation } from "./auth.validation";

const router = express.Router();

router.post(
  "/register",
  validateRequest(UserValidation.registerUserValidationSchema),
  UserControllers.registerUser
);

router.post(
  "/login",
  validateRequest(UserValidation.loginUserValidationSchema),
  UserControllers.loginUser
);
export const AuthRoutes = router;
