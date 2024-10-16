import httpStatus from 'http-status';
import { IMessage } from './message.interface';
import AppError from '../../errors/AppError';
import { Message } from './message.model';
import { Chat } from '../Chat/chat.model';

// Create a new message
const createMessageIntoDB = async (
  payload: Partial<IMessage>,
  userId: string
): Promise<IMessage> => {
  const message = (
    await (
      await Message.create({ ...payload, sender: userId })
    ).populate('sender', '-password')
  ).populate({
    path: 'chat',
    populate: [
      { path: 'users', select: '-password' },
      {
        path: 'latestMessage',
        populate: { path: 'sender', select: '-password' },
      },
    ],
  });

  const chat = await Chat.findById(payload.chat);

  if (!chat) {
    throw new AppError(httpStatus.NOT_FOUND, 'Chat not found');
  }

  await Chat.findByIdAndUpdate(payload.chat, {
    latestMessage: (await message)._id,
  });
  return message;
};

// Get all messages by chat ID
const getMessagesByChatId = async (chatId: string): Promise<IMessage[]> => {
  const messages = await Message.find({ chat: chatId })
    .populate('sender', '-password')
    .populate({
      path: 'chat',
      populate: [
        { path: 'users', select: '-password' },
        {
          path: 'latestMessage',
          populate: { path: 'sender', select: '-password' },
        },
      ],
    });

  if (!messages.length) {
    throw new AppError(httpStatus.NOT_FOUND, 'No messages found for this chat');
  }

  return messages;
};

export const MessageServices = {
  createMessageIntoDB,
  getMessagesByChatId,
};
