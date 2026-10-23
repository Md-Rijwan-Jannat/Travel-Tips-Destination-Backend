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
const message_model_1 = require("./app/module/Messages/message.model");
const call_service_1 = require("./app/module/Call/call.service");
const call_interface_1 = require("./app/module/Call/call.interface");
const AppError_1 = __importDefault(require("./app/errors/AppError"));
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
/** Id of a populated ref or a raw ObjectId, as a string. */
const refId = (value) => { var _a; return String((_a = value === null || value === void 0 ? void 0 : value._id) !== null && _a !== void 0 ? _a : value); };
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
        // Per-socket message rate limit (abuse/spam protection on the
        // real-time channel). Sliding 60s window, generous for humans.
        let messageTimestamps = [];
        const withinMessageBudget = () => {
            const now = Date.now();
            messageTimestamps = messageTimestamps.filter((t) => now - t < 60000);
            if (messageTimestamps.length >= 60)
                return false;
            messageTimestamps.push(now);
            return true;
        };
        // Deliver a message notification only to the REAL chat members from the
        // database, and only when the authenticated sender is that member — the
        // client-supplied `chat.users` list is never trusted for routing, the
        // payload's sender cannot be spoofed, and view-once media URLs are
        // stripped from the relayed copy (recipients must consume them through
        // the one-shot REST endpoint).
        socket.on("new message", (newMessageReceived) => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            if (typeof newMessageReceived !== "object" || newMessageReceived === null) {
                return;
            }
            const message = newMessageReceived;
            const chatId = extractId(message.chat);
            const senderId = extractId(message.sender);
            if (!chatId || !senderId || senderId !== userId) {
                return;
            }
            const messageType = typeof message.messageType === "string" &&
                ["TEXT", "IMAGE", "VOICE", "LOCATION", "EMOJI", "VIEW_ONCE_IMAGE", "LIVE_LOCATION"].includes(message.messageType)
                ? message.messageType
                : "TEXT";
            const content = typeof message.content === "string" ? message.content : "";
            if (content.length > 5000) {
                return;
            }
            // Per-type minimum payload (creation itself was validated on REST).
            const hasMedia = typeof message.mediaUrl === "string" && message.mediaUrl.startsWith("https://");
            const hasLocation = typeof message.location === "object" &&
                message.location !== null &&
                typeof message.location.lat === "number";
            if (messageType === "TEXT" && content.trim().length === 0) {
                return;
            }
            if ((messageType === "IMAGE" ||
                messageType === "VOICE" ||
                messageType === "VIEW_ONCE_IMAGE") &&
                !hasMedia) {
                return;
            }
            if (messageType === "LOCATION" || messageType === "LIVE_LOCATION") {
                if (!hasLocation)
                    return;
                // Live shares are tracked by their id — without it recipients could
                // never receive position patches.
                if (messageType === "LIVE_LOCATION" &&
                    !extractId(newMessageReceived._id)) {
                    return;
                }
            }
            if (!withinMessageBudget()) {
                socket.emit("rate limited", { chat: chatId });
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
                // Reply preview: re-read the parent from the database (never trust a
                // client-supplied preview) and only expose the safe projection.
                let replyTo = null;
                const replyToId = extractId(message.replyTo);
                if (replyToId) {
                    const parent = yield message_model_1.Message.findById(replyToId)
                        .select("chat content messageType isDeleted sender")
                        .populate("sender", "name image")
                        .lean();
                    if (parent && String(parent.chat) === chatId) {
                        const sender = parent.sender;
                        replyTo = {
                            _id: replyToId,
                            sender: {
                                _id: String((_b = sender === null || sender === void 0 ? void 0 : sender._id) !== null && _b !== void 0 ? _b : ""),
                                name: typeof (sender === null || sender === void 0 ? void 0 : sender.name) === "string" ? sender.name : "",
                                image: typeof (sender === null || sender === void 0 ? void 0 : sender.image) === "string" ? sender.image : null,
                            },
                            content: parent.isDeleted
                                ? ""
                                : typeof parent.content === "string"
                                    ? parent.content.slice(0, 300)
                                    : "",
                            messageType: (_c = parent.messageType) !== null && _c !== void 0 ? _c : "TEXT",
                            isDeleted: Boolean(parent.isDeleted),
                        };
                    }
                }
                // LIVE_LOCATION expiry is server-set — re-read it from the database
                // instead of trusting anything the client relays.
                let liveLocation = null;
                if (messageType === "LIVE_LOCATION") {
                    const doc = yield message_model_1.Message.findById(extractId(newMessageReceived._id))
                        .select("liveLocation")
                        .lean();
                    if ((_d = doc === null || doc === void 0 ? void 0 : doc.liveLocation) === null || _d === void 0 ? void 0 : _d.expiresAt) {
                        liveLocation = {
                            expiresAt: doc.liveLocation.expiresAt.toISOString(),
                        };
                    }
                    else {
                        return; // session unknown or already expired
                    }
                }
                // Normalized relay: sender forced to the verified identity, and the
                // view-once media URL never travels over the broadcast channel.
                const relayPayload = {
                    _id: extractId(newMessageReceived._id),
                    chat: chatId,
                    sender: userId,
                    messageType,
                    content,
                    mediaUrl: messageType === "VIEW_ONCE_IMAGE" ? null : hasMedia ? message.mediaUrl : null,
                    mediaMeta: messageType === "VOICE" || messageType === "IMAGE" ? (_e = message.mediaMeta) !== null && _e !== void 0 ? _e : null : null,
                    location: messageType === "LOCATION" || messageType === "LIVE_LOCATION"
                        ? message.location
                        : null,
                    liveLocation,
                    replyTo,
                    createdAt: (_f = newMessageReceived.createdAt) !== null && _f !== void 0 ? _f : new Date().toISOString(),
                };
                for (const member of members) {
                    if (member === userId) {
                        continue;
                    }
                    io.to(member).emit("message received", relayPayload);
                }
            }
            catch (_g) {
                // Malformed id or DB error → drop the event.
            }
        }));
        // ---------------------------------------------------------------------
        // Live location sharing: the sharer streams throttled position patches
        // into the chat room; only the message owner can update/stop, only while
        // the server-set session window is still open.
        // ---------------------------------------------------------------------
        let liveLocationTimestamps = [];
        const withinLiveLocationBudget = () => {
            const now = Date.now();
            liveLocationTimestamps = liveLocationTimestamps.filter((t) => now - t < 60000);
            if (liveLocationTimestamps.length >= 60)
                return false;
            liveLocationTimestamps.push(now);
            return true;
        };
        const normalizeLiveLocation = (raw) => {
            if (typeof raw !== "object" || raw === null)
                return null;
            const loc = raw;
            if (typeof loc.lat !== "number" || typeof loc.lng !== "number")
                return null;
            if (loc.lat < -90 || loc.lat > 90 || loc.lng < -180 || loc.lng > 180)
                return null;
            return {
                lat: loc.lat,
                lng: loc.lng,
                label: typeof loc.label === "string" ? loc.label.slice(0, 200) : undefined,
            };
        };
        const liveShareTarget = (payload) => {
            if (typeof payload !== "object" || payload === null)
                return null;
            const p = payload;
            const messageId = extractId(p.messageId);
            const chatId = extractId(p.chat);
            if (!messageId || !chatId)
                return null;
            // Room membership was DB-verified when the client joined the chat room.
            if (!socket.rooms.has(chatId))
                return null;
            return { messageId, chatId };
        };
        socket.on("live:update", (payload) => __awaiter(void 0, void 0, void 0, function* () {
            const target = liveShareTarget(payload);
            if (!target || !withinLiveLocationBudget())
                return;
            const location = normalizeLiveLocation(payload.location);
            if (!location)
                return;
            try {
                const updated = yield message_model_1.Message.updateOne({
                    _id: target.messageId,
                    chat: target.chatId,
                    sender: userId,
                    messageType: "LIVE_LOCATION",
                    isDeleted: false,
                    "liveLocation.expiresAt": { $gt: new Date() },
                }, { $set: { location } });
                if (updated.modifiedCount !== 1)
                    return;
                socket
                    .to(target.chatId)
                    .emit("live:position", {
                    messageId: target.messageId,
                    chat: target.chatId,
                    location,
                });
            }
            catch (_a) {
                // Malformed id or DB error → drop the event.
            }
        }));
        socket.on("live:stop", (payload) => __awaiter(void 0, void 0, void 0, function* () {
            const target = liveShareTarget(payload);
            if (!target)
                return;
            try {
                const stopped = yield message_model_1.Message.updateOne({
                    _id: target.messageId,
                    chat: target.chatId,
                    sender: userId,
                    messageType: "LIVE_LOCATION",
                    isDeleted: false,
                    "liveLocation.expiresAt": { $gt: new Date() },
                }, { $set: { "liveLocation.expiresAt": new Date(0) } });
                if (stopped.modifiedCount !== 1)
                    return;
                socket.to(target.chatId).emit("live:ended", {
                    messageId: target.messageId,
                    chat: target.chatId,
                });
            }
            catch (_a) {
                // Malformed id or DB error → drop the event.
            }
        }));
        // ---------------------------------------------------------------------
        // WebRTC call signaling. Every transition and every relayed SDP/ICE
        // payload re-checks call participation in the database — the identity
        // always comes from the verified handshake token.
        // ---------------------------------------------------------------------
        // Per-socket call-invite budget (spam protection on the realtime channel).
        let callInviteTimestamps = [];
        const withinCallInviteBudget = () => {
            const now = Date.now();
            callInviteTimestamps = callInviteTimestamps.filter((t) => now - t < 5 * 60000);
            if (callInviteTimestamps.length >= 10)
                return false;
            callInviteTimestamps.push(now);
            return true;
        };
        const emitCallError = (message) => {
            socket.emit("call:error", { message });
        };
        /**
         * Group mesh join: room entry + roster hand-off (the joiner offers to
         * everyone already present) + stop the rings of the remaining invitees.
         * Used both when a member accepts and when they press "call" to join an
         * already-ACTIVE group call.
         */
        const emitGroupJoin = (call, userIdValue, chatUsers) => {
            var _a;
            const callId = String(call._id);
            socket.join(`call:${callId}`);
            const participants = ((_a = call.participants) !== null && _a !== void 0 ? _a : []).map((p) => refId(p));
            const chatId = refId(call.chat);
            socket.to(`call:${callId}`).emit("call:participant-joined", {
                callId,
                chatId,
                userId: userIdValue,
                mediaType: call.mediaType,
                participants,
            });
            socket.emit("call:joined", {
                callId,
                chatId,
                mediaType: call.mediaType,
                isGroupCall: true,
                participants,
            });
            // Stop the rings of invitees who have not joined yet.
            const members = chatUsers.map((u) => refId(u));
            for (const member of members) {
                if (member === userIdValue || participants.includes(member))
                    continue;
                io.to(member).emit("call:answered", { callId });
            }
        };
        socket.on("call:invite", (payload) => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            const body = payload;
            const chatId = extractId(body === null || body === void 0 ? void 0 : body.chatId);
            if (!chatId) {
                return emitCallError("Invalid chat");
            }
            if (!withinCallInviteBudget()) {
                return emitCallError("Too many call attempts, please try again later");
            }
            const mediaType = (body === null || body === void 0 ? void 0 : body.mediaType) === call_interface_1.CALL_MEDIA_TYPE.VIDEO
                ? call_interface_1.CALL_MEDIA_TYPE.VIDEO
                : call_interface_1.CALL_MEDIA_TYPE.AUDIO;
            try {
                const call = yield call_service_1.CallServices.inviteToCallFromDB(chatId, mediaType, { id: userId, role: "USER" });
                const callId = String(call._id);
                socket.join(`call:${callId}`);
                const participants = ((_a = call.participants) !== null && _a !== void 0 ? _a : []).map((p) => refId(p));
                const chatUsers = ((_c = (_b = call.chat) === null || _b === void 0 ? void 0 : _b.users) !== null && _c !== void 0 ? _c : []);
                socket.emit("call:outgoing", {
                    callId,
                    chatId,
                    mediaType: call.mediaType,
                    callee: call.callee ? refId(call.callee) : null,
                    isGroupCall: Boolean(call.isGroupCall),
                    participants,
                    inviteeCount: Math.max(0, chatUsers.map((u) => refId(u)).length - 1),
                });
                if (call.isGroupCall) {
                    // Group: ring every OTHER member of the conversation.
                    const members = chatUsers.map((u) => refId(u));
                    for (const member of members) {
                        if (member === userId)
                            continue;
                        io.to(member).emit("call:incoming", {
                            callId,
                            chatId,
                            mediaType: call.mediaType,
                            caller: userId,
                            isGroupCall: true,
                        });
                    }
                }
                else {
                    io.to(refId(call.callee)).emit("call:incoming", {
                        callId,
                        chatId,
                        mediaType: call.mediaType,
                        caller: refId(call.caller),
                    });
                }
            }
            catch (error) {
                // Group: pressing "call" while the conversation already has an ACTIVE
                // group call joins it instead of failing.
                if (error instanceof AppError_1.default && error.statusCode === 409) {
                    try {
                        const joined = yield call_service_1.CallServices.joinActiveGroupCallFromDB(chatId, { id: userId, role: "USER" });
                        if (joined === null || joined === void 0 ? void 0 : joined.isGroupCall) {
                            emitGroupJoin(joined, userId, ((_e = (_d = joined.chat) === null || _d === void 0 ? void 0 : _d.users) !== null && _e !== void 0 ? _e : []));
                            return;
                        }
                    }
                    catch (inner) {
                        emitCallError(inner instanceof AppError_1.default ? inner.message : "Unable to join call");
                        return;
                    }
                }
                emitCallError(error instanceof AppError_1.default ? error.message : "Unable to start call");
            }
        }));
        socket.on("call:accept", (payload) => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b;
            const callId = extractId(payload === null || payload === void 0 ? void 0 : payload.callId);
            if (!callId)
                return;
            try {
                const call = yield call_service_1.CallServices.acceptCallFromDB(callId, {
                    id: userId,
                    role: "USER",
                });
                if (call.isGroupCall) {
                    // Room entry, roster hand-off and ring cleanup in one place.
                    emitGroupJoin(call, userId, ((_b = (_a = call.chat) === null || _a === void 0 ? void 0 : _a.users) !== null && _b !== void 0 ? _b : []));
                    return;
                }
                socket.join(`call:${callId}`);
                io.to(refId(call.caller)).emit("call:accepted", {
                    callId,
                    mediaType: call.mediaType,
                });
            }
            catch (error) {
                emitCallError(error instanceof AppError_1.default ? error.message : "Unable to accept call");
            }
        }));
        socket.on("call:reject", (payload) => __awaiter(void 0, void 0, void 0, function* () {
            const callId = extractId(payload === null || payload === void 0 ? void 0 : payload.callId);
            if (!callId)
                return;
            try {
                const call = yield call_service_1.CallServices.rejectCallFromDB(callId, {
                    id: userId,
                    role: "USER",
                });
                if (call.isGroupCall) {
                    // Personal decline: only the starter hears about it, the ring for
                    // everyone else continues.
                    io.to(refId(call.caller)).emit("call:declined", { callId, userId });
                    return;
                }
                io.to(refId(call.caller)).emit("call:rejected", {
                    callId,
                });
            }
            catch (error) {
                emitCallError(error instanceof AppError_1.default ? error.message : "Unable to reject call");
            }
        }));
        socket.on("call:end", (payload) => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c;
            const callId = extractId(payload === null || payload === void 0 ? void 0 : payload.callId);
            if (!callId)
                return;
            try {
                const call = yield call_service_1.CallServices.endCallFromDB(callId, {
                    id: userId,
                    role: "USER",
                });
                if (call.isGroupCall) {
                    if (call.status === call_interface_1.CALL_STATUS.ENDED ||
                        call.status === call_interface_1.CALL_STATUS.CANCELLED) {
                        // Ring cancelled or the last participant left → reset everyone.
                        const members = ((_b = (_a = call.chat) === null || _a === void 0 ? void 0 : _a.users) !== null && _b !== void 0 ? _b : []).map((u) => refId(u));
                        for (const member of members) {
                            if (member === userId)
                                continue;
                            io.to(member).emit("call:ended", {
                                callId,
                                status: call.status,
                                durationSeconds: call.durationSeconds,
                            });
                        }
                    }
                    else {
                        // The requester left; the call continues for the rest.
                        socket.to(`call:${callId}`).emit("call:participant-left", {
                            callId,
                            userId,
                            participants: ((_c = call.participants) !== null && _c !== void 0 ? _c : []).map((p) => refId(p)),
                        });
                    }
                    return;
                }
                const other = refId(call.caller) === userId
                    ? refId(call.callee)
                    : refId(call.caller);
                io.to(other).emit("call:ended", {
                    callId,
                    status: call.status,
                    durationSeconds: call.durationSeconds,
                });
            }
            catch (error) {
                emitCallError(error instanceof AppError_1.default ? error.message : "Unable to end call");
            }
        }));
        // SDP/ICE relay between participants of a live call only: pairs for DMs,
        // per-target inside the participant roster for mesh group calls.
        socket.on("call:signal", (payload) => __awaiter(void 0, void 0, void 0, function* () {
            const body = payload;
            const callId = extractId(body === null || body === void 0 ? void 0 : body.callId);
            const kind = body === null || body === void 0 ? void 0 : body.kind;
            if (!callId ||
                (kind !== "offer" && kind !== "answer" && kind !== "candidate")) {
                return;
            }
            // Size caps: an SDP blob or ICE candidate is small; anything larger is abuse.
            const sdp = typeof body.sdp === "string" && body.sdp.length <= 100000 ? body.sdp : undefined;
            const candidate = typeof body.candidate === "string" && body.candidate.length <= 10000
                ? body.candidate
                : undefined;
            if (kind !== "candidate" && sdp === undefined) {
                return;
            }
            try {
                const { caller, callee, isGroupCall, participants } = yield call_service_1.CallServices.assertLiveCallParticipant(callId, userId);
                if (isGroupCall) {
                    // Mesh: address one live participant of this call; roster enforced
                    // so a member cannot aim signals at outsiders.
                    const to = isValidObjectIdString(body.to) ? body.to : undefined;
                    if (!to || to === userId || !participants.includes(to)) {
                        return;
                    }
                    io.to(to).emit("call:signal", {
                        callId,
                        kind,
                        sdp,
                        candidate,
                        from: userId,
                        to,
                    });
                    return;
                }
                const target = caller === userId ? callee : caller;
                io.to(target).emit("call:signal", {
                    callId,
                    kind,
                    sdp,
                    candidate,
                    from: userId,
                });
            }
            catch (_a) {
                // Inactive call or non-participant → drop the signal silently.
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
