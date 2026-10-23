import express from "express";
import Auth from "../../middlewares/auth";
import { USER_ROLE } from "../User/user.constants";
import { CallController } from "./call.controller";

const router = express.Router();

// Call history for a chat (invites/accept/reject/end/signaling happen over
// Socket.IO — see socketIoServer.ts — and re-check membership there).
router.get(
  "/chat/:chatId",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  CallController.getCalls,
);

export const CallRoutes = router;
