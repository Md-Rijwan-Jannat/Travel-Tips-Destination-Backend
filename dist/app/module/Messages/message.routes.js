"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageRoutes = void 0;
const express_1 = __importDefault(require("express"));
const auth_1 = __importDefault(require("../../middlewares/auth"));
const user_constants_1 = require("../User/user.constants");
const message_controller_1 = require("./message.controller");
const validateRequest_1 = __importDefault(require("../../middlewares/validateRequest"));
const message_validation_1 = require("./message.validation");
const rateLimiter_1 = require("../../middlewares/rateLimiter");
const router = express_1.default.Router();
// Message routes
router.post("/", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), rateLimiter_1.messageActionLimiter, (0, validateRequest_1.default)(message_validation_1.MessageValidation.createMessageValidationSchema), message_controller_1.MessageController.createMessage);
router.post("/:chatId/read", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), message_controller_1.MessageController.markChatRead);
router.get("/:chatId/unread-count", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), message_controller_1.MessageController.getUnreadCount);
// View-once consumption (must be declared before the generic /:chatId GET)
router.post("/:id/view-once", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), rateLimiter_1.messageActionLimiter, message_controller_1.MessageController.consumeViewOnceMedia);
// Emoji reactions (paths are two segments, so they never shadow /:chatId or /:id)
router.post("/:id/react", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), rateLimiter_1.messageActionLimiter, (0, validateRequest_1.default)(message_validation_1.MessageValidation.reactToMessageValidationSchema), message_controller_1.MessageController.reactToMessage);
router.delete("/:id/react", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), rateLimiter_1.messageActionLimiter, message_controller_1.MessageController.removeReaction);
router.patch("/:id", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), rateLimiter_1.messageActionLimiter, (0, validateRequest_1.default)(message_validation_1.MessageValidation.editMessageValidationSchema), message_controller_1.MessageController.editMessage);
router.delete("/:id", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), rateLimiter_1.messageActionLimiter, message_controller_1.MessageController.deleteMessage);
router.get("/:chatId", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), message_controller_1.MessageController.getMessages);
exports.MessageRoutes = router;
