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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeChatLatestMessage = exports.MessageServices = void 0;
const http_status_1 = __importDefault(require("http-status"));
const mongoose_1 = require("mongoose");
const message_interface_1 = require("./message.interface");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const message_model_1 = require("./message.model");
const chat_model_1 = require("../Chat/chat.model");
const group_model_1 = require("../Group/group.model");
const groupMembership_model_1 = require("../Group/groupMembership.model");
const group_constants_1 = require("../Group/group.constants");
const react_interface_1 = require("../Reacts/react.interface");
const socketRegistry_1 = require("../../utils/socketRegistry");
const getAccessibleChat = (chatId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // groupCommunity must be selected: group messaging policy checks depend on it.
    const chat = yield chat_model_1.Chat.findById(chatId).select("users groupCommunity groupAdmin isGroupChat");
    if (!chat)
        return null;
    const isMember = ((_a = chat.users) !== null && _a !== void 0 ? _a : []).some((u) => String(u) === requester.id);
    // Non-members get the same 404 as a missing chat so the endpoint does not
    // reveal which chat IDs exist.
    if (!isMember && requester.role !== "ADMIN")
        return null;
    return chat;
});
/** Enforce the per-type content rules before anything touches the database. */
const validateTypedPayload = (messageType, payload) => {
    var _a;
    const content = typeof payload.content === "string" ? payload.content.trim() : "";
    switch (messageType) {
        case message_interface_1.MESSAGE_TYPE.TEXT:
            if (!content || content.length > 5000) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Text messages require non-empty content under 5000 characters");
            }
            break;
        case message_interface_1.MESSAGE_TYPE.EMOJI:
            if (!content || content.length > 16) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Emoji messages require 1-16 characters of content");
            }
            break;
        case message_interface_1.MESSAGE_TYPE.IMAGE:
        case message_interface_1.MESSAGE_TYPE.VIEW_ONCE_IMAGE:
            if (!payload.mediaUrl) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Image messages require a mediaUrl");
            }
            break;
        case message_interface_1.MESSAGE_TYPE.VOICE: {
            if (!payload.mediaUrl) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Voice messages require a mediaUrl");
            }
            const duration = (_a = payload.mediaMeta) === null || _a === void 0 ? void 0 : _a.durationSeconds;
            if (typeof duration !== "number" || duration < 1 || duration > 600) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Voice messages require mediaMeta.durationSeconds between 1 and 600");
            }
            break;
        }
        case message_interface_1.MESSAGE_TYPE.LOCATION:
        case message_interface_1.MESSAGE_TYPE.LIVE_LOCATION: {
            const location = payload.location;
            if (!location ||
                typeof location.lat !== "number" ||
                typeof location.lng !== "number" ||
                location.lat < -90 ||
                location.lat > 90 ||
                location.lng < -180 ||
                location.lng > 180) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Location messages require valid lat/lng coordinates");
            }
            break;
        }
        default:
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Unsupported message type");
    }
};
/**
 * Project raw reaction entries into counts + the viewer's own reaction.
 * The raw user list never leaves the server — only aggregates do.
 */
const summarizeReactions = (raw, viewerId) => {
    var _a, _b;
    const counts = {};
    let total = 0;
    let myReaction = null;
    if (Array.isArray(raw)) {
        for (const entry of raw) {
            const type = entry === null || entry === void 0 ? void 0 : entry.type;
            if (typeof type !== "string" ||
                !react_interface_1.REACTION_TYPES.includes(type)) {
                continue;
            }
            total += 1;
            const key = type;
            counts[key] = ((_a = counts[key]) !== null && _a !== void 0 ? _a : 0) + 1;
            if (viewerId) {
                const user = String((_b = entry === null || entry === void 0 ? void 0 : entry.user) !== null && _b !== void 0 ? _b : "");
                if (user === viewerId)
                    myReaction = key;
            }
        }
    }
    return { counts, total, myReaction };
};
/**
 * Client-safe projection. Never returns:
 * - any field of a soft-deleted message (content/media/location are blanked),
 * - the permanent media URL of a VIEW_ONCE image (only an `opened` flag),
 * - the full document of a replied-to message (only a small preview),
 * - the raw reaction list (only an aggregate summary per viewer).
 */
