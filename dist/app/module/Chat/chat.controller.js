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
exports.ChatController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const chat_service_1 = require("./chat.service");
const user_model_1 = require("../User/user.model");
// Create a new chat
const createChat = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const chat = yield chat_service_1.ChatServices.createChatIntoDB(req.body, req.user.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Chat created successfully',
        data: chat,
    });
}));
// Fetch all user chats
const getUserChats = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { result, meta } = yield chat_service_1.ChatServices.getUserChatsFromDB(req.user.id, req.query);
    const populatedResults = yield user_model_1.User.populate(result, {
        path: 'latestMessage.sender',
        select: '_id name image email verified',
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Chats retrieved successfully',
        meta,
        data: populatedResults,
    });
}));
// Fetch all user chats
const getSingleChat = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { chatId } = req.params;
    const result = yield chat_service_1.ChatServices.getSingleChatFromDB(chatId, req.user.id);
    const populatedResults = yield user_model_1.User.populate(result, {
        path: 'latestMessage.sender',
        select: '_id name image email verified',
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Chat retrieved successfully',
        data: populatedResults,
    });
}));
// Create a new group chat
const createGroupChat = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const groupChat = yield chat_service_1.ChatServices.createGroupChatInDB(req.body, req.user.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: 'Group chat created successfully',
        data: groupChat,
    });
}));
// Rename a group chat
const renameGroup = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const updatedChat = yield chat_service_1.ChatServices.renameGroupChat(req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Group chat renamed successfully',
        data: updatedChat,
    });
}));
// Remove a user from the group
const removeFromGroup = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const updatedChat = yield chat_service_1.ChatServices.removeFromGroup(req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'User removed from group',
        data: updatedChat,
    });
}));
// Add a user to the group
const addToGroup = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const updatedChat = yield chat_service_1.ChatServices.addToGroup(req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'User added to group',
        data: updatedChat,
    });
}));
exports.ChatController = {
    createChat,
    getUserChats,
    getSingleChat,
    createGroupChat,
    renameGroup,
    removeFromGroup,
    addToGroup,
};
