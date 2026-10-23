import httpStatus from "http-status";
import { Types } from "mongoose";
import { Notification } from "./notification.model";
import AppError from "../../errors/AppError";
import { emitToUser } from "../../utils/socketRegistry";

export type TNotificationInput = {
  recipient: string;
  actor?: string | null;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  groupId?: string | null;
  // Deduplication key: when provided, an identical unread notification is
  // not re-created (protects against double-submit retries).
  dedupe?: boolean;
};

const isAppRelativeLink = (link: string | null | undefined): string | null => {
  if (!link) return null;
  // Only same-origin relative deep links — blocks open-redirect style
  // absolute URLs from ever being stored/emitted.
  if (/^https?:\/\//i.test(link) || link.startsWith("//")) return null;
  return link;
};

const createNotificationIntoDB = async (
  input: TNotificationInput,
): Promise<InstanceType<typeof Notification> | null> => {
  if (!Types.ObjectId.isValid(input.recipient)) return null;
  // Never notify users about their own actions.
  if (input.actor && input.actor === input.recipient) return null;

  const link = isAppRelativeLink(input.link);

  if (input.dedupe && Types.ObjectId.isValid(input.entityId ?? "")) {
    const existing = await Notification.findOne({
      recipient: input.recipient,
      type: input.type,
      entityId: input.entityId,
      readAt: null,
    });
    if (existing) return null;
  }

  const notification = await Notification.create({
    recipient: input.recipient,
    actor: input.actor ?? null,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    groupId: input.groupId ?? null,
  });

  emitToUser(String(input.recipient), "notification received", {
    _id: notification._id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    createdAt: notification.createdAt,
  });

  return notification;
};

const getMyNotificationsFromDB = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? "20"), 10) || 20));
  const filter: Record<string, unknown> = { recipient: userId };
  if (query.unread === "true") filter.readAt = null;

  const [items, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("actor", "name image"),
    Notification.countDocuments(filter),
  ]);

  return {
    result: items,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) || 1 },
  };
};

const getUnreadCountFromDB = async (userId: string): Promise<number> =>
  Notification.countDocuments({ recipient: userId, readAt: null });

const markReadIntoDB = async (
  userId: string,
  notificationId: string,
): Promise<void> => {
  if (!Types.ObjectId.isValid(notificationId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Notification not found");
  }
  const updated = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { readAt: new Date() },
  );
  if (!updated) throw new AppError(httpStatus.NOT_FOUND, "Notification not found");
};

const markAllReadIntoDB = async (userId: string): Promise<void> => {
  await Notification.updateMany(
    { recipient: userId, readAt: null },
    { readAt: new Date() },
  );
};

export const NotificationService = {
  createNotificationIntoDB,
  getMyNotificationsFromDB,
  getUnreadCountFromDB,
  markReadIntoDB,
  markAllReadIntoDB,
};