const sanitizeForRead = (message, viewerId) => {
    const doc = typeof message.toObject === "function"
        ? message.toObject()
        : Object.assign({}, message);
    const _a = doc, { reactions: rawReactions } = _a, base = __rest(_a, ["reactions"]);
    const reactionSummary = summarizeReactions(rawReactions, viewerId);
    const rawReply = base.replyTo;
    const replyTo = (() => {
        var _a, _b;
        // Unpopulated references (chat-list projections) render as no preview.
        if (!rawReply ||
            typeof rawReply !== "object" ||
            !("content" in rawReply) ||
            !("sender" in rawReply)) {
            return null;
        }
        const senderRaw = rawReply.sender;
        const senderObj = senderRaw && typeof senderRaw === "object"
            ? senderRaw
            : undefined;
        return {
            _id: String((_a = rawReply._id) !== null && _a !== void 0 ? _a : ""),
            sender: {
                _id: String((_b = senderObj === null || senderObj === void 0 ? void 0 : senderObj._id) !== null && _b !== void 0 ? _b : ""),
                name: typeof (senderObj === null || senderObj === void 0 ? void 0 : senderObj.name) === "string" ? senderObj.name : "",
                image: typeof (senderObj === null || senderObj === void 0 ? void 0 : senderObj.image) === "string" ? senderObj.image : null,
            },
            content: typeof rawReply.content === "string" ? rawReply.content.slice(0, 300) : "",
            messageType: typeof rawReply.messageType === "string" &&
                rawReply.messageType in message_interface_1.MESSAGE_TYPE
                ? rawReply.messageType
                : message_interface_1.MESSAGE_TYPE.TEXT,
            isDeleted: Boolean(rawReply.isDeleted),
        };
    })();
    if (doc.isDeleted) {
        return Object.assign(Object.assign({}, base), { content: "", mediaUrl: null, mediaMeta: null, location: null, liveLocation: null, isDeleted: true, replyTo, reactions: reactionSummary });
    }
    if (doc.messageType === message_interface_1.MESSAGE_TYPE.VIEW_ONCE_IMAGE) {
        return Object.assign(Object.assign({}, base), { mediaUrl: null, viewOnceOpened: Boolean(doc.viewOnceConsumedAt), replyTo, reactions: reactionSummary });
    }
    return Object.assign(Object.assign({}, base), { replyTo, reactions: reactionSummary });
};
const populateMessage = (message) => message.populate([
    { path: "sender", select: "-password" },
    {
        path: "replyTo",
        select: "content messageType isDeleted sender",
        populate: { path: "sender", select: "name image" },
    },
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
// Create a new message (requester must be a participant of the target chat)
const createMessageIntoDB = (payload, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const chat = yield getAccessibleChat(String(payload.chat), requester);
    if (!chat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Chat not found");
    }
    const messageType = payload.messageType && payload.messageType in message_interface_1.MESSAGE_TYPE
        ? payload.messageType
        : message_interface_1.MESSAGE_TYPE.TEXT;
    const content = typeof payload.content === "string" ? payload.content.trim() : "";
    validateTypedPayload(messageType, Object.assign(Object.assign({}, payload), { content }));
    // Reply target: must be an existing message of THIS conversation. Replying
    // to a deleted message is allowed (the preview renders as a tombstone).
    let replyTo = null;
    if (payload.replyTo) {
        const parent = yield message_model_1.Message.findById(payload.replyTo).select("_id chat");
        if (!parent || String(parent.chat) !== String(payload.chat)) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Reply target not found in this chat");
        }
        replyTo = parent._id;
    }
    // Community group conversation: enforce the group's messaging policy and
    // current membership (readBy/users are synced by the group module).
    const groupCommunity = chat.groupCommunity;
    if (groupCommunity && String(groupCommunity) !== "null") {
        const group = yield group_model_1.Group.findById(String(groupCommunity))
            .select("chatEnabled isDeleted name");
        if (!group || group.isDeleted) {
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Chat not found");
        }
        if (!group.chatEnabled && requester.role !== "ADMIN") {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Messaging is turned off for this group");
        }
        if (requester.role !== "ADMIN") {
            const membership = yield groupMembership_model_1.GroupMembership.findOne({
                group: group._id,
                user: requester.id,
            }).select("status role");
            if ((membership === null || membership === void 0 ? void 0 : membership.status) === group_constants_1.GROUP_MEMBERSHIP_STATUS.BANNED) {
                throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are banned from this group");
            }
            if ((membership === null || membership === void 0 ? void 0 : membership.status) !== group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED) {
                throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are not a member of this group");
            }
        }
    }
    // Whitelisted fields only — a raw spread of the request body can no longer
    // smuggle sender/readBy/isDeleted flags into the document.
    const created = yield message_model_1.Message.create({
        chat: payload.chat,
        sender: requester.id,
        messageType,
        content,
        mediaUrl: messageType === message_interface_1.MESSAGE_TYPE.IMAGE ||
            messageType === message_interface_1.MESSAGE_TYPE.VOICE ||
            messageType === message_interface_1.MESSAGE_TYPE.VIEW_ONCE_IMAGE
            ? payload.mediaUrl
            : null,
        mediaMeta: (_a = payload.mediaMeta) !== null && _a !== void 0 ? _a : null,
        location: messageType === message_interface_1.MESSAGE_TYPE.LOCATION ||
            messageType === message_interface_1.MESSAGE_TYPE.LIVE_LOCATION
            ? payload.location
            : null,
        liveLocation: messageType === message_interface_1.MESSAGE_TYPE.LIVE_LOCATION
            ? { expiresAt: new Date(Date.now() + message_interface_1.LIVE_LOCATION_DURATION_MS) }
            : null,
        replyTo,
        readBy: [new mongoose_1.Types.ObjectId(requester.id)],
    });
    const populated = yield populateMessage(created);
    yield chat_model_1.Chat.findByIdAndUpdate(payload.chat, {
        latestMessage: populated._id,
    });
    return sanitizeForRead(populated, requester.id);
});
// Get messages for a chat (requester must be a chat participant).
// Optional `page`/`limit` query params paginate history (newest page last);
// without them the full history is returned (legacy behaviour).
// Fetching also marks the messages as read for this user (read receipts /
// unread counts).
const getMessagesByChatId = (chatId, requester, query) => __awaiter(void 0, void 0, void 0, function* () {
    const chat = yield getAccessibleChat(chatId, requester);
    if (!chat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Chat not found");
    }
    const rawLimit = Number(query === null || query === void 0 ? void 0 : query.limit);
    const rawPage = Number(query === null || query === void 0 ? void 0 : query.page);
    const paginated = Number.isFinite(rawLimit) && rawLimit > 0;
    let findQuery = message_model_1.Message.find({ chat: chatId });
    let meta;
    if (paginated) {
        const limit = Math.min(100, Math.max(1, Math.floor(rawLimit)));
        const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
        const total = yield message_model_1.Message.countDocuments({ chat: chatId });
        findQuery = findQuery
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);
        meta = { page, limit, total, totalPage: Math.ceil(total / limit) };
    }
    else {
        // Deterministic chronological order (incl. same-ms ties) so client-side
        // refetches can never reshuffle the rendered list.
        findQuery = findQuery.sort({
            createdAt: 1,
            _id: 1,
        });
    }
    const messages = yield findQuery
        .populate("sender", "-password")
        .populate({
        path: "replyTo",
        select: "content messageType isDeleted sender",
        populate: { path: "sender", select: "name image" },
    })
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
    if (paginated) {
        // Newest-first slice → return chronological for rendering.
        return {
            messages: (yield Promise.all(messages.reverse().map((m) => __awaiter(void 0, void 0, void 0, function* () { return sanitizeForRead(m, requester.id); })))),
            meta,
        };
    }
    // Read receipts: opening the conversation marks everything read.
    if (messages.length) {
        yield message_model_1.Message.updateMany({ chat: chatId, readBy: { $ne: new mongoose_1.Types.ObjectId(requester.id) } }, { $addToSet: { readBy: new mongoose_1.Types.ObjectId(requester.id) } });
    }
    return {
        messages: messages.map((m) => sanitizeForRead(m, requester.id)),
    };
});
// Explicit mark-as-read (used when the client leaves the conversation).
const markChatReadIntoDB = (chatId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const chat = yield getAccessibleChat(chatId, requester);
    if (!chat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Chat not found");
    }
    const res = yield message_model_1.Message.updateMany({ chat: chatId, readBy: { $ne: new mongoose_1.Types.ObjectId(requester.id) } }, { $addToSet: { readBy: new mongoose_1.Types.ObjectId(requester.id) } });
    return { updated: res.modifiedCount };
});
// Per-user unread count for one chat.
const getUnreadCountForChat = (chatId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const chat = yield getAccessibleChat(chatId, requester);
    if (!chat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Chat not found");
    }
    return message_model_1.Message.countDocuments({
        chat: chatId,
        readBy: { $ne: new mongoose_1.Types.ObjectId(requester.id) },
    });
});
/**
 * Edit a message: the sender may update the text/caption (TEXT, EMOJI and
 * image/voice captions) or the coordinates of a LOCATION message. Media URLs
 * and message types are immutable; edits are stamped `isEdited`.
 */
