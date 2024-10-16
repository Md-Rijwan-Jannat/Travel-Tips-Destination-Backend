import express from "express";
import Auth from "../../middlewares/auth";
import { USER_ROLE } from "../User/user.constants";
import { MessageController } from "./message.controller";

const router = express.Router();

// Message routes
router.post(
  "/",
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  MessageController.createMessage
);
router.get(
  "/:chatId",
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  MessageController.getMessages
);

export const MessageRoutes = router;
