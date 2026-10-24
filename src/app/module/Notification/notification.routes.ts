import express from "express";
import Auth from "../../middlewares/auth";
import { USER_ROLE } from "../User/user.constants";
import { NotificationControllers } from "./notification.controller";

const router = express.Router();

router.get("/", Auth(USER_ROLE.USER, USER_ROLE.ADMIN), NotificationControllers.getMyNotifications);
router.get("/unread-count", Auth(USER_ROLE.USER, USER_ROLE.ADMIN), NotificationControllers.getUnreadCount);
router.patch("/read-all", Auth(USER_ROLE.USER, USER_ROLE.ADMIN), NotificationControllers.markAllRead);
router.patch("/:id/read", Auth(USER_ROLE.USER, USER_ROLE.ADMIN), NotificationControllers.markRead);
router.delete("/:id", Auth(USER_ROLE.USER, USER_ROLE.ADMIN), NotificationControllers.deleteNotification);

export const NotificationRoutes = router;