const editMessageIntoDB = (messageId, updates, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const message = yield message_model_1.Message.findById(messageId);
    if (!message || message.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Message not found");
    }
    if (String(message.sender) !== requester.id) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You can only edit your own messages");
    }
    if (updates.content === undefined && updates.location === undefined) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Nothing to update");
    }
    const messageType = (_a = message.messageType) !== null && _a !== void 0 ? _a : message_interface_1.MESSAGE_TYPE.TEXT;
    if (updates.content !== undefined) {
        const content = updates.content.trim();
        if (messageType === message_interface_1.MESSAGE_TYPE.TEXT && !content) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Text messages require non-empty content");
        }
        if (messageType === message_interface_1.MESSAGE_TYPE.EMOJI && (!content || content.length > 16)) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Emoji messages require 1-16 characters of content");
        }
        if (content.length > 5000) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Content is too long");
        }
        message.content = content;
    }
    if (updates.location !== undefined) {
        if (messageType !== message_interface_1.MESSAGE_TYPE.LOCATION) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Only location messages can update coordinates");
        }
        const { lat, lng, label } = updates.location;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid coordinates");
        }
        message.location = { lat, lng, label };
    }
    message.isEdited = true;
    message.editedAt = new Date();
    yield message.save();
    const populated = yield populateMessage(message);
    const sanitized = sanitizeForRead(populated, requester.id);
    const chat = yield chat_model_1.Chat.findById(message.chat).select("users").lean();
    const others = ((_b = chat === null || chat === void 0 ? void 0 : chat.users) !== null && _b !== void 0 ? _b : [])
        .map((u) => String(u))
        .filter((u) => u !== requester.id);
    if (others.length) {
        (0, socketRegistry_1.emitToUsers)(others, "message edited", sanitized);
    }
    return sanitized;
});
/**
 * Soft-delete a message: content is blanked immediately, the document stays
 * only so read receipts/ids remain consistent. A group chat's latest-message
 * pointer is cleared so previews never show deleted content.
 */
