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
exports.CallServices = void 0;
const http_status_1 = __importDefault(require("http-status"));
const mongoose_1 = require("mongoose");
const call_interface_1 = require("./call.interface");
const call_model_1 = require("./call.model");
const chat_model_1 = require("../Chat/chat.model");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const ACTIVE_STATUSES = [call_interface_1.CALL_STATUS.RINGING, call_interface_1.CALL_STATUS.ACTIVE];
/**
 * Resolve the conversation the requester may call in:
 * - one-to-one chats (exactly 2 users),
 * - group chats (group calls: every member is an invitee).
 * Community-feed chats are not callable. Non-members get 404 (no oracle).
 */
const getCallableChat = (chatId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const chat = yield chat_model_1.Chat.findById(chatId).select("users isGroupChat chatName groupCommunity");
    if (!chat) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Chat not found");
    }
    const isMember = ((_a = chat.users) !== null && _a !== void 0 ? _a : []).some((u) => String(u) === requester.id);
    if (!isMember && requester.role !== "ADMIN") {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Chat not found");
    }
    if (chat.groupCommunity) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Calls are not available in community feeds");
    }
    const users = ((_b = chat.users) !== null && _b !== void 0 ? _b : []).map((u) => u);
    if (chat.isGroupChat) {
        if (users.length < 2) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "A group call needs at least two members");
        }
        return { users, isGroupChat: true };
    }
    if (users.length !== 2) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Calls require a two-person chat");
    }
    return { users, isGroupChat: false };
});
const populateCall = (call) => call.populate([
    { path: "caller", select: "-password" },
    { path: "callee", select: "-password" },
    { path: "chat", select: "chatName isGroupChat users" },
]);
/**
 * Start a call:
 * - DM: RINGING record with the callee identified; at most one live call
 *   between the two users at a time.
 * - Group: RINGING record with the starter as the only participant; every
 *   other member is invited (the chat-level live-call guard still applies).
 */
const inviteToCallFromDB = (chatId, mediaType, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const { users, isGroupChat } = yield getCallableChat(chatId, requester);
    const caller = users.find((u) => String(u) === requester.id);
    if (!caller) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are not a participant of this chat");
    }
    const callee = isGroupChat
        ? null
        : users.find((u) => String(u) !== requester.id);
    if (!isGroupChat && !callee) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are not a participant of this chat");
    }
    const existing = yield call_model_1.Call.findOne({
        chat: chatId,
        status: { $in: ACTIVE_STATUSES },
    });
    if (existing) {
        throw new AppError_1.default(http_status_1.default.CONFLICT, "There is already an ongoing call in this conversation");
    }
    const created = yield call_model_1.Call.create({
        chat: chatId,
        caller,
        callee,
        isGroupCall: isGroupChat,
        participants: [caller],
        mediaType: mediaType === call_interface_1.CALL_MEDIA_TYPE.VIDEO ? call_interface_1.CALL_MEDIA_TYPE.VIDEO : call_interface_1.CALL_MEDIA_TYPE.AUDIO,
        status: call_interface_1.CALL_STATUS.RINGING,
        startedAt: new Date(),
    });
    return populateCall(created);
});
/**
 * Group convenience: pressing "call" while the group call is already ACTIVE
 * joins that call instead of failing with a 409. Returns null when there is
 * no joinable ACTIVE group call (DM conflicts and RINGING groups still 409).
 */
