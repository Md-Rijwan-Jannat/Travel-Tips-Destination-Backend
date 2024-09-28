/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import { UserControllers } from "./user.controller";

const router = express.Router();

router.get("/", UserControllers.getAllUser);

export const UserRoutes = router;
