import { Types } from 'mongoose';
import { IChat } from './chat.interface';
import { Chat } from './chat.model';
import { User } from '../User/user.model';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';

// Create chart service
const createChatIntoDB = async (
  payload: IChat,
  userId: string
): Promise<IChat> => {
  const user = await User.findById(payload.user);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user not found');
  }

  const existingChat = await Chat.find({
    isGroupChat: false,
    $and: [
      { users: { $elemMatch: { $eq: userId } } },
      { users: { $elemMatch: { $eq: user._id } } },
    ],
  })
    .populate('users', '-password')
    .populate('latestMessage')
    .populate('groupAdmin', '-password');

  if (existingChat.length > 0) {
    await User.populate(existingChat, {
      path: 'latestMessage.sender',
      select: '-password',
    });

    return existingChat[0];
  }

  const chatData: Partial<IChat> = {
    chatName: 'sender',
    isGroupChat: false,
    users: [new Types.ObjectId(userId), new Types.ObjectId(user._id)],
  };

  const newChat = await Chat.create(chatData);

  const fullChat = await Chat.findOne({ _id: newChat._id })
    .populate('users', '-password')
    .populate('latestMessage');

  return fullChat as IChat;
};

// Fetch all chats for a user
const getUserChatsFromDB = async (
  userId: string,
  query: any
): Promise<{ result: IChat[]; meta: any }> => {
  const limit = parseInt(query.limit) || 10;
  const page = parseInt(query.page) || 1;

  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found');
  }

  const chats = await Chat.find({
    users: { $elemMatch: { $eq: userId } },
  })
    .populate('users', '-password')
    .populate('latestMessage')
    .populate('groupAdmin', '-password')
    .sort({ updatedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  const total = await Chat.countDocuments({ users: userId });

  const meta = {
    total,
    limit,
    page,
    totalPages: Math.ceil(total / limit),
  };

  return { result: chats, meta };
};

// Fetch a single chat by chatId
const getSingleChatFromDB = async (
  chatId: string,
  userId: string
): Promise<IChat> => {
  const chat = await Chat.findOne({
    _id: chatId,
    users: { $elemMatch: { $eq: userId } },
  })
    .populate('users', '-password')
    .populate('latestMessage')
    .populate('groupAdmin', '-password');

  if (!chat) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'Chat not found or user is not a participant'
    );
  }

  return chat;
};

// Create a new group chat
const createGroupChatInDB = async (
  payload: Partial<IChat>,
  userId: Types.ObjectId
) => {
  console.log(userId, payload);

  const users = payload.users;

  if (!userId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User ID is not provided');
  }

  if (users) {
    if (users.length < 2) {
      throw new Error('More than 2 users are required to form a group chat');
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
    .populate('users', '-password')
    .populate('groupAdmin', '-password');
};

// Rename group chat
const renameGroupChat = async (payload: {
  chatId: string;
  chatName: string;
}) => {
  const { chatId, chatName } = payload;
  const updatedChat = await Chat.findByIdAndUpdate(
    chatId,
    { chatName },
    { new: true }
  )
    .populate('users', '-password')
    .populate('groupAdmin', '-password');

  if (!updatedChat) {
    throw new AppError(httpStatus.NOT_FOUND, 'Chat Not Found');
  }

  return updatedChat;
};

// Remove a user from group chat
const removeFromGroup = async (payload: { chatId: string; userId: string }) => {
  const { chatId, userId } = payload;
  const updatedChat = await Chat.findByIdAndUpdate(
    chatId,
    { $pull: { users: userId } },
    { new: true }
  )
    .populate('users', '-password')
    .populate('groupAdmin', '-password');

  if (!updatedChat) {
    throw new Error('Chat Not Found');
  }

  return updatedChat;
};

// Add a user to group chat
const addToGroup = async (payload: { chatId: string; userId: string }) => {
  const { chatId, userId } = payload;
  const updatedChat = await Chat.findByIdAndUpdate(
    chatId,
    { $push: { users: userId } },
    { new: true }
  )
    .populate('users', '-password')
    .populate('groupAdmin', '-password');

  if (!updatedChat) {
    throw new Error('Chat Not Found');
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
