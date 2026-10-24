"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationRoutes = void 0;
const express_1 = __importDefault(require("express"));
const auth_1 = __importDefault(require("../../middlewares/auth"));
const user_constants_1 = require("../User/user.constants");
const notification_controller_1 = require("./notification.controller");
const router = express_1.default.Router();
router.get("/", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), notification_controller_1.NotificationControllers.getMyNotifications);
router.get("/unread-count", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), notification_controller_1.NotificationControllers.getUnreadCount);
router.patch("/read-all", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), notification_controller_1.NotificationControllers.markAllRead);
router.patch("/:id/read", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), notification_controller_1.NotificationControllers.markRead);
router.delete("/:id", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), notification_controller_1.NotificationControllers.deleteNotification);
exports.NotificationRoutes = router;
