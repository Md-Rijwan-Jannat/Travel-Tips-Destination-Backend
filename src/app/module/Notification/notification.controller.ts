import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { NotificationService } from "./notification.service";

const getMyNotifications = catchAsync(async (req, res) => {
  const { result, meta } = await NotificationService.getMyNotificationsFromDB(req.user.id, req.query as Record<string, unknown>);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notifications fetched successfully",
    meta,
    data: result,
  });
});

const getUnreadCount = catchAsync(async (req, res) => {
  const count = await NotificationService.getUnreadCountFromDB(req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    data: { count },
  });
});

const markRead = catchAsync(async (req, res) => {
  await NotificationService.markReadIntoDB(req.user.id, req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notification marked as read",
  });
});

const markAllRead = catchAsync(async (req, res) => {
  await NotificationService.markAllReadIntoDB(req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "All notifications marked as read",
  });
});

const deleteNotification = catchAsync(async (req, res) => {
  await NotificationService.deleteNotificationFromDB(req.user.id, req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notification deleted",
  });
});

export const NotificationControllers = {
  getMyNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteNotification,
};
