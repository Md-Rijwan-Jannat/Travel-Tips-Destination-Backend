import httpStatus from "http-status";
import { Types } from "mongoose";
import {
  IMessage,
  LIVE_LOCATION_DURATION_MS,
  MESSAGE_TYPE,
  TMessageType,
  TMessageReactionSummary,
  TMessageReactionUpdate,
  TPublicMessage,
} from "./message.interface";
import AppError from "../../errors/AppError";
import { Message } from "./message.model";
import { Chat } from "../Chat/chat.model";
import { Group } from "../Group/group.model";
import { GroupMembership } from "../Group/groupMembership.model";
import { GROUP_MEMBERSHIP_STATUS } from "../Group/group.constants";
import { REACTION_TYPES, TReactionType } from "../Reacts/react.interface";
import { emitToUser, emitToUsers } from "../../utils/socketRegistry";

type TRequester = { id: string; role: string };

const getAccessibleChat = async (
  chatId: string,
  requester: TRequester,
): Promise<{
  users?: unknown[] | null;
  groupCommunity?: unknown;
  isGroupChat?: boolean;
} | null> => {
  // groupCommunity must be selected: group messaging policy checks depend on it.
  const chat = await Chat.findById(chatId).select(
    "users groupCommunity groupAdmin isGroupChat",
  );
  if (!chat) return null;

  const isMember = (chat.users ?? []).some(
    (u) => String(u) === requester.id,
  );
  // Non-members get the same 404 as a missing chat so the endpoint does not
  // reveal which chat IDs exist.
  if (!isMember && requester.role !== "ADMIN") return null;

  return chat;
};

/** Enforce the per-type content rules before anything touches the database. */
const validateTypedPayload = (
  messageType: TMessageType,
  payload: Partial<IMessage>,
): void => {
  const content = typeof payload.content === "string" ? payload.content.trim() : "";

  switch (messageType) {
    case MESSAGE_TYPE.TEXT:
      if (!content || content.length > 5000) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          "Text messages require non-empty content under 5000 characters",
        );
      }
      break;
    case MESSAGE_TYPE.EMOJI:
      if (!content || content.length > 16) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          "Emoji messages require 1-16 characters of content",
        );
      }
      break;
    case MESSAGE_TYPE.IMAGE:
    case MESSAGE_TYPE.VIEW_ONCE_IMAGE:
      if (!payload.mediaUrl) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          "Image messages require a mediaUrl",
        );
      }
      break;
    case MESSAGE_TYPE.VOICE: {
      if (!payload.mediaUrl) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          "Voice messages require a mediaUrl",
        );
      }
      const duration = payload.mediaMeta?.durationSeconds;
      if (typeof duration !== "number" || duration < 1 || duration > 600) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          "Voice messages require mediaMeta.durationSeconds between 1 and 600",
        );
      }
      break;
    }
    case MESSAGE_TYPE.LOCATION:
    case MESSAGE_TYPE.LIVE_LOCATION: {
      const location = payload.location;
      if (
        !location ||
        typeof location.lat !== "number" ||
        typeof location.lng !== "number" ||
        location.lat < -90 ||
        location.lat > 90 ||
        location.lng < -180 ||
        location.lng > 180
      ) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          "Location messages require valid lat/lng coordinates",
        );
      }
      break;
    }
    default:
      throw new AppError(httpStatus.BAD_REQUEST, "Unsupported message type");
  }
};

/**
 * Project raw reaction entries into counts + the viewer's own reaction.
 * The raw user list never leaves the server — only aggregates do.
 */
