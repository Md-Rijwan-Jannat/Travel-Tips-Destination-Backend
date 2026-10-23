import { Types } from "mongoose";
import { IChat } from "./chat.interface";
import { Chat } from "./chat.model";
import { Message } from "../Messages/message.model";
import { sanitizeChatLatestMessage } from "../Messages/message.service";
import { User } from "../User/user.model";
import AppError from "../../errors/AppError";
import httpStatus from "http-status";
import { removeUserFromRoom } from "../../utils/socketRegistry";

// Create chart service
const createChatIntoDB = async (
  payload: IChat,
  userId: string,
): Promise<IChat> => {
  const user = await User.findById(payload.user);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "This user not found");
  }

  const existingChat = await Chat.find({
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
    await User.populate(existingChat, {
      path: "latestMessage.sender",
      select: "-password",
    });

    return sanitizeChatLatestMessage(existingChat[0], userId);
  }

  const chatData: Partial<IChat> = {
    chatName: "sender",
    isGroupChat: false,
    users: [new Types.ObjectId(userId), new Types.ObjectId(user._id)],
  };

  const newChat = await Chat.create(chatData);

  const fullChat = await Chat.findOne({ _id: newChat._id })
    .populate("users", "-password")
    .populate("latestMessage");

  return fullChat
    ? (sanitizeChatLatestMessage(fullChat, userId) as unknown as IChat)
    : (null as unknown as IChat);
};

// Fetch all chats for a user
const getUserChatsFromDB = async (
  userId: string,
  query: Record<string, unknown>,
): Promise<{
  result: IChat[];
  meta: { total: number; limit: number; page: number; totalPages: number };
}> => {
  const limit = parseInt(String(query.limit)) || 10;
  const page = parseInt(String(query.page)) || 1;

  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "This user is not found");
  }

  const chats = await Chat.find({
    users: { $elemMatch: { $eq: userId } },
  })
    .populate("users", "-password")
    .populate("latestMessage")
    .populate("groupAdmin", "-password")
    .sort({ updatedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  const total = await Chat.countDocuments({ users: userId });

  // Unread counts: messages in these chats the current user has not read
  // (readBy is maintained by the message fetch/mark-read flows).
  const chatIds = chats.map((c) => c._id);
  const unread = await Message.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { chat: { $in: chatIds }, readBy: { $ne: new Types.ObjectId(userId) } } },
    { $group: { _id: "$chat", count: { $sum: 1 } } },
  ]);
  const unreadMap = new Map(unread.map((u) => [String(u._id), u.count]));

  const result = chats.map((chat) => {
    const plain = {
      ...(chat.toObject() as unknown as Record<string, unknown>),
      unreadCount: unreadMap.get(String(chat._id)) ?? 0,
    };
    return sanitizeChatLatestMessage(plain as unknown as IChat, userId);
  });

  const meta = {
    total,
    limit,
    page,
    totalPages: Math.ceil(total / limit),
  };

  return { result: result as unknown as IChat[], meta };
};

// Fetch a single chat by chatId
const getSingleChatFromDB = async (
  chatId: string,
  userId: string,
): Promise<IChat> => {
  const chat = await Chat.findOne({
    _id: chatId,
    users: { $elemMatch: { $eq: userId } },
  })
    .populate("users", "-password")
    .populate("latestMessage")
    .populate("groupAdmin", "-password");

  if (!chat) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Chat not found or user is not a participant",
    );
  }

  return sanitizeChatLatestMessage(chat, userId);
};

// Create a new group chat
const createGroupChatInDB = async (
  payload: Partial<IChat>,
  userId: Types.ObjectId,
) => {
  const users = payload.users;

  if (!userId) {
    throw new AppError(httpStatus.BAD_REQUEST, "User ID is not provided");
  }

  if (users) {
    if (users.length < 2) {
      throw new Error("More than 2 users are required to form a group chat");
    }

    users.push(userId);
  }

  const groupChat = await Chat.create({
    chatName: payload.chatName,
    users: users,
    isGroupChat: true,
    groupAdmin: userId,
  });

  return await Chat.findOne({ _id: groupChat._id })
    .populate("users", "-password")
    .populate("groupAdmin", "-password");
};

// Rename group chat
type TRequester = { id: string; role: string };

const assertChatMembership = (
  chat: { users?: unknown[] | null },
  requester: TRequester,
) => {
  const isMember = (chat.users ?? []).some((u) => String(u) === requester.id);
  if (!isMember && requester.role !== "ADMIN") {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not a participant of this chat",
    );
  }
};

const renameGroupChat = async (
  payload: {
    chatId: string;
    chatName: string;
  },
  requester: TRequester,
) => {
  const { chatId, chatName } = payload;

  const chat = await Chat.findById(chatId).select("users");
  if (!chat) {
    throw new AppError(httpStatus.NOT_FOUND, "Chat Not Found");
  }
  assertChatMembership(chat, requester);

  const updatedChat = await Chat.findByIdAndUpdate(
    chatId,
    { chatName },
    { new: true },
  )
    .populate("users", "-password")
    .populate("groupAdmin", "-password");

  if (!updatedChat) {
    throw new AppError(httpStatus.NOT_FOUND, "Chat Not Found");
  }

  return updatedChat;
};

// Remove a user from group chat (requester must be a chat participant)
const removeFromGroup = async (
  payload: { chatId: string; userId: string },
  requester: TRequester,
) => {
  const { chatId, userId } = payload;

  const chat = await Chat.findById(chatId).select("users");
  if (!chat) {
    throw new AppError(httpStatus.NOT_FOUND, "Chat Not Found");
  }
  assertChatMembership(chat, requester);

  const updatedChat = await Chat.findByIdAndUpdate(
    chatId,
    { $pull: { users: userId } },
    { new: true },
  )
    .populate("users", "-password")
    .populate("groupAdmin", "-password");

  if (!updatedChat) {
    throw new AppError(httpStatus.NOT_FOUND, "Chat Not Found");
  }

  // Drop any live socket room subscription the removed user still holds.
  removeUserFromRoom(userId, chatId);

  return updatedChat;
};

// Add a user to group chat (requester must be a chat participant)
const addToGroup = async (
  payload: { chatId: string; userId: string },
  requester: TRequester,
) => {
  const { chatId, userId } = payload;

  const chat = await Chat.findById(chatId).select("users isGroupChat");
  if (!chat) {
    throw new AppError(httpStatus.NOT_FOUND, "Chat Not Found");
  }
  assertChatMembership(chat, requester);

  // Only group conversations accept extra members — a DM can never grow a
  // third participant, and only real users can be added.
  if (!chat.isGroupChat) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Only group chats can add members",
    );
  }
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid user id");
  }
  const user = await User.findById(userId).select("_id");
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "This user not found");
  }

  const updatedChat = await Chat.findByIdAndUpdate(
    chatId,
    { $addToSet: { users: userId } },
    { new: true },
  )
    .populate("users", "-password")
    .populate("groupAdmin", "-password");

  if (!updatedChat) {
    throw new AppError(httpStatus.NOT_FOUND, "Chat Not Found");
  }

  return updatedChat;
};

export const ChatServices = {
  createChatIntoDB,
  getUserChatsFromDB,
  getSingleChatFromDB,
  createGroupChatInDB,
  renameGroupChat,
  removeFromGroup,
  addToGroup,
};
