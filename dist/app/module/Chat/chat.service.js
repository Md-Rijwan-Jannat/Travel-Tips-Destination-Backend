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
const message_model_1 = require("../Messages/message.model");
const message_service_1 = require("../Messages/message.service");
const user_model_1 = require("../User/user.model");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const socketRegistry_1 = require("../../utils/socketRegistry");
// Create chart service
const createChatIntoDB = (payload, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findById(payload.user);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "This user not found");
    }
    const existingChat = yield chat_model_1.Chat.find({
        isGroupChat: false,
        $and: [
            { users: { $elemMatch: { $eq: userId } } },
            { users: { $elemMatch: { $eq: user._id } } },
        ],
    })
        .populate("users", "-password")
        .populate("latestMessage")
        .populate("groupAdmin", "-password");
    if (existingChat.length > 0) {
        yield user_model_1.User.populate(existingChat, {
            path: "latestMessage.sender",
            select: "-password",
        });
        return (0, message_service_1.sanitizeChatLatestMessage)(existingChat[0], userId);
    }
    const chatData = {
        chatName: "sender",
        isGroupChat: false,
        users: [new mongoose_1.Types.ObjectId(userId), new mongoose_1.Types.ObjectId(user._id)],
    };
    const newChat = yield chat_model_1.Chat.create(chatData);
    const fullChat = yield chat_model_1.Chat.findOne({ _id: newChat._id })
        .populate("users", "-password")
        .populate("latestMessage");
    return fullChat
        ? (0, message_service_1.sanitizeChatLatestMessage)(fullChat, userId)
        : null;
});
// Fetch all chats for a user
const getUserChatsFromDB = (userId, query) => __awaiter(void 0, void 0, void 0, function* () {
    const limit = parseInt(String(query.limit)) || 10;
    const page = parseInt(String(query.page)) || 1;
    const user = yield user_model_1.User.findById(userId);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "This user is not found");
    }
    const chats = yield chat_model_1.Chat.find({
        users: { $elemMatch: { $eq: userId } },
    })
        .populate("users", "-password")
        .populate("latestMessage")
        .populate("groupAdmin", "-password")
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
    const total = yield chat_model_1.Chat.countDocuments({ users: userId });
    // Unread counts: messages in these chats the current user has not read
    // (readBy is maintained by the message fetch/mark-read flows).
    const chatIds = chats.map((c) => c._id);
    const unread = yield message_model_1.Message.aggregate([
        { $match: { chat: { $in: chatIds }, readBy: { $ne: new mongoose_1.Types.ObjectId(userId) } } },
        { $group: { _id: "$chat", count: { $sum: 1 } } },
    ]);
    const unreadMap = new Map(unread.map((u) => [String(u._id), u.count]));
    const result = chats.map((chat) => {
        var _a;
        const plain = Object.assign(Object.assign({}, chat.toObject()), { unreadCount: (_a = unreadMap.get(String(chat._id))) !== null && _a !== void 0 ? _a : 0 });
        return (0, message_service_1.sanitizeChatLatestMessage)(plain, userId);
    });
    const meta = {
        total,
        limit,
        page,
        totalPages: Math.ceil(total / limit),
    };
    return { result: result, meta };
});
// Fetch a single chat by chatId
const getSingleChatFromDB = (chatId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const chat = yield chat_model_1.Chat.findOne({
        _id: chatId,
        users: { $elemMatch: { $eq: userId } },
    })
        .populate("users", "-password")
        .populate("latestMessage")
        .populate("groupAdmin", "-password");
    if (!chat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Chat not found or user is not a participant");
    }
    return (0, message_service_1.sanitizeChatLatestMessage)(chat, userId);
});
// Create a new group chat
const createGroupChatInDB = (payload, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const users = payload.users;
    if (!userId) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "User ID is not provided");
    }
    if (users) {
        if (users.length < 2) {
            throw new Error("More than 2 users are required to form a group chat");
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
        .populate("users", "-password")
        .populate("groupAdmin", "-password");
});
const assertChatMembership = (chat, requester) => {
    var _a;
    const isMember = ((_a = chat.users) !== null && _a !== void 0 ? _a : []).some((u) => String(u) === requester.id);
    if (!isMember && requester.role !== "ADMIN") {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are not a participant of this chat");
    }
};
const renameGroupChat = (payload, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const { chatId, chatName } = payload;
    const chat = yield chat_model_1.Chat.findById(chatId).select("users");
    if (!chat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Chat Not Found");
    }
    assertChatMembership(chat, requester);
    const updatedChat = yield chat_model_1.Chat.findByIdAndUpdate(chatId, { chatName }, { new: true })
        .populate("users", "-password")
        .populate("groupAdmin", "-password");
    if (!updatedChat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Chat Not Found");
    }
    return updatedChat;
});
// Remove a user from group chat (requester must be a chat participant)
const removeFromGroup = (payload, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const { chatId, userId } = payload;
    const chat = yield chat_model_1.Chat.findById(chatId).select("users");
    if (!chat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Chat Not Found");
    }
    assertChatMembership(chat, requester);
    const updatedChat = yield chat_model_1.Chat.findByIdAndUpdate(chatId, { $pull: { users: userId } }, { new: true })
        .populate("users", "-password")
        .populate("groupAdmin", "-password");
    if (!updatedChat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Chat Not Found");
    }
    // Drop any live socket room subscription the removed user still holds.
    (0, socketRegistry_1.removeUserFromRoom)(userId, chatId);
    return updatedChat;
});
// Add a user to group chat (requester must be a chat participant)
const addToGroup = (payload, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const { chatId, userId } = payload;
    const chat = yield chat_model_1.Chat.findById(chatId).select("users isGroupChat");
    if (!chat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Chat Not Found");
    }
    assertChatMembership(chat, requester);
    // Only group conversations accept extra members — a DM can never grow a
    // third participant, and only real users can be added.
    if (!chat.isGroupChat) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Only group chats can add members");
    }
    if (!mongoose_1.Types.ObjectId.isValid(userId)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid user id");
    }
    const user = yield user_model_1.User.findById(userId).select("_id");
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "This user not found");
    }
    const updatedChat = yield chat_model_1.Chat.findByIdAndUpdate(chatId, { $addToSet: { users: userId } }, { new: true })
        .populate("users", "-password")
        .populate("groupAdmin", "-password");
    if (!updatedChat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Chat Not Found");
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