const summarizeReactions = (
  raw: unknown,
  viewerId?: string,
): TMessageReactionSummary => {
  const counts: Partial<Record<TReactionType, number>> = {};
  let total = 0;
  let myReaction: TReactionType | null = null;

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const type = (entry as { type?: unknown })?.type;
      if (
        typeof type !== "string" ||
        !(REACTION_TYPES as readonly string[]).includes(type)
      ) {
        continue;
      }
      total += 1;
      const key = type as TReactionType;
      counts[key] = (counts[key] ?? 0) + 1;
      if (viewerId) {
        const user = String((entry as { user?: unknown })?.user ?? "");
        if (user === viewerId) myReaction = key;
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
const sanitizeForRead = (
  message: IMessage,
  viewerId?: string,
): TPublicMessage => {
  const doc =
    typeof (message as { toObject?: () => IMessage }).toObject === "function"
      ? (message as { toObject: () => IMessage }).toObject()
      : { ...message };

  const {
    reactions: rawReactions,
    ...base
  } = doc as unknown as Record<string, unknown>;
  const reactionSummary = summarizeReactions(rawReactions, viewerId);

  const rawReply = base.replyTo as
    | {
        _id?: unknown;
        sender?: { _id?: unknown; name?: string; image?: string | null } | unknown;
        content?: unknown;
        messageType?: unknown;
        isDeleted?: unknown;
      }
    | null
    | undefined;

  const replyTo: TPublicMessage["replyTo"] = (() => {
    // Unpopulated references (chat-list projections) render as no preview.
    if (
      !rawReply ||
      typeof rawReply !== "object" ||
      !("content" in rawReply) ||
      !("sender" in rawReply)
    ) {
      return null;
    }
    const senderRaw = rawReply.sender as
      | { _id?: unknown; name?: string; image?: string | null }
      | unknown;
    const senderObj =
      senderRaw && typeof senderRaw === "object"
        ? (senderRaw as { _id?: unknown; name?: string; image?: string | null })
        : undefined;
    return {
      _id: String(rawReply._id ?? ""),
      sender: {
        _id: String(senderObj?._id ?? ""),
        name: typeof senderObj?.name === "string" ? senderObj.name : "",
        image:
          typeof senderObj?.image === "string" ? senderObj.image : null,
      },
      content:
        typeof rawReply.content === "string" ? rawReply.content.slice(0, 300) : "",
      messageType:
        typeof rawReply.messageType === "string" &&
        rawReply.messageType in MESSAGE_TYPE
          ? (rawReply.messageType as TMessageType)
          : MESSAGE_TYPE.TEXT,
      isDeleted: Boolean(rawReply.isDeleted),
    };
  })();

  if (doc.isDeleted) {
    return {
      ...(base as unknown as TPublicMessage),
      content: "",
      mediaUrl: null,
      mediaMeta: null,
      location: null,
      liveLocation: null,
      isDeleted: true,
      replyTo,
      reactions: reactionSummary,
    };
  }

  if (doc.messageType === MESSAGE_TYPE.VIEW_ONCE_IMAGE) {
    return {
      ...(base as unknown as TPublicMessage),
      mediaUrl: null,
      viewOnceOpened: Boolean(doc.viewOnceConsumedAt),
      replyTo,
      reactions: reactionSummary,
    };
  }

  return {
    ...(base as unknown as TPublicMessage),
    replyTo,
    reactions: reactionSummary,
  };
};

const populateMessage = (message: IMessage) =>
  message.populate([
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
const createMessageIntoDB = async (
  payload: Partial<IMessage>,
  requester: TRequester,
): Promise<TPublicMessage> => {
  const chat = await getAccessibleChat(String(payload.chat), requester);
  if (!chat) {
    throw new AppError(httpStatus.NOT_FOUND, "Chat not found");
  }

  const messageType: TMessageType =
    payload.messageType && payload.messageType in MESSAGE_TYPE
      ? payload.messageType
      : MESSAGE_TYPE.TEXT;

  const content = typeof payload.content === "string" ? payload.content.trim() : "";
  validateTypedPayload(messageType, { ...payload, content });

  // Reply target: must be an existing message of THIS conversation. Replying
  // to a deleted message is allowed (the preview renders as a tombstone).
  let replyTo: Types.ObjectId | null = null;
  if (payload.replyTo) {
    const parent = await Message.findById(payload.replyTo).select("_id chat");
    if (!parent || String(parent.chat) !== String(payload.chat)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Reply target not found in this chat");
    }
    replyTo = parent._id;
  }

  // Community group conversation: enforce the group's messaging policy and
  // current membership (readBy/users are synced by the group module).
  const groupCommunity = (chat as { groupCommunity?: unknown }).groupCommunity;
  if (groupCommunity && String(groupCommunity) !== "null") {
    const group = await Group.findById(String(groupCommunity))
      .select("chatEnabled isDeleted name");
    if (!group || group.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, "Chat not found");
    }
    if (!group.chatEnabled && requester.role !== "ADMIN") {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "Messaging is turned off for this group",
      );
    }
    if (requester.role !== "ADMIN") {
      const membership = await GroupMembership.findOne({
        group: group._id,
        user: requester.id,
      }).select("status role");
      if (membership?.status === GROUP_MEMBERSHIP_STATUS.BANNED) {
        throw new AppError(httpStatus.FORBIDDEN, "You are banned from this group");
      }
      if (membership?.status !== GROUP_MEMBERSHIP_STATUS.APPROVED) {
        throw new AppError(httpStatus.FORBIDDEN, "You are not a member of this group");
      }
    }
  }

  // Whitelisted fields only — a raw spread of the request body can no longer
  // smuggle sender/readBy/isDeleted flags into the document.
  const created = await Message.create({
    chat: payload.chat,
    sender: requester.id,
    messageType,
    content,
    mediaUrl:
      messageType === MESSAGE_TYPE.IMAGE ||
      messageType === MESSAGE_TYPE.VOICE ||
      messageType === MESSAGE_TYPE.VIEW_ONCE_IMAGE
        ? payload.mediaUrl
        : null,
    mediaMeta: payload.mediaMeta ?? null,
    location:
      messageType === MESSAGE_TYPE.LOCATION ||
      messageType === MESSAGE_TYPE.LIVE_LOCATION
        ? payload.location
        : null,
    liveLocation:
      messageType === MESSAGE_TYPE.LIVE_LOCATION
        ? { expiresAt: new Date(Date.now() + LIVE_LOCATION_DURATION_MS) }
        : null,
    replyTo,
    readBy: [new Types.ObjectId(requester.id)],
  });

  const populated = await populateMessage(created);
  await Chat.findByIdAndUpdate(payload.chat, {
    latestMessage: populated._id,
  });
  return sanitizeForRead(populated as unknown as IMessage, requester.id);
};

// Get messages for a chat (requester must be a chat participant).
// Optional `page`/`limit` query params paginate history (newest page last);
// without them the full history is returned (legacy behaviour).
// Fetching also marks the messages as read for this user (read receipts /
// unread counts).
const getMessagesByChatId = async (
  chatId: string,
  requester: TRequester,
  query?: Record<string, unknown>,
): Promise<{
  messages: TPublicMessage[];
  meta?: { page: number; limit: number; total: number; totalPage: number };
}> => {
  const chat = await getAccessibleChat(chatId, requester);
  if (!chat) {
    throw new AppError(httpStatus.NOT_FOUND, "Chat not found");
  }

  const rawLimit = Number(query?.limit);
  const rawPage = Number(query?.page);
  const paginated = Number.isFinite(rawLimit) && rawLimit > 0;

  let findQuery = Message.find({ chat: chatId });
  let meta: { page: number; limit: number; total: number; totalPage: number } | undefined;

  if (paginated) {
    const limit = Math.min(100, Math.max(1, Math.floor(rawLimit)));
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const total = await Message.countDocuments({ chat: chatId });
    findQuery = findQuery
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit) as unknown as typeof findQuery;
    meta = { page, limit, total, totalPage: Math.ceil(total / limit) };
  } else {
    // Deterministic chronological order (incl. same-ms ties) so client-side
    // refetches can never reshuffle the rendered list.
    findQuery = findQuery.sort({
      createdAt: 1,
      _id: 1,
    }) as unknown as typeof findQuery;
  }

  const messages = await findQuery
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
      messages: (await Promise.all(messages.reverse().map(async (m) =>
        sanitizeForRead(m as unknown as IMessage, requester.id),
      ))),
      meta,
    };
  }

  // Read receipts: opening the conversation marks everything read.
  if (messages.length) {
    await Message.updateMany(
      { chat: chatId, readBy: { $ne: new Types.ObjectId(requester.id) } },
      { $addToSet: { readBy: new Types.ObjectId(requester.id) } },
    );
  }

  return {
    messages: messages.map((m) => sanitizeForRead(m as unknown as IMessage, requester.id)),
  };
};

