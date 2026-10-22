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
exports.socketServer = void 0;
const socket_io_1 = require("socket.io");
const mongoose_1 = require("mongoose");
const config_1 = __importDefault(require("./config"));
const tokenGenerateFunction_1 = require("./app/utils/tokenGenerateFunction");
const chat_model_1 = require("./app/module/Chat/chat.model");
const isValidObjectIdString = (value) => typeof value === "string" && mongoose_1.Types.ObjectId.isValid(value);
const extractId = (value) => {
    if (isValidObjectIdString(value))
        return value;
    if (typeof value === "object" && value !== null) {
        const id = value._id;
        if (isValidObjectIdString(id))
            return id;
    }
    return undefined;
};
const socketServer = (server) => {
    const io = new socket_io_1.Server(server, {
        pingTimeout: 60000,
        cors: {
            origin: [
                "http://localhost:3000",
                "https://traveltipsdestinationcommunity.vercel.app",
            ],
            methods: ["GET", "POST"],
            credentials: true,
        },
    });
    // Handshake authentication: every socket must present a valid access token.
    // Identity for every later event comes from this verified token — never
    // from client-sent payloads (which previously allowed any anonymous
    // client to `setup` into any user's room and eavesdrop).
    io.use((socket, next) => {
        var _a, _b, _c;
        const raw = (_b = (_a = socket.handshake.auth) === null || _a === void 0 ? void 0 : _a.token) !== null && _b !== void 0 ? _b : (_c = socket.handshake.headers) === null || _c === void 0 ? void 0 : _c.authorization;
        if (typeof raw !== "string" || raw.length === 0) {
            return next(new Error("Authentication required"));
        }
        const token = raw.startsWith("Bearer ") ? raw.slice(7) : raw;
        try {
            const decoded = (0, tokenGenerateFunction_1.verifyToken)(token, config_1.default.jwt_access_secret);
            const userId = typeof decoded.id === "string" ? decoded.id : undefined;
            if (!userId || !mongoose_1.Types.ObjectId.isValid(userId)) {
                return next(new Error("Authentication failed"));
            }
            socket.data.userId = userId;
            return next();
        }
        catch (_d) {
            return next(new Error("Authentication failed"));
        }
    });
    const connectedUsers = [];
    const broadcastOnlineUsers = () => {
        // Deduplicated: one entry per user id even with multiple sockets.
        io.emit("online users", [
            ...new Set(connectedUsers.map((user) => user.userId)),
        ]);
    };
    io.on("connection", (socket) => {
        const userId = socket.data.userId;
        // Register presence when the client signals readiness. The payload is
        // intentionally ignored — the room is always the verified identity.
        socket.on("setup", () => {
            if (!connectedUsers.some((user) => user.socketId === socket.id)) {
                connectedUsers.push({ socketId: socket.id, userId });
            }
            socket.join(userId);
            socket.emit("connected");
            broadcastOnlineUsers();
        });
        // Allow clients to explicitly ask for the presence list.
        socket.on("get online users", () => {
            socket.emit("online users", [
                ...new Set(connectedUsers.map((user) => user.userId)),
            ]);
        });
        // Join a chat room only after verifying membership in the database —
        // any user can no longer eavesdrop on arbitrary conversations.
        socket.on("join chat", (room) => __awaiter(void 0, void 0, void 0, function* () {
            if (!isValidObjectIdString(room)) {
                return;
            }
            try {
                const isMember = yield chat_model_1.Chat.exists({ _id: room, users: userId });
                if (!isMember) {
                    socket.emit("unauthorized", room);
                    return;
                }
                socket.join(room);
            }
            catch (_a) {
                socket.emit("unauthorized", room);
            }
        }));
        // Typing indicators may only be broadcast into rooms this socket has
        // been authorized to join (no DB hit per keystroke).
        socket.on("typing", (room) => {
            if (!isValidObjectIdString(room) || !socket.rooms.has(room)) {
                return;
            }
            socket.in(room).emit("typing");
        });
        socket.on("stop typing", (room) => {
            if (!isValidObjectIdString(room) || !socket.rooms.has(room)) {
                return;
            }
            socket.in(room).emit("stop typing");
        });
        // Deliver a message notification only to the REAL chat members from the
        // database, and only when the authenticated sender is that member — the
        // client-supplied `chat.users` list is never trusted for routing, and the
        // payload's sender cannot be spoofed.
        socket.on("new message", (newMessageReceived) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            if (typeof newMessageReceived !== "object" || newMessageReceived === null) {
                return;
            }
            const message = newMessageReceived;
            const chatId = extractId(message.chat);
            const senderId = extractId(message.sender);
            if (!chatId || !senderId || senderId !== userId) {
                return;
            }
            try {
                const chat = yield chat_model_1.Chat.findById(chatId).select("users").lean();
                if (!chat) {
                    return;
                }
                const members = ((_a = chat.users) !== null && _a !== void 0 ? _a : []).map((member) => String(member));
                if (!members.includes(userId)) {
                    return;
                }
                for (const member of members) {
                    if (member === userId) {
                        continue;
                    }
                    io.to(member).emit("message received", newMessageReceived);
                }
            }
            catch (_b) {
                // Malformed id or DB error → drop the event.
            }
        }));
        socket.on("disconnect", () => {
            const index = connectedUsers.findIndex((user) => user.socketId === socket.id);
            if (index !== -1) {
                connectedUsers.splice(index, 1);
                broadcastOnlineUsers();
            }
        });
    });
    return io;
};
exports.socketServer = socketServer;