const joinActiveGroupCallFromDB = (chatId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield call_model_1.Call.findOne({
        chat: chatId,
        status: call_interface_1.CALL_STATUS.ACTIVE,
        isGroupCall: true,
    });
    if (!existing) {
        return null;
    }
    return acceptCallFromDB(String(existing._id), requester);
});
const loadCallAsParticipant = (callId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const call = yield call_model_1.Call.findById(callId).populate({
        path: "chat",
        select: "users isGroupChat",
    });
    if (!call) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Call not found");
    }
    if (call.isGroupCall) {
        // Group calls check conversation membership (the roster is only who is
        // currently connected, not who may join).
        const chatUsers = ((_b = (_a = call.chat) === null || _a === void 0 ? void 0 : _a.users) !== null && _b !== void 0 ? _b : [])
            .map((u) => String(u));
        if (!chatUsers.includes(requester.id) && requester.role !== "ADMIN") {
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Call not found");
        }
        return call;
    }
    const isParticipant = String(call.caller) === requester.id || String(call.callee) === requester.id;
    if (!isParticipant && requester.role !== "ADMIN") {
        // Same 404 as a missing call — no existence oracle for strangers.
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Call not found");
    }
    return call;
});
/**
 * Accept / join:
 * - DM: callee only, RINGING → ACTIVE.
 * - Group: any chat member joins — first acceptor flips RINGING → ACTIVE,
 *   later members may join an ACTIVE call until the mesh cap (8) is reached.
 */
const acceptCallFromDB = (callId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const call = yield loadCallAsParticipant(callId, requester);
    if (call.isGroupCall) {
        if (call.status !== call_interface_1.CALL_STATUS.RINGING && call.status !== call_interface_1.CALL_STATUS.ACTIVE) {
            throw new AppError_1.default(http_status_1.default.CONFLICT, "This call has already ended");
        }
        const alreadyIn = ((_a = call.participants) !== null && _a !== void 0 ? _a : []).some((p) => String(p) === requester.id);
        if (alreadyIn) {
            return populateCall(call);
        }
        if (call.status === call_interface_1.CALL_STATUS.ACTIVE &&
            ((_b = call.participants) !== null && _b !== void 0 ? _b : []).length >= call_interface_1.GROUP_CALL_MAX_PARTICIPANTS) {
            throw new AppError_1.default(http_status_1.default.CONFLICT, `This call is full (${call_interface_1.GROUP_CALL_MAX_PARTICIPANTS} participants max)`);
        }
        call.participants = [
            ...((_c = call.participants) !== null && _c !== void 0 ? _c : []),
            new mongoose_1.Types.ObjectId(requester.id),
        ];
        if (call.status === call_interface_1.CALL_STATUS.RINGING) {
            call.status = call_interface_1.CALL_STATUS.ACTIVE;
            call.answeredAt = new Date();
        }
        yield call.save();
        return populateCall(call);
    }
    if (String(call.callee) !== requester.id) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Only the callee can accept the call");
    }
    if (call.status !== call_interface_1.CALL_STATUS.RINGING) {
        throw new AppError_1.default(http_status_1.default.CONFLICT, "This call is no longer ringing");
    }
    call.status = call_interface_1.CALL_STATUS.ACTIVE;
    call.answeredAt = new Date();
    yield call.save();
    return populateCall(call);
});
/**
 * Decline:
 * - DM: callee rejects → call REJECTED (whole call).
 * - Group: a personal decline — the call keeps ringing for everyone else.
 */
const rejectCallFromDB = (callId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const call = yield loadCallAsParticipant(callId, requester);
    if (call.isGroupCall) {
        if (call.status !== call_interface_1.CALL_STATUS.RINGING) {
            throw new AppError_1.default(http_status_1.default.CONFLICT, "This call is no longer ringing");
        }
        return call;
    }
    if (String(call.callee) !== requester.id) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Only the callee can reject the call");
    }
    if (call.status !== call_interface_1.CALL_STATUS.RINGING) {
        throw new AppError_1.default(http_status_1.default.CONFLICT, "This call is no longer ringing");
    }
    call.status = call_interface_1.CALL_STATUS.REJECTED;
    call.endedAt = new Date();
    yield call.save();
    return populateCall(call);
});
/**
 * End / leave:
 * - DM (either participant): RINGING hang-up → CANCELLED/REJECTED, ACTIVE → ENDED.
 * - Group, RINGING: only the starter can cancel (→ CANCELLED).
 * - Group, ACTIVE: the requester LEAVES — the call continues for the rest
 *   until the last participant leaves (→ ENDED with the talk duration).
 */
