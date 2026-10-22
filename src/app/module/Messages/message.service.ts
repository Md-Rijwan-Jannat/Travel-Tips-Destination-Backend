import httpStatus from "http-status";
import { IMessage } from "./message.interface";
import AppError from "../../errors/AppError";
import { Message } from "./message.model";
import { Chat } from "../Chat/chat.model";

type TRequester = { id: string; role: string };

const getAccessibleChat = async (
  chatId: string,
  requester: TRequester,
): Promise<{ users?: unknown[] | null } | null> => {
  const chat = await Chat.findById(chatId).select("users");
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

  const created = await Message.create({ ...payload, sender: requester.id });

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

// Get all messages by chat ID (requester must be a chat participant)
const getMessagesByChatId = async (
  chatId: string,
  requester: TRequester,
): Promise<IMessage[]> => {
  const chat = await getAccessibleChat(chatId, requester);
  if (!chat) {
    throw new AppError(httpStatus.NOT_FOUND, "Chat not found");
  }

  const messages = await Message.find({ chat: chatId })
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
    throw new AppError(httpStatus.NOT_FOUND, "No messages found for this chat");
  }

  return messages;
};

export const MessageServices = {
  createMessageIntoDB,
  getMessagesByChatId,
};