const deleteMessageIntoDB = (messageId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const message = yield message_model_1.Message.findById(messageId);
    if (!message) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Message not found");
    }
    if (String(message.sender) !== requester.id && requester.role !== "ADMIN") {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You can only delete your own messages");
    }
    if (message.isDeleted) {
        return; // Idempotent delete (retry safety).
    }
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.content = "";
    message.mediaUrl = null;
    message.mediaMeta = null;
    message.location = null;
    message.liveLocation = null;
    message.reactions = [];
    yield message.save();
    yield chat_model_1.Chat.updateOne({ _id: message.chat, latestMessage: message._id }, { $set: { latestMessage: null } });
    const chat = yield chat_model_1.Chat.findById(message.chat).select("users").lean();
    const others = ((_a = chat === null || chat === void 0 ? void 0 : chat.users) !== null && _a !== void 0 ? _a : [])
        .map((u) => String(u))
        .filter((u) => u !== requester.id);
    if (others.length) {
        (0, socketRegistry_1.emitToUsers)(others, "message deleted", {
            _id: String(message._id),
            chat: String(message.chat),
        });
    }
});
/**
 * Consume a VIEW_ONCE image: the first authorized open atomically flips
 * `viewOnceConsumedAt` and returns the media URL exactly once. Every later
 * call — including the sender's — gets 410 Gone, and history never contains
 * the URL.
 */
const consumeViewOnceMediaFromDB = (messageId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const message = yield message_model_1.Message.findById(messageId);
    if (!message || message.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Message not found");
    }
    if (message.messageType !== message_interface_1.MESSAGE_TYPE.VIEW_ONCE_IMAGE) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "This message is not view-once media");
    }
    const chat = yield getAccessibleChat(String(message.chat), requester);
    if (!chat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Message not found");
    }
    if (String(message.sender) === requester.id) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "You already have this media — view-once is for the recipient");
    }
    // Atomic single-consumption: only one request can win this transition.
    const consumed = yield message_model_1.Message.findOneAndUpdate({
        _id: message._id,
        viewOnceConsumedAt: null,
        isDeleted: false,
    }, {
        $set: {
            viewOnceConsumedAt: new Date(),
            viewOnceConsumedBy: new mongoose_1.Types.ObjectId(requester.id),
        },
        $addToSet: { readBy: new mongoose_1.Types.ObjectId(requester.id) },
    }, { new: true });
    if (!consumed) {
        throw new AppError_1.default(http_status_1.default.GONE, "This view-once photo has already been opened");
    }
    if (!consumed.mediaUrl) {
        throw new AppError_1.default(http_status_1.default.GONE, "Media is no longer available");
    }
    return {
        mediaUrl: consumed.mediaUrl,
        mediaMeta: (_a = consumed.mediaMeta) !== null && _a !== void 0 ? _a : null,
        caption: (_b = consumed.content) !== null && _b !== void 0 ? _b : "",
    };
});
/**
 * Shared gate for the reaction endpoints: the message must exist, not be
 * soft-deleted, and the requester must be a chat participant (non-members
 * get the same 404 used by history so ids cannot be probed).
 */