// Explicit mark-as-read (used when the client leaves the conversation).
const markChatReadIntoDB = async (
  chatId: string,
  requester: TRequester,
): Promise<{ updated: number }> => {
  const chat = await getAccessibleChat(chatId, requester);
  if (!chat) {
    throw new AppError(httpStatus.NOT_FOUND, "Chat not found");
  }
  const res = await Message.updateMany(
    { chat: chatId, readBy: { $ne: new Types.ObjectId(requester.id) } },
    { $addToSet: { readBy: new Types.ObjectId(requester.id) } },
  );
  return { updated: res.modifiedCount };
};

// Per-user unread count for one chat.
const getUnreadCountForChat = async (
  chatId: string,
  requester: TRequester,
): Promise<number> => {
  const chat = await getAccessibleChat(chatId, requester);
  if (!chat) {
    throw new AppError(httpStatus.NOT_FOUND, "Chat not found");
  }
  return Message.countDocuments({
    chat: chatId,
    readBy: { $ne: new Types.ObjectId(requester.id) },
  });
};

/**
 * Edit a message: the sender may update the text/caption (TEXT, EMOJI and
 * image/voice captions) or the coordinates of a LOCATION message. Media URLs
 * and message types are immutable; edits are stamped `isEdited`.
 */
const editMessageIntoDB = async (
  messageId: string,
  updates: { content?: string; location?: { lat: number; lng: number; label?: string } },
  requester: TRequester,
): Promise<TPublicMessage> => {
  const message = await Message.findById(messageId);
  if (!message || message.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Message not found");
  }
  if (String(message.sender) !== requester.id) {
    throw new AppError(httpStatus.FORBIDDEN, "You can only edit your own messages");
  }
  if (updates.content === undefined && updates.location === undefined) {
    throw new AppError(httpStatus.BAD_REQUEST, "Nothing to update");
  }

  const messageType = message.messageType ?? MESSAGE_TYPE.TEXT;

  if (updates.content !== undefined) {
    const content = updates.content.trim();
    if (messageType === MESSAGE_TYPE.TEXT && !content) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Text messages require non-empty content",
      );
    }
    if (messageType === MESSAGE_TYPE.EMOJI && (!content || content.length > 16)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Emoji messages require 1-16 characters of content",
      );
    }
    if (content.length > 5000) {
      throw new AppError(httpStatus.BAD_REQUEST, "Content is too long");
    }
    message.content = content;
  }

  if (updates.location !== undefined) {
    if (messageType !== MESSAGE_TYPE.LOCATION) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Only location messages can update coordinates",
      );
    }
    const { lat, lng, label } = updates.location;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid coordinates");
    }
    message.location = { lat, lng, label };
  }

  message.isEdited = true;
  message.editedAt = new Date();
  await message.save();

  const populated = await populateMessage(message);
  const sanitized = sanitizeForRead(populated as unknown as IMessage, requester.id);

  const chat = await Chat.findById(message.chat).select("users").lean();
  const others = (chat?.users ?? [])
    .map((u) => String(u))
    .filter((u) => u !== requester.id);
  if (others.length) {
    emitToUsers(others, "message edited", sanitized);
  }

  return sanitized;
};

