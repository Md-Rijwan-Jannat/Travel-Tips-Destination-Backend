"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallRoutes = void 0;
const express_1 = __importDefault(require("express"));
const auth_1 = __importDefault(require("../../middlewares/auth"));
const user_constants_1 = require("../User/user.constants");
const call_controller_1 = require("./call.controller");
const router = express_1.default.Router();
// Call history for a chat (invites/accept/reject/end/signaling happen over
// Socket.IO — see socketIoServer.ts — and re-check membership there).
router.get("/chat/:chatId", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), call_controller_1.CallController.getCalls);
exports.CallRoutes = router;
