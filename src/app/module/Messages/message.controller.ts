import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status";
import { MessageServices } from "./message.service";

// Create a new message
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

// Fetch all messages for a chat
const getMessages = catchAsync(async (req, res) => {
  const messages = await MessageServices.getMessagesByChatId(
    req.params.chatId,
    { id: req.user.id, role: req.user.role },
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Messages retrieved successfully",
    data: messages,
  });
});

export const MessageController = {
  createMessage,
  getMessages,
};