/**
 * Soft-delete a message: content is blanked immediately, the document stays
 * only so read receipts/ids remain consistent. A group chat's latest-message
 * pointer is cleared so previews never show deleted content.
 */
const deleteMessageIntoDB = async (
  messageId: string,
  requester: TRequester,
): Promise<void> => {
  const message = await Message.findById(messageId);
  if (!message) {
    throw new AppError(httpStatus.NOT_FOUND, "Message not found");
  }
  if (String(message.sender) !== requester.id && requester.role !== "ADMIN") {
    throw new AppError(httpStatus.FORBIDDEN, "You can only delete your own messages");
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
  await message.save();

  await Chat.updateOne(
    { _id: message.chat, latestMessage: message._id },
    { $set: { latestMessage: null } },
  );

  const chat = await Chat.findById(message.chat).select("users").lean();
  const others = (chat?.users ?? [])
    .map((u) => String(u))
    .filter((u) => u !== requester.id);
  if (others.length) {
    emitToUsers(others, "message deleted", {
      _id: String(message._id),
      chat: String(message.chat),
    });
  }
};

/**
 * Consume a VIEW_ONCE image: the first authorized open atomically flips
 * `viewOnceConsumedAt` and returns the media URL exactly once. Every later
 * call — including the sender's — gets 410 Gone, and history never contains
 * the URL.
 */
const consumeViewOnceMediaFromDB = async (
  messageId: string,
  requester: TRequester,
): Promise<{ mediaUrl: string; mediaMeta: IMessage["mediaMeta"]; caption: string }> => {
  const message = await Message.findById(messageId);
  if (!message || message.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Message not found");
  }
  if (message.messageType !== MESSAGE_TYPE.VIEW_ONCE_IMAGE) {
    throw new AppError(httpStatus.BAD_REQUEST, "This message is not view-once media");
  }

  const chat = await getAccessibleChat(String(message.chat), requester);
  if (!chat) {
    throw new AppError(httpStatus.NOT_FOUND, "Message not found");
  }
  if (String(message.sender) === requester.id) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You already have this media — view-once is for the recipient",
    );
  }

  // Atomic single-consumption: only one request can win this transition.
  const consumed = await Message.findOneAndUpdate(
    {
      _id: message._id,
      viewOnceConsumedAt: null,
      isDeleted: false,
    },
    {
      $set: {
        viewOnceConsumedAt: new Date(),
        viewOnceConsumedBy: new Types.ObjectId(requester.id),
      },
      $addToSet: { readBy: new Types.ObjectId(requester.id) },
    },
    { new: true },
  );

  if (!consumed) {
    throw new AppError(
      httpStatus.GONE,
      "This view-once photo has already been opened",
    );
  }
  if (!consumed.mediaUrl) {
    throw new AppError(httpStatus.GONE, "Media is no longer available");
  }

  return {
    mediaUrl: consumed.mediaUrl,
    mediaMeta: consumed.mediaMeta ?? null,
    caption: consumed.content ?? "",
  };
};

