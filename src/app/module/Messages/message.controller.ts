import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status";
import { MessageServices } from "./message.service";

// Create a new message (typed: TEXT / IMAGE / VOICE / LOCATION / EMOJI / VIEW_ONCE_IMAGE)
const createMessage = catchAsync(async (req, res) => {
  const message = await MessageServices.createMessageIntoDB(req.body, {
    id: req.user.id,
    role: req.user.role,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Message created successfully",
    data: message,
  });
});

// Fetch messages for a chat (optional ?page=&limit= pagination)
const getMessages = catchAsync(async (req, res) => {
  const { messages, meta } = await MessageServices.getMessagesByChatId(
    req.params.chatId,
    { id: req.user.id, role: req.user.role },
    req.query as Record<string, unknown>,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Messages retrieved successfully",
    meta,
    data: messages,
  });
});

// Mark every message in a chat as read for the current user
const markChatRead = catchAsync(async (req, res) => {
  const result = await MessageServices.markChatReadIntoDB(req.params.chatId, {
    id: req.user.id,
    role: req.user.role,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Chat marked as read",
    data: result,
  });
});

// Unread message count for a chat
const getUnreadCount = catchAsync(async (req, res) => {
  const count = await MessageServices.getUnreadCountForChat(req.params.chatId, {
    id: req.user.id,
    role: req.user.role,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    data: { count },
  });
});

// Edit a message (sender-only; text/caption or location coordinates)
const editMessage = catchAsync(async (req, res) => {
  const message = await MessageServices.editMessageIntoDB(
    req.params.id,
    req.body,
    { id: req.user.id, role: req.user.role },
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Message updated successfully",
    data: message,
  });
});

// Soft-delete a message (sender-only)
const deleteMessage = catchAsync(async (req, res) => {
  await MessageServices.deleteMessageIntoDB(req.params.id, {
    id: req.user.id,
    role: req.user.role,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Message deleted successfully",
    data: "",
  });
});

// Consume view-once media: returns the URL exactly once, then 410 forever
const consumeViewOnceMedia = catchAsync(async (req, res) => {
  const data = await MessageServices.consumeViewOnceMediaFromDB(
    req.params.id,
    { id: req.user.id, role: req.user.role },
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "View-once media opened",
    data,
  });
});

export const MessageController = {
  createMessage,
  getMessages,
  markChatRead,
  getUnreadCount,
  editMessage,
  deleteMessage,
  consumeViewOnceMedia,
};
