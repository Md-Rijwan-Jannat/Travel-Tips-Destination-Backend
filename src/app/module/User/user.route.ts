/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import validateRequest from "../../middlewares/validateRequest";
import { UserControllers } from "./user.controller";
import { UserValidation } from "./user.validation";

const router = express.Router();

router.post(
  "/create-user",
  validateRequest(UserValidation.registerUserValidationSchema),
  UserControllers.registerUser
);

export const UserRoutes = router;