/**
 * Shared gate for the reaction endpoints: the message must exist, not be
 * soft-deleted, and the requester must be a chat participant (non-members
 * get the same 404 used by history so ids cannot be probed).
 */
const getReactableMessage = async (
  messageId: string,
  requester: TRequester,
): Promise<{
  messageId: Types.ObjectId;
  chatId: string;
  members: string[];
}> => {
  const message = await Message.findById(messageId).select("chat isDeleted");
  if (!message || message.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Message not found");
  }
  const chat = await Chat.findById(message.chat).select("users").lean();
  if (!chat) {
    throw new AppError(httpStatus.NOT_FOUND, "Message not found");
  }
  const members = (chat.users ?? []).map((u) => String(u));
  if (!members.includes(requester.id) && requester.role !== "ADMIN") {
    throw new AppError(httpStatus.NOT_FOUND, "Message not found");
  }
  return {
    messageId: message._id as Types.ObjectId,
    chatId: String(message.chat),
    members,
  };
};

/**
 * Every member receives their own summary: counts/total are identical but
 * `myReaction` differs per viewer, so the broadcast is per user.
 */
const broadcastReactionUpdate = (
  rawReactions: unknown,
  chatId: string,
  messageId: string,
  members: string[],
): void => {
  for (const member of members) {
    const payload: TMessageReactionUpdate = {
      _id: messageId,
      chat: chatId,
      reactions: summarizeReactions(rawReactions, member),
    };
    emitToUser(member, "message reacted", payload);
  }
};

/**
 * Set (or switch) the requester's reaction on a message. The update runs as
 * an atomic pipeline: the user's previous entry is filtered out and the new
 * one appended, so rapid switching can never stack duplicates.
 */
const reactToMessageIntoDB = async (
  messageId: string,
  type: TReactionType,
  requester: TRequester,
): Promise<TMessageReactionUpdate> => {
  if (!(REACTION_TYPES as readonly string[]).includes(type)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Unsupported reaction type");
  }
  const target = await getReactableMessage(messageId, requester);

  const user = new Types.ObjectId(requester.id);
  const updated = await Message.findOneAndUpdate(
    { _id: target.messageId },
    [
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
    ],
    { new: true },
  ).select("reactions");

  if (!updated) {
    throw new AppError(httpStatus.NOT_FOUND, "Message not found");
  }

  broadcastReactionUpdate(updated.reactions, target.chatId, target.messageId.toString(), target.members);

  return {
    _id: target.messageId.toString(),
    chat: target.chatId,
    reactions: summarizeReactions(updated.reactions, requester.id),
  };
};

/** Remove the requester's reaction (idempotent — no reaction is a no-op). */
const removeReactionFromMessageIntoDB = async (
  messageId: string,
  requester: TRequester,
): Promise<TMessageReactionUpdate> => {
  const target = await getReactableMessage(messageId, requester);

  const updated = await Message.findOneAndUpdate(
    { _id: target.messageId },
    { $pull: { reactions: { user: new Types.ObjectId(requester.id) } } },
    { new: true },
  ).select("reactions");

  if (!updated) {
    throw new AppError(httpStatus.NOT_FOUND, "Message not found");
  }

  broadcastReactionUpdate(updated.reactions, target.chatId, target.messageId.toString(), target.members);

  return {
    _id: target.messageId.toString(),
    chat: target.chatId,
    reactions: summarizeReactions(updated.reactions, requester.id),
  };
};

export const MessageServices = {
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
export const sanitizeChatLatestMessage = <T extends { latestMessage?: unknown }>(
  chat: T,
  viewerId?: string,
): T => {
  const latest = chat.latestMessage as IMessage | null | undefined;
  if (latest && typeof latest === "object") {
    chat.latestMessage = sanitizeForRead(latest as IMessage, viewerId);
  }
  return chat;
};
