import express from "express";
import Auth from "../../middlewares/auth";
import { USER_ROLE } from "../User/user.constants";
import { MessageController } from "./message.controller";
import validateRequest from "../../middlewares/validateRequest";
import { MessageValidation } from "./message.validation";
import { messageActionLimiter } from "../../middlewares/rateLimiter";

const router = express.Router();

// Message routes
router.post(
  "/",
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  messageActionLimiter,
  validateRequest(MessageValidation.createMessageValidationSchema),
  MessageController.createMessage,
);

router.post(
  "/:chatId/read",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  MessageController.markChatRead,
);

router.get(
  "/:chatId/unread-count",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  MessageController.getUnreadCount,
);

// View-once consumption (must be declared before the generic /:chatId GET)
router.post(
  "/:id/view-once",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  messageActionLimiter,
  MessageController.consumeViewOnceMedia,
);

router.patch(
  "/:id",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  messageActionLimiter,
  validateRequest(MessageValidation.editMessageValidationSchema),
  MessageController.editMessage,
);

router.delete(
  "/:id",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  messageActionLimiter,
  MessageController.deleteMessage,
);

router.get(
  "/:chatId",
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  MessageController.getMessages,
);

export const MessageRoutes = router;
