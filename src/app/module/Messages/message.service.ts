import httpStatus from "http-status";
import { Types } from "mongoose";
import { IMessage } from "./message.interface";
import AppError from "../../errors/AppError";
import { Message } from "./message.model";
import { Chat } from "../Chat/chat.model";
import { Group } from "../Group/group.model";
import { GroupMembership } from "../Group/groupMembership.model";
import { GROUP_MEMBERSHIP_STATUS } from "../Group/group.constants";

type TRequester = { id: string; role: string };

const getAccessibleChat = async (
  chatId: string,
  requester: TRequester,
): Promise<{ users?: unknown[] | null; groupCommunity?: unknown } | null> => {
  // groupCommunity must be selected: group messaging policy checks depend on it.
  const chat = await Chat.findById(chatId).select("users groupCommunity groupAdmin");
  if (!chat) return null;

  const isMember = (chat.users ?? []).some(
    (u) => String(u) === requester.id,
  );
  // Non-members get the same 404 as a missing chat so the endpoint does not
  // reveal which chat IDs exist.
  if (!isMember && requester.role !== "ADMIN") return null;

  return chat;
};

// Create a new message (requester must be a participant of the target chat)
const createMessageIntoDB = async (
  payload: Partial<IMessage>,
  requester: TRequester,
): Promise<IMessage> => {
  const chat = await getAccessibleChat(String(payload.chat), requester);
  if (!chat) {
    throw new AppError(httpStatus.NOT_FOUND, "Chat not found");
  }

  const content = typeof payload.content === "string" ? payload.content.trim() : "";
  if (!content || content.length > 5000) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Message content is required and must be under 5000 characters",
    );
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

  const created = await Message.create({ ...payload, content, sender: requester.id });

  const populated = await created.populate([
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

  await Chat.findByIdAndUpdate(payload.chat, {
    latestMessage: populated._id,
  });
  return populated;
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
  messages: IMessage[];
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
  }

  const messages = await findQuery
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

  if (paginated) {
    // Newest-first slice → return chronological for rendering.
    messages.reverse();
    return { messages, meta };
  }

  // Read receipts: opening the conversation marks everything read.
  if (messages.length) {
    await Message.updateMany(
      { chat: chatId, readBy: { $ne: new Types.ObjectId(requester.id) } },
      { $addToSet: { readBy: new Types.ObjectId(requester.id) } },
    );
  }

  return { messages };
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

export const MessageServices = {
  createMessageIntoDB,
  getMessagesByChatId,
  markChatReadIntoDB,
  getUnreadCountForChat,
};
