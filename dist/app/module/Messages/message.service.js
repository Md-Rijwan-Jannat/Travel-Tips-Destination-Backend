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
exports.MessageServices = void 0;
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const message_model_1 = require("./message.model");
const chat_model_1 = require("../Chat/chat.model");
const getAccessibleChat = (chatId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const chat = yield chat_model_1.Chat.findById(chatId).select("users");
    if (!chat)
        return null;
    const isMember = ((_a = chat.users) !== null && _a !== void 0 ? _a : []).some((u) => String(u) === requester.id);
    // Non-members get the same 404 as a missing chat so the endpoint does not
    // reveal which chat IDs exist.
    if (!isMember && requester.role !== "ADMIN")
        return null;
    return chat;
});
// Create a new message (requester must be a participant of the target chat)
const createMessageIntoDB = (payload, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const chat = yield getAccessibleChat(String(payload.chat), requester);
    if (!chat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Chat not found");
    }
    const created = yield message_model_1.Message.create(Object.assign(Object.assign({}, payload), { sender: requester.id }));
    const populated = yield created.populate([
        { path: "sender", select: "-password" },
        {
            path: "chat",
            populate: [
                { path: "users", select: "-password" },
                {
                    path: "latestMessage",
                    populate: { path: "sender", select: "-password" },
                },
            ],
        },
    ]);
    yield chat_model_1.Chat.findByIdAndUpdate(payload.chat, {
        latestMessage: populated._id,
    });
    return populated;
});
// Get all messages by chat ID (requester must be a chat participant)
const getMessagesByChatId = (chatId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const chat = yield getAccessibleChat(chatId, requester);
    if (!chat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Chat not found");
    }
    const messages = yield message_model_1.Message.find({ chat: chatId })
        .populate("sender", "-password")
        .populate({
        path: "chat",
        populate: [
            { path: "users", select: "-password" },
            {
                path: "latestMessage",
                populate: { path: "sender", select: "-password" },
            },
        ],
    });
    if (!messages.length) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "No messages found for this chat");
    }
    return messages;
});
exports.MessageServices = {
    createMessageIntoDB,
    getMessagesByChatId,
};