const endCallFromDB = (callId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const call = yield loadCallAsParticipant(callId, requester);
    if (call.status !== call_interface_1.CALL_STATUS.RINGING && call.status !== call_interface_1.CALL_STATUS.ACTIVE) {
        throw new AppError_1.default(http_status_1.default.CONFLICT, "This call has already ended");
    }
    const endedAt = new Date();
    if (call.isGroupCall) {
        if (call.status === call_interface_1.CALL_STATUS.RINGING) {
            if (String(call.caller) !== requester.id) {
                throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Only the person who started the call can cancel it");
            }
            call.status = call_interface_1.CALL_STATUS.CANCELLED;
            call.endedAt = endedAt;
            yield call.save();
            return populateCall(call);
        }
        const remaining = ((_a = call.participants) !== null && _a !== void 0 ? _a : []).filter((p) => String(p) !== requester.id);
        call.participants = remaining;
        if (remaining.length === 0) {
            call.status = call_interface_1.CALL_STATUS.ENDED;
            call.endedAt = endedAt;
            const answeredAt = (_b = call.answeredAt) !== null && _b !== void 0 ? _b : call.startedAt;
            call.durationSeconds = Math.max(0, Math.round((endedAt.getTime() - answeredAt.getTime()) / 1000));
        }
        yield call.save();
        return populateCall(call);
    }
    if (call.status === call_interface_1.CALL_STATUS.RINGING) {
        call.status =
            String(call.caller) === requester.id
                ? call_interface_1.CALL_STATUS.CANCELLED
                : call_interface_1.CALL_STATUS.REJECTED;
        call.endedAt = endedAt;
    }
    else {
        call.status = call_interface_1.CALL_STATUS.ENDED;
        call.endedAt = endedAt;
        const answeredAt = (_c = call.answeredAt) !== null && _c !== void 0 ? _c : call.startedAt;
        call.durationSeconds = Math.max(0, Math.round((endedAt.getTime() - answeredAt.getTime()) / 1000));
    }
    yield call.save();
    return populateCall(call);
});
/**
 * Membership + state check for realtime signal relay: SDP/ICE payloads may
 * only travel between participants of a live (RINGING/ACTIVE) call —
 * pairs for DMs, the `participants` roster for mesh group calls.
 */
const assertLiveCallParticipant = (callId, requesterId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const call = yield call_model_1.Call.findById(callId).select("caller callee participants status isGroupCall");
    if (!call || !ACTIVE_STATUSES.includes(call.status)) {
        throw new AppError_1.default(http_status_1.default.CONFLICT, "This call is not active");
    }
    const caller = String(call.caller);
    const callee = call.callee ? String(call.callee) : "";
    const participants = ((_a = call.participants) !== null && _a !== void 0 ? _a : []).map((p) => String(p));
    if (call.isGroupCall) {
        if (!participants.includes(requesterId) && caller !== requesterId) {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are not a participant of this call");
        }
        return { caller, callee, isGroupCall: true, participants };
    }
    if (caller !== requesterId && callee !== requesterId) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are not a participant of this call");
    }
    return { caller, callee, isGroupCall: false, participants };
});
/** Paginated call history for one chat (member-only). */
const getCallsForChatFromDB = (chatId, requester, query) => __awaiter(void 0, void 0, void 0, function* () {
    yield getCallableChat(chatId, requester);
    const rawLimit = Number(query === null || query === void 0 ? void 0 : query.limit);
    const rawPage = Number(query === null || query === void 0 ? void 0 : query.page);
    const paginated = Number.isFinite(rawLimit) && rawLimit > 0;
    const limit = paginated ? Math.min(100, Math.max(1, Math.floor(rawLimit))) : 50;
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const total = yield call_model_1.Call.countDocuments({ chat: chatId });
    const calls = yield call_model_1.Call.find({ chat: chatId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("caller", "-password")
        .populate("callee", "-password");
    return {
        calls,
        meta: {
            page,
            limit,
            total,
            totalPage: Math.ceil(total / limit) || 1,
        },
    };
});
exports.CallServices = {
    inviteToCallFromDB,
    acceptCallFromDB,
    rejectCallFromDB,
    endCallFromDB,
    joinActiveGroupCallFromDB,
    assertLiveCallParticipant,
    getCallsForChatFromDB,
};
