import httpStatus from "http-status";
import { Types } from "mongoose";
import {
  CALL_MEDIA_TYPE,
  CALL_STATUS,
  GROUP_CALL_MAX_PARTICIPANTS,
  ICall,
  TCallMediaType,
  TCallStatus,
} from "./call.interface";
import { Call } from "./call.model";
import { Chat } from "../Chat/chat.model";
import AppError from "../../errors/AppError";

type TRequester = { id: string; role: string };

const ACTIVE_STATUSES: TCallStatus[] = [CALL_STATUS.RINGING, CALL_STATUS.ACTIVE];

/**
 * Resolve the conversation the requester may call in:
 * - one-to-one chats (exactly 2 users),
 * - group chats (group calls: every member is an invitee).
 * Community-feed chats are not callable. Non-members get 404 (no oracle).
 */
const getCallableChat = async (
  chatId: string,
  requester: TRequester,
): Promise<{ users: Types.ObjectId[]; isGroupChat: boolean }> => {
  const chat = await Chat.findById(chatId).select(
    "users isGroupChat chatName groupCommunity",
  );
  if (!chat) {
    throw new AppError(httpStatus.NOT_FOUND, "Chat not found");
  }
  const isMember = (chat.users ?? []).some((u) => String(u) === requester.id);
  if (!isMember && requester.role !== "ADMIN") {
    throw new AppError(httpStatus.NOT_FOUND, "Chat not found");
  }
  if (chat.groupCommunity) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Calls are not available in community feeds",
    );
  }
  const users = (chat.users ?? []).map((u) => u as Types.ObjectId);
  if (chat.isGroupChat) {
    if (users.length < 2) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "A group call needs at least two members",
      );
    }
    return { users, isGroupChat: true };
  }
  if (users.length !== 2) {
    throw new AppError(httpStatus.BAD_REQUEST, "Calls require a two-person chat");
  }
  return { users, isGroupChat: false };
};

