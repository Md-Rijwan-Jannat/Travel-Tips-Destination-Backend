/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import { UserControllers } from "./user.controller";

const router = express.Router();

router.get("/", UserControllers.getAllUser);
router.get("/:id", UserControllers.getUser);

export const UserRoutes = router;
