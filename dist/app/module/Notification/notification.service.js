"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const http_status_1 = __importDefault(require("http-status"));
const mongoose_1 = require("mongoose");
const notification_model_1 = require("./notification.model");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const socketRegistry_1 = require("../../utils/socketRegistry");
const isAppRelativeLink = (link) => {
    if (!link)
        return null;
    // Only same-origin relative deep links — blocks open-redirect style
    // absolute URLs from ever being stored/emitted.
    if (/^https?:\/\//i.test(link) || link.startsWith("//"))
        return null;
    return link;
};
const createNotificationIntoDB = (input) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    if (!mongoose_1.Types.ObjectId.isValid(input.recipient))
        return null;
    // Never notify users about their own actions.
    if (input.actor && input.actor === input.recipient)
        return null;
    const link = isAppRelativeLink(input.link);
    if (input.dedupe && mongoose_1.Types.ObjectId.isValid((_a = input.entityId) !== null && _a !== void 0 ? _a : "")) {
        const existing = yield notification_model_1.Notification.findOne({
            recipient: input.recipient,
            type: input.type,
            entityId: input.entityId,
            readAt: null,
        });
        if (existing)
            return null;
    }
    const notification = yield notification_model_1.Notification.create({
        recipient: input.recipient,
        actor: (_b = input.actor) !== null && _b !== void 0 ? _b : null,
        type: input.type,
        title: input.title,
        body: (_c = input.body) !== null && _c !== void 0 ? _c : null,
        link,
        entityType: (_d = input.entityType) !== null && _d !== void 0 ? _d : null,
        entityId: (_e = input.entityId) !== null && _e !== void 0 ? _e : null,
        groupId: (_f = input.groupId) !== null && _f !== void 0 ? _f : null,
    });
    (0, socketRegistry_1.emitToUser)(String(input.recipient), "notification received", {
        _id: notification._id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        link: notification.link,
        createdAt: notification.createdAt,
    });
    return notification;
});
const getMyNotificationsFromDB = (userId, query) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const page = Math.max(1, parseInt(String((_a = query.page) !== null && _a !== void 0 ? _a : "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String((_b = query.limit) !== null && _b !== void 0 ? _b : "20"), 10) || 20));
    const filter = { recipient: userId };
    if (query.unread === "true")
        filter.readAt = null;
    const [items, total] = yield Promise.all([
        notification_model_1.Notification.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("actor", "name image"),
        notification_model_1.Notification.countDocuments(filter),
    ]);
    return {
        result: items,
        meta: { page, limit, total, totalPage: Math.ceil(total / limit) || 1 },
    };
});
const getUnreadCountFromDB = (userId) => __awaiter(void 0, void 0, void 0, function* () { return notification_model_1.Notification.countDocuments({ recipient: userId, readAt: null }); });
const markReadIntoDB = (userId, notificationId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!mongoose_1.Types.ObjectId.isValid(notificationId)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Notification not found");
    }
    const updated = yield notification_model_1.Notification.findOneAndUpdate({ _id: notificationId, recipient: userId }, { readAt: new Date() });
    if (!updated)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Notification not found");
});
const markAllReadIntoDB = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    yield notification_model_1.Notification.updateMany({ recipient: userId, readAt: null }, { readAt: new Date() });
});
exports.NotificationService = {
    createNotificationIntoDB,
    getMyNotificationsFromDB,
    getUnreadCountFromDB,
    markReadIntoDB,
    markAllReadIntoDB,
};