const populateCall = (call: ICall) =>
  call.populate([
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
const inviteToCallFromDB = async (
  chatId: string,
  mediaType: TCallMediaType,
  requester: TRequester,
): Promise<ICall> => {
  const { users, isGroupChat } = await getCallableChat(chatId, requester);

  const caller = users.find((u) => String(u) === requester.id);
  if (!caller) {
    throw new AppError(httpStatus.FORBIDDEN, "You are not a participant of this chat");
  }
  const callee = isGroupChat
    ? null
    : users.find((u) => String(u) !== requester.id);
  if (!isGroupChat && !callee) {
    throw new AppError(httpStatus.FORBIDDEN, "You are not a participant of this chat");
  }

  const existing = await Call.findOne({
    chat: chatId,
    status: { $in: ACTIVE_STATUSES },
  });
  if (existing) {
    throw new AppError(
      httpStatus.CONFLICT,
      "There is already an ongoing call in this conversation",
    );
  }

  const created = await Call.create({
    chat: chatId,
    caller,
    callee,
    isGroupCall: isGroupChat,
    participants: [caller],
    mediaType: mediaType === CALL_MEDIA_TYPE.VIDEO ? CALL_MEDIA_TYPE.VIDEO : CALL_MEDIA_TYPE.AUDIO,
    status: CALL_STATUS.RINGING,
    startedAt: new Date(),
  });

  return populateCall(created);
};

/**
 * Group convenience: pressing "call" while the group call is already ACTIVE
 * joins that call instead of failing with a 409. Returns null when there is
 * no joinable ACTIVE group call (DM conflicts and RINGING groups still 409).
 */
const joinActiveGroupCallFromDB = async (
  chatId: string,
  requester: TRequester,
): Promise<ICall | null> => {
  const existing = await Call.findOne({
    chat: chatId,
    status: CALL_STATUS.ACTIVE,
    isGroupCall: true,
  });
  if (!existing) {
    return null;
  }
  return acceptCallFromDB(String(existing._id), requester);
};

const loadCallAsParticipant = async (
  callId: string,
  requester: TRequester,
): Promise<ICall> => {
  const call = await Call.findById(callId).populate({
    path: "chat",
    select: "users isGroupChat",
  });
  if (!call) {
    throw new AppError(httpStatus.NOT_FOUND, "Call not found");
  }

  if (call.isGroupCall) {
    // Group calls check conversation membership (the roster is only who is
    // currently connected, not who may join).
    const chatUsers = ((call.chat as unknown as { users?: unknown[] })?.users ?? [])
      .map((u) => String(u));
    if (!chatUsers.includes(requester.id) && requester.role !== "ADMIN") {
      throw new AppError(httpStatus.NOT_FOUND, "Call not found");
    }
    return call;
  }

  const isParticipant =
    String(call.caller) === requester.id || String(call.callee) === requester.id;
  if (!isParticipant && requester.role !== "ADMIN") {
    // Same 404 as a missing call — no existence oracle for strangers.
    throw new AppError(httpStatus.NOT_FOUND, "Call not found");
  }
  return call;
};

/**
 * Accept / join:
 * - DM: callee only, RINGING → ACTIVE.
 * - Group: any chat member joins — first acceptor flips RINGING → ACTIVE,
 *   later members may join an ACTIVE call until the mesh cap (8) is reached.
 */
const acceptCallFromDB = async (
  callId: string,
  requester: TRequester,
): Promise<ICall> => {
  const call = await loadCallAsParticipant(callId, requester);

  if (call.isGroupCall) {
    if (call.status !== CALL_STATUS.RINGING && call.status !== CALL_STATUS.ACTIVE) {
      throw new AppError(httpStatus.CONFLICT, "This call has already ended");
    }
    const alreadyIn = (call.participants ?? []).some(
      (p) => String(p) === requester.id,
    );
    if (alreadyIn) {
      return populateCall(call);
    }
    if (
      call.status === CALL_STATUS.ACTIVE &&
      (call.participants ?? []).length >= GROUP_CALL_MAX_PARTICIPANTS
    ) {
      throw new AppError(
        httpStatus.CONFLICT,
        `This call is full (${GROUP_CALL_MAX_PARTICIPANTS} participants max)`,
      );
    }
    call.participants = [
      ...(call.participants ?? []),
      new Types.ObjectId(requester.id),
    ];
    if (call.status === CALL_STATUS.RINGING) {
      call.status = CALL_STATUS.ACTIVE;
      call.answeredAt = new Date();
    }
    await call.save();
    return populateCall(call);
  }

  if (String(call.callee) !== requester.id) {
    throw new AppError(httpStatus.FORBIDDEN, "Only the callee can accept the call");
  }
  if (call.status !== CALL_STATUS.RINGING) {
    throw new AppError(httpStatus.CONFLICT, "This call is no longer ringing");
  }

  call.status = CALL_STATUS.ACTIVE;
  call.answeredAt = new Date();
  await call.save();
  return populateCall(call);
};

/**
 * Decline:
 * - DM: callee rejects → call REJECTED (whole call).
 * - Group: a personal decline — the call keeps ringing for everyone else.
 */
const rejectCallFromDB = async (
  callId: string,
  requester: TRequester,
): Promise<ICall> => {
  const call = await loadCallAsParticipant(callId, requester);

  if (call.isGroupCall) {
    if (call.status !== CALL_STATUS.RINGING) {
      throw new AppError(httpStatus.CONFLICT, "This call is no longer ringing");
    }
    return call;
  }

  if (String(call.callee) !== requester.id) {
    throw new AppError(httpStatus.FORBIDDEN, "Only the callee can reject the call");
  }
  if (call.status !== CALL_STATUS.RINGING) {
    throw new AppError(httpStatus.CONFLICT, "This call is no longer ringing");
  }

  call.status = CALL_STATUS.REJECTED;
  call.endedAt = new Date();
  await call.save();
  return populateCall(call);
};

/**
 * End / leave:
 * - DM (either participant): RINGING hang-up → CANCELLED/REJECTED, ACTIVE → ENDED.
 * - Group, RINGING: only the starter can cancel (→ CANCELLED).
 * - Group, ACTIVE: the requester LEAVES — the call continues for the rest
 *   until the last participant leaves (→ ENDED with the talk duration).
 */
const endCallFromDB = async (
  callId: string,
  requester: TRequester,
): Promise<ICall> => {
  const call = await loadCallAsParticipant(callId, requester);
  if (call.status !== CALL_STATUS.RINGING && call.status !== CALL_STATUS.ACTIVE) {
    throw new AppError(httpStatus.CONFLICT, "This call has already ended");
  }

  const endedAt = new Date();

  if (call.isGroupCall) {
    if (call.status === CALL_STATUS.RINGING) {
      if (String(call.caller) !== requester.id) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          "Only the person who started the call can cancel it",
        );
      }
      call.status = CALL_STATUS.CANCELLED;
      call.endedAt = endedAt;
      await call.save();
      return populateCall(call);
    }

    const remaining = (call.participants ?? []).filter(
      (p) => String(p) !== requester.id,
    );
    call.participants = remaining;
    if (remaining.length === 0) {
      call.status = CALL_STATUS.ENDED;
      call.endedAt = endedAt;
      const answeredAt = call.answeredAt ?? call.startedAt;
      call.durationSeconds = Math.max(
        0,
        Math.round((endedAt.getTime() - answeredAt.getTime()) / 1000),
      );
    }
    await call.save();
    return populateCall(call);
  }

  if (call.status === CALL_STATUS.RINGING) {
    call.status =
      String(call.caller) === requester.id
        ? CALL_STATUS.CANCELLED
        : CALL_STATUS.REJECTED;
    call.endedAt = endedAt;
  } else {
    call.status = CALL_STATUS.ENDED;
    call.endedAt = endedAt;
    const answeredAt = call.answeredAt ?? call.startedAt;
    call.durationSeconds = Math.max(
      0,
      Math.round((endedAt.getTime() - answeredAt.getTime()) / 1000),
    );
  }

  await call.save();
  return populateCall(call);
};

