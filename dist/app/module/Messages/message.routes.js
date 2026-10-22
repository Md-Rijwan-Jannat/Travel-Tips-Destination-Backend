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
const router = express_1.default.Router();
// Message routes
router.post("/", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), message_controller_1.MessageController.createMessage);
router.get("/:chatId", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN, user_constants_1.USER_ROLE.USER), message_controller_1.MessageController.getMessages);
exports.MessageRoutes = router;
