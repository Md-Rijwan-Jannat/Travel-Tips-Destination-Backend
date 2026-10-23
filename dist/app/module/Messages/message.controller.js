"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageController = void 0;
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const http_status_1 = __importDefault(require("http-status"));
const message_service_1 = require("./message.service");
// Create a new message (typed: TEXT / IMAGE / VOICE / LOCATION / EMOJI / VIEW_ONCE_IMAGE)
const createMessage = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const message = yield message_service_1.MessageServices.createMessageIntoDB(req.body, {
        id: req.user.id,
        role: req.user.role,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: "Message created successfully",
        data: message,
    });
}));
// Fetch messages for a chat (optional ?page=&limit= pagination)
const getMessages = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { messages, meta } = yield message_service_1.MessageServices.getMessagesByChatId(req.params.chatId, { id: req.user.id, role: req.user.role }, req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Messages retrieved successfully",
        meta,
        data: messages,
    });
}));
// Mark every message in a chat as read for the current user
const markChatRead = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield message_service_1.MessageServices.markChatReadIntoDB(req.params.chatId, {
        id: req.user.id,
        role: req.user.role,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Chat marked as read",
        data: result,
    });
}));
// Unread message count for a chat
const getUnreadCount = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const count = yield message_service_1.MessageServices.getUnreadCountForChat(req.params.chatId, {
        id: req.user.id,
        role: req.user.role,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        data: { count },
    });
}));
// Edit a message (sender-only; text/caption or location coordinates)
const editMessage = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const message = yield message_service_1.MessageServices.editMessageIntoDB(req.params.id, req.body, { id: req.user.id, role: req.user.role });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Message updated successfully",
        data: message,
    });
}));
// Soft-delete a message (sender-only)
const deleteMessage = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield message_service_1.MessageServices.deleteMessageIntoDB(req.params.id, {
        id: req.user.id,
        role: req.user.role,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Message deleted successfully",
        data: "",
    });
}));
// Consume view-once media: returns the URL exactly once, then 410 forever
const consumeViewOnceMedia = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield message_service_1.MessageServices.consumeViewOnceMediaFromDB(req.params.id, { id: req.user.id, role: req.user.role });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "View-once media opened",
        data,
    });
}));
// Set/switch the caller's emoji reaction on a message
const reactToMessage = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield message_service_1.MessageServices.reactToMessageIntoDB(req.params.id, req.body.type, { id: req.user.id, role: req.user.role });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Reaction saved",
        data,
    });
}));
// Remove the caller's emoji reaction (idempotent)
const removeReaction = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield message_service_1.MessageServices.removeReactionFromMessageIntoDB(req.params.id, { id: req.user.id, role: req.user.role });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Reaction removed",
        data,
    });
}));
exports.MessageController = {
    createMessage,
    getMessages,
    markChatRead,
    getUnreadCount,
    editMessage,
    deleteMessage,
    consumeViewOnceMedia,
    reactToMessage,
    removeReaction,
};
