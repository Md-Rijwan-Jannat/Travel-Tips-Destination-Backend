import httpStatus from 'http-status';
import sendResponse from '../../utils/sendResponse';
import catchAsync from '../../utils/catchAsync';
import { ChatServices } from './chat.service';
import { User } from '../User/user.model';

// Create a new chat
const createChat = catchAsync(async (req, res) => {
  const chat = await ChatServices.createChatIntoDB(req.body, req.user.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chat created successfully',
    data: chat,
  });
});

// Fetch all user chats
const getUserChats = catchAsync(async (req, res) => {
  const { result, meta } = await ChatServices.getUserChatsFromDB(
    req.user.id,
    req.query
  );
  const populatedResults = await User.populate(result, {
    path: 'latestMessage.sender',
    select: '_id name image email verified',
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chats retrieved successfully',
    meta,
    data: populatedResults,
  });
});

// Fetch all user chats
const getSingleChat = catchAsync(async (req, res) => {
  const { chatId } = req.params;
  const result = await ChatServices.getSingleChatFromDB(chatId, req.user.id);
  const populatedResults = await User.populate(result, {
    path: 'latestMessage.sender',
    select: '_id name image email verified',
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chat retrieved successfully',
    data: populatedResults,
  });
});

// Create a new group chat
const createGroupChat = catchAsync(async (req, res) => {
  const groupChat = await ChatServices.createGroupChatInDB(
    req.body,
    req.user.id
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Group chat created successfully',
    data: groupChat,
  });
});

// Rename a group chat
const renameGroup = catchAsync(async (req, res) => {
  const updatedChat = await ChatServices.renameGroupChat(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Group chat renamed successfully',
    data: updatedChat,
  });
});

// Remove a user from the group
const removeFromGroup = catchAsync(async (req, res) => {
  const updatedChat = await ChatServices.removeFromGroup(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User removed from group',
    data: updatedChat,
  });
});

// Add a user to the group
const addToGroup = catchAsync(async (req, res) => {
  const updatedChat = await ChatServices.addToGroup(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User added to group',
    data: updatedChat,
  });
});

export const ChatController = {
  createChat,
  getUserChats,
  getSingleChat,
  createGroupChat,
  renameGroup,
  removeFromGroup,
  addToGroup,
};