const getReactableMessage = (messageId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    if (!mongoose_1.Types.ObjectId.isValid(messageId)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid message id");
    }
    const message = yield message_model_1.Message.findById(messageId).select("chat isDeleted");
    if (!message || message.isDeleted) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Message not found");
    }
    const chat = yield chat_model_1.Chat.findById(message.chat).select("users").lean();
    if (!chat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Message not found");
    }
    const members = ((_a = chat.users) !== null && _a !== void 0 ? _a : []).map((u) => { var _a; return String((_a = u === null || u === void 0 ? void 0 : u._id) !== null && _a !== void 0 ? _a : u); });
    const reqUserId = String((_b = requester.id) !== null && _b !== void 0 ? _b : "");
    if (!members.includes(reqUserId) && requester.role !== "ADMIN") {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are not a member of this chat");
    }
    return {
        messageId: message._id,
        chatId: String(message.chat),
        members,
    };
});
/**
 * Every member receives their own summary: counts/total are identical but
 * `myReaction` differs per viewer, so the broadcast is per user.
 */
const broadcastReactionUpdate = (rawReactions, chatId, messageId, members) => {
    for (const member of members) {
        const payload = {
            _id: messageId,
            chat: chatId,
            reactions: summarizeReactions(rawReactions, member),
        };
        (0, socketRegistry_1.emitToUser)(member, "message reacted", payload);
    }
};
/**
 * Set (or switch) the requester's reaction on a message. The update runs as
 * an atomic pipeline: the user's previous entry is filtered out and the new
 * one appended, so rapid switching can never stack duplicates.
 */
const reactToMessageIntoDB = (messageId, type, requester) => __awaiter(void 0, void 0, void 0, function* () {
    if (!react_interface_1.REACTION_TYPES.includes(type)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Unsupported reaction type");
    }
    const target = yield getReactableMessage(messageId, requester);
    const user = new mongoose_1.Types.ObjectId(requester.id);
    const updated = yield message_model_1.Message.findOneAndUpdate({ _id: target.messageId }, [
        {
            $set: {
                reactions: {
                    $concatArrays: [
                        {
                            $filter: {
                                input: { $ifNull: ["$reactions", []] },
                                as: "existing",
                                cond: { $ne: ["$$existing.user", user] },
                            },
                        },
                        [{ user, type }],
                    ],
                },
                updatedAt: "$$NOW",
            },
        },
    ], { new: true }).select("reactions");
    if (!updated) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Message not found");
    }
    broadcastReactionUpdate(updated.reactions, target.chatId, target.messageId.toString(), target.members);
    return {
        _id: target.messageId.toString(),
        chat: target.chatId,
        reactions: summarizeReactions(updated.reactions, requester.id),
    };
});
/** Remove the requester's reaction (idempotent — no reaction is a no-op). */
const removeReactionFromMessageIntoDB = (messageId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const target = yield getReactableMessage(messageId, requester);
    const userObjectId = new mongoose_1.Types.ObjectId(requester.id);
    const updated = yield message_model_1.Message.findOneAndUpdate({ _id: target.messageId }, { $pull: { reactions: { user: userObjectId } } }, { new: true }).select("reactions");
    if (!updated) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Message not found");
    }
    broadcastReactionUpdate(updated.reactions, target.chatId, target.messageId.toString(), target.members);
    return {
        _id: target.messageId.toString(),
        chat: target.chatId,
        reactions: summarizeReactions(updated.reactions, requester.id),
    };
});
exports.MessageServices = {
    createMessageIntoDB,
    getMessagesByChatId,
    markChatReadIntoDB,
    getUnreadCountForChat,
    editMessageIntoDB,
    deleteMessageIntoDB,
    consumeViewOnceMediaFromDB,
    reactToMessageIntoDB,
    removeReactionFromMessageIntoDB,
};
/**
 * Chat projections populate `latestMessage` raw. This applies the same
 * read-safe rules as the message endpoints (no view-once URLs, no deleted
 * content) before a chat document is returned to a client.
 */
const sanitizeChatLatestMessage = (chat, viewerId) => {
    const latest = chat.latestMessage;
    if (latest && typeof latest === "object") {
        chat.latestMessage = sanitizeForRead(latest, viewerId);
    }
    return chat;
};
exports.sanitizeChatLatestMessage = sanitizeChatLatestMessage;
