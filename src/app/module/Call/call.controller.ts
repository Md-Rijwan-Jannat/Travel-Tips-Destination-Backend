import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status";
import { CallServices } from "./call.service";

// Paginated call history for one chat
const getCalls = catchAsync(async (req, res) => {
  const { calls, meta } = await CallServices.getCallsForChatFromDB(
    req.params.chatId,
    { id: req.user.id, role: req.user.role },
    req.query as Record<string, unknown>,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Call history retrieved successfully",
    meta,
    data: calls,
  });
});

export const CallController = {
  getCalls,
};