/**
 * Membership + state check for realtime signal relay: SDP/ICE payloads may
 * only travel between participants of a live (RINGING/ACTIVE) call —
 * pairs for DMs, the `participants` roster for mesh group calls.
 */
const assertLiveCallParticipant = async (
  callId: string,
  requesterId: string,
): Promise<{
  caller: string;
  callee: string;
  isGroupCall: boolean;
  participants: string[];
}> => {
  const call = await Call.findById(callId).select(
    "caller callee participants status isGroupCall",
  );
  if (!call || !ACTIVE_STATUSES.includes(call.status)) {
    throw new AppError(httpStatus.CONFLICT, "This call is not active");
  }
  const caller = String(call.caller);
  const callee = call.callee ? String(call.callee) : "";
  const participants = (call.participants ?? []).map((p) => String(p));

  if (call.isGroupCall) {
    if (!participants.includes(requesterId) && caller !== requesterId) {
      throw new AppError(httpStatus.FORBIDDEN, "You are not a participant of this call");
    }
    return { caller, callee, isGroupCall: true, participants };
  }

  if (caller !== requesterId && callee !== requesterId) {
    throw new AppError(httpStatus.FORBIDDEN, "You are not a participant of this call");
  }
  return { caller, callee, isGroupCall: false, participants };
};

/** Paginated call history for one chat (member-only). */
const getCallsForChatFromDB = async (
  chatId: string,
  requester: TRequester,
  query?: Record<string, unknown>,
): Promise<{
  calls: ICall[];
  meta?: { page: number; limit: number; total: number; totalPage: number };
}> => {
  await getCallableChat(chatId, requester);

  const rawLimit = Number(query?.limit);
  const rawPage = Number(query?.page);
  const paginated = Number.isFinite(rawLimit) && rawLimit > 0;
  const limit = paginated ? Math.min(100, Math.max(1, Math.floor(rawLimit))) : 50;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  const total = await Call.countDocuments({ chat: chatId });
  const calls = await Call.find({ chat: chatId })
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
};

export const CallServices = {
  inviteToCallFromDB,
  acceptCallFromDB,
  rejectCallFromDB,
  endCallFromDB,
  joinActiveGroupCallFromDB,
  assertLiveCallParticipant,
  getCallsForChatFromDB,
};
