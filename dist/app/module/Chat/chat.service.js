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
exports.ChatServices = void 0;
const mongoose_1 = require("mongoose");
const chat_model_1 = require("./chat.model");
const user_model_1 = require("../User/user.model");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
// Create chart service
const createChatIntoDB = (payload, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findById(payload.user);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'This user not found');
    }
    const existingChat = yield chat_model_1.Chat.find({
        isGroupChat: false,
        $and: [
            { users: { $elemMatch: { $eq: userId } } },
            { users: { $elemMatch: { $eq: user._id } } },
        ],
    })
        .populate('users', '-password')
        .populate('latestMessage')
        .populate('groupAdmin', '-password');
    if (existingChat.length > 0) {
        yield user_model_1.User.populate(existingChat, {
            path: 'latestMessage.sender',
            select: '-password',
        });
        return existingChat[0];
    }
    const chatData = {
        chatName: 'sender',
        isGroupChat: false,
        users: [new mongoose_1.Types.ObjectId(userId), new mongoose_1.Types.ObjectId(user._id)],
    };
    const newChat = yield chat_model_1.Chat.create(chatData);
    const fullChat = yield chat_model_1.Chat.findOne({ _id: newChat._id })
        .populate('users', '-password')
        .populate('latestMessage');
    return fullChat;
});
// Fetch all chats for a user
const getUserChatsFromDB = (userId, query) => __awaiter(void 0, void 0, void 0, function* () {
    const limit = parseInt(query.limit) || 10;
    const page = parseInt(query.page) || 1;
    const user = yield user_model_1.User.findById(userId);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'This user is not found');
    }
    const chats = yield chat_model_1.Chat.find({
        users: { $elemMatch: { $eq: userId } },
    })
        .populate('users', '-password')
        .populate('latestMessage')
        .populate('groupAdmin', '-password')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
    const total = yield chat_model_1.Chat.countDocuments({ users: userId });
    const meta = {
        total,
        limit,
        page,
        totalPages: Math.ceil(total / limit),
    };
    return { result: chats, meta };
});
// Fetch a single chat by chatId
const getSingleChatFromDB = (chatId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const chat = yield chat_model_1.Chat.findOne({
        _id: chatId,
        users: { $elemMatch: { $eq: userId } },
    })
        .populate('users', '-password')
        .populate('latestMessage')
        .populate('groupAdmin', '-password');
    if (!chat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Chat not found or user is not a participant');
    }
    return chat;
});
// Create a new group chat
const createGroupChatInDB = (payload, userId) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(userId, payload);
    const users = payload.users;
    if (!userId) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'User ID is not provided');
    }
    if (users) {
        if (users.length < 2) {
            throw new Error('More than 2 users are required to form a group chat');
        }
        users.push(userId);
    }
    const groupChat = yield chat_model_1.Chat.create({
        chatName: payload.chatName,
        users: users,
        isGroupChat: true,
        groupAdmin: userId,
    });
    return yield chat_model_1.Chat.findOne({ _id: groupChat._id })
        .populate('users', '-password')
        .populate('groupAdmin', '-password');
});
// Rename group chat
const renameGroupChat = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { chatId, chatName } = payload;
    const updatedChat = yield chat_model_1.Chat.findByIdAndUpdate(chatId, { chatName }, { new: true })
        .populate('users', '-password')
        .populate('groupAdmin', '-password');
    if (!updatedChat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Chat Not Found');
    }
    return updatedChat;
});
// Remove a user from group chat
const removeFromGroup = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { chatId, userId } = payload;
    const updatedChat = yield chat_model_1.Chat.findByIdAndUpdate(chatId, { $pull: { users: userId } }, { new: true })
        .populate('users', '-password')
        .populate('groupAdmin', '-password');
    if (!updatedChat) {
        throw new Error('Chat Not Found');
    }
    return updatedChat;
});
// Add a user to group chat
const addToGroup = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { chatId, userId } = payload;
    const updatedChat = yield chat_model_1.Chat.findByIdAndUpdate(chatId, { $push: { users: userId } }, { new: true })
        .populate('users', '-password')
        .populate('groupAdmin', '-password');
    if (!updatedChat) {
        throw new Error('Chat Not Found');
    }
    return updatedChat;
});
exports.ChatServices = {
    createChatIntoDB,
    getUserChatsFromDB,
    getSingleChatFromDB,
    createGroupChatInDB,
    renameGroupChat,
    removeFromGroup,
    addToGroup,
};
