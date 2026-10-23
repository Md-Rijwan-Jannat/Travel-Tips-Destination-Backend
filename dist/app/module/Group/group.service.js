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
exports.logGroupActivity = exports.GroupService = void 0;
const http_status_1 = __importDefault(require("http-status"));
const mongoose_1 = require("mongoose");
const group_model_1 = require("./group.model");
const groupMembership_model_1 = require("./groupMembership.model");
const groupInvite_model_1 = require("./groupInvite.model");
const groupActivityLog_model_1 = require("./groupActivityLog.model");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const QueryBuilder_1 = __importDefault(require("../../builder/QueryBuilder"));
const group_constants_1 = require("./group.constants");
const group_permissions_1 = require("./group.permissions");
const chat_model_1 = require("../Chat/chat.model");
const user_model_1 = require("../User/user.model");
const notification_service_1 = require("../Notification/notification.service");
const post_model_1 = require("../Post/post.model");
const socketRegistry_1 = require("../../utils/socketRegistry");
const SLUG_REGEX = /[^a-z0-9]+/g;
const buildSlug = (name) => name
    .toLowerCase()
    .trim()
    .replace(SLUG_REGEX, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "group";
const uniqueSlug = (base) => __awaiter(void 0, void 0, void 0, function* () {
    let candidate = base;
    let suffix = 1;
    for (let i = 0; i < 50; i += 1) {
        const exists = yield group_model_1.Group.exists({ slug: candidate });
        if (!exists)
            return candidate;
        suffix += 1;
        candidate = `${base}-${suffix}`;
    }
    return `${base}-${Date.now().toString(36)}`;
});
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Append-only audit trail. Never stores secrets — fire-and-forget. */
const logGroupActivity = (group, actor, action, extra) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        yield groupActivityLog_model_1.GroupActivityLog.create({
            group,
            actor,
            action,
            targetType: (_a = extra === null || extra === void 0 ? void 0 : extra.targetType) !== null && _a !== void 0 ? _a : null,
            targetId: (_b = extra === null || extra === void 0 ? void 0 : extra.targetId) !== null && _b !== void 0 ? _b : null,
            metadata: (_c = extra === null || extra === void 0 ? void 0 : extra.metadata) !== null && _c !== void 0 ? _c : null,
        });
    }
    catch (_d) {
        // Auditing must never break the primary operation.
    }
});
exports.logGroupActivity = logGroupActivity;
const staffIdsOf = (group) => __awaiter(void 0, void 0, void 0, function* () {
    const ids = yield groupMembership_model_1.GroupMembership.find({
        group: group._id,
        status: group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED,
        role: { $in: [group_constants_1.GROUP_ROLE.OWNER, group_constants_1.GROUP_ROLE.ADMIN, group_constants_1.GROUP_ROLE.MODERATOR] },
    }).distinct("user");
    return ids.map(String);
});
/* ------------------------------------------------------------------ */
/* Chat integration (reuses the existing Messenger infra)              */
/* ------------------------------------------------------------------ */
/**
 * Keeps the group's Messenger conversation participants in sync with group
 * membership. Former members lose socket room access and message-fetch
 * access because every Chat/Message check is based on `Chat.users`.
 */
const syncChatMembership = (group, userId, op) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let chatId = group.chat;
        if (!chatId) {
            const found = yield chat_model_1.Chat.findOne({ groupCommunity: group._id }).select("_id");
            chatId = found === null || found === void 0 ? void 0 : found._id;
        }
        if (!chatId)
            return;
        yield chat_model_1.Chat.updateOne({ _id: chatId }, op === "add"
            ? { $addToSet: { users: new mongoose_1.Types.ObjectId(userId) } }
            : { $pull: { users: new mongoose_1.Types.ObjectId(userId) } });
        // Immediately drop any live room subscription of a removed/banned member.
        if (op === "remove") {
            (0, socketRegistry_1.removeUserFromRoom)(userId, String(chatId));
        }
    }
    catch (_a) {
        // Chat sync must not block membership changes.
    }
});
/**
 * Returns the group's Messenger conversation, creating it on first request.
 * A unique sparse index on Chat.groupCommunity guarantees a single
 * conversation even under concurrent first-clicks (the loser of the race
 * re-reads the winner's document).
 */
const getOrCreateGroupConversation = (groupIdOrSlug, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const { group } = yield group_permissions_1.GroupPermissionService.authorize(groupIdOrSlug, requester, "group:chat");
    const existing = yield chat_model_1.Chat.findOne({ groupCommunity: group._id });
    if (existing)
        return existing;
    const memberIds = yield groupMembership_model_1.GroupMembership.find({
        group: group._id,
        status: group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED,
    }).distinct("user");
    try {
        const chat = yield chat_model_1.Chat.create({
            chatName: group.name,
            user: new mongoose_1.Types.ObjectId(requester.id),
            isGroupChat: true,
            users: memberIds.length ? memberIds : [new mongoose_1.Types.ObjectId(requester.id)],
            groupAdmin: group.owner,
            groupCommunity: group._id,
        });
        yield group_model_1.Group.updateOne({ _id: group._id }, { chat: chat._id });
        return chat;
    }
    catch (err) {
        const code = err.code;
        if (code === 11000) {
            const winner = yield chat_model_1.Chat.findOne({ groupCommunity: group._id });
            if (winner) {
                yield group_model_1.Group.updateOne({ _id: group._id }, { chat: winner._id });
                return winner;
            }
        }
        throw err;
    }
});
/* ------------------------------------------------------------------ */
/* Create / read / update                                              */
/* ------------------------------------------------------------------ */
const createGroupIntoDB = (payload, userId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    const name = String((_a = payload.name) !== null && _a !== void 0 ? _a : "").trim();
    if (!name)
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Group name is required");
    if (!payload.description || !String(payload.description).trim()) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Group description is required");
    }
    if (!group_constants_1.GROUP_CATEGORY.includes(payload.category)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Please provide a valid group category");
    }
    let requestedSlug = "";
    if (payload.slug) {
        requestedSlug = String(payload.slug)
            .toLowerCase()
            .trim()
            .replace(SLUG_REGEX, "-")
            .replace(/^-+|-+$/g, "");
        if (!requestedSlug) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid group slug");
        }
    }
    const slug = requestedSlug
        ? yield uniqueSlug(requestedSlug)
        : yield uniqueSlug(buildSlug(name));
    const visibility = payload.visibility === group_constants_1.GROUP_VISIBILITY.PRIVATE
        ? group_constants_1.GROUP_VISIBILITY.PRIVATE
        : group_constants_1.GROUP_VISIBILITY.PUBLIC;
    const group = yield group_model_1.Group.create({
        name,
        slug,
        description: String(payload.description),
        purpose: (_b = payload.purpose) !== null && _b !== void 0 ? _b : null,
        category: payload.category,
        visibility,
        image: (_c = payload.image) !== null && _c !== void 0 ? _c : null,
        coverImage: (_d = payload.coverImage) !== null && _d !== void 0 ? _d : null,
        location: (_e = payload.location) !== null && _e !== void 0 ? _e : null,
        rules: Array.isArray(payload.rules)
            ? payload.rules.slice(0, 30).map((r) => String(r))
            : [],
        joinPolicy: payload.joinPolicy &&
            Object.values(group_constants_1.GROUP_JOIN_POLICY).includes(payload.joinPolicy)
            ? payload.joinPolicy
            : visibility === group_constants_1.GROUP_VISIBILITY.PRIVATE
                ? group_constants_1.GROUP_JOIN_POLICY.REQUEST
                : group_constants_1.GROUP_JOIN_POLICY.OPEN,
        owner: userId,
        memberCount: 1,
        // Defaults: members publish immediately; chat on; new-post fanout on.
        postApprovalEnabled: payload.postApprovalEnabled === true,
        chatEnabled: payload.chatEnabled !== false,
        notifyOnNewPost: payload.notifyOnNewPost !== false,
    });
    // Creator becomes the initial Owner + approved member.
    yield groupMembership_model_1.GroupMembership.create({
        group: group._id,
        user: userId,
        role: group_constants_1.GROUP_ROLE.OWNER,
        status: group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED,
        joinedAt: new Date(),
        requestedAt: new Date(),
    });
    yield logGroupActivity(group._id, userId, group_constants_1.GROUP_ACTIVITY_ACTION.GROUP_CREATED, {
        targetType: "group",
        targetId: String(group._id),
        metadata: { visibility },
    });
    // Every group starts with a Messenger conversation so members can chat
    // immediately (unique sparse index on groupCommunity keeps it single).
    try {
        const chat = yield chat_model_1.Chat.create({
            chatName: group.name,
            isGroupChat: true,
            users: [new mongoose_1.Types.ObjectId(userId)],
            groupAdmin: [new mongoose_1.Types.ObjectId(userId)],
            groupCommunity: group._id,
        });
        group.chat = chat._id;
        yield group.save({ validateBeforeSave: false });
    }
    catch (_f) {
        // Lazy fallback: GET /groups/:id/chat will create it on first request.
    }
    return group;
});
const getSingleGroupFromDB = (groupIdOrSlug, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const group = yield group_permissions_1.GroupPermissionService.loadGroup(groupIdOrSlug);
    const membership = yield group_permissions_1.GroupPermissionService.getMembership(group._id, requester.id);
    if (!group_permissions_1.GroupPermissionService.canViewGroup(group, membership, requester)) {
        // Same response as a missing group — no existence oracle for private groups.
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Group not found");
    }
    return { group, membership };
});
const getAllGroupsFromDB = (query, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const myApprovedIds = yield groupMembership_model_1.GroupMembership.find({
        user: requester.id,
        status: group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED,
    }).distinct("group");
    const filter = {
        isDeleted: false,
        $or: [{ visibility: group_constants_1.GROUP_VISIBILITY.PUBLIC }, { _id: { $in: myApprovedIds } }],
    };
    if (query.category)
        filter.category = query.category;
    if (query.visibility &&
        Object.values(group_constants_1.GROUP_VISIBILITY).includes(query.visibility)) {
        filter.visibility = query.visibility;
    }
    if (query.location && typeof query.location === "string") {
        filter.location = { $regex: escapeRegex(query.location), $options: "i" };
    }
    if (query.tab === "mine") {
        filter._id = { $in: myApprovedIds };
    }
    // Search is applied via $and so it composes with the privacy $or above
    // (QueryBuilder.search would overwrite a pre-existing $or filter).
    if (query.searchTerm && typeof query.searchTerm === "string") {
        const safeTerm = escapeRegex(query.searchTerm);
        filter.$and = [
            {
                $or: group_constants_1.groupSearchFields.map((field) => ({
                    [field]: { $regex: safeTerm, $options: "i" },
                })),
            },
        ];
    }
    const qb = new QueryBuilder_1.default(group_model_1.Group.find(filter).populate("owner", "name image email"), query)
        .sort()
        .fields()
        .paginate();
    if (query.tab === "popular" || query.sort === "popular") {
        qb.modelQuery = qb.modelQuery.sort("-memberCount");
    }
    const result = yield qb.modelQuery;
    const meta = yield qb.countTotal();
    const ids = result.map((g) => g._id);
    const myMemberships = yield groupMembership_model_1.GroupMembership.find({
        group: { $in: ids },
        user: requester.id,
    }).lean();
    const membershipMap = new Map(myMemberships.map((m) => [String(m.group), m]));
    const data = result.map((g) => {
        var _a, _b;
        const m = membershipMap.get(String(g._id));
        return Object.assign(Object.assign({}, g.toObject()), { myStatus: (_a = m === null || m === void 0 ? void 0 : m.status) !== null && _a !== void 0 ? _a : group_constants_1.GROUP_MEMBERSHIP_STATUS.NONE, myRole: (_b = m === null || m === void 0 ? void 0 : m.role) !== null && _b !== void 0 ? _b : null });
    });
    return { result: data, meta };
});
const updateGroupIntoDB = (groupIdOrSlug, payload, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const group = yield group_permissions_1.GroupPermissionService.loadGroup(groupIdOrSlug);
    const membership = yield group_permissions_1.GroupPermissionService.getMembership(group._id, requester.id);
    if (!group_permissions_1.GroupPermissionService.canViewGroup(group, membership, requester)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Group not found");
    }
    group_permissions_1.GroupPermissionService.assert(group, membership, requester, "group:manageGeneral");
    const update = {};
    const changed = [];
    const simpleFields = ["name", "description", "purpose", "category", "location"];
    for (const key of simpleFields) {
        if (payload[key] !== undefined) {
            update[key] = payload[key];
            changed.push(key);
        }
    }
    if (payload.rules !== undefined) {
        if (!Array.isArray(payload.rules)) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Rules must be a list");
        }
        update.rules = payload.rules.slice(0, 30).map((r) => String(r));
        changed.push("rules");
    }
    if (payload.image !== undefined || payload.coverImage !== undefined) {
        group_permissions_1.GroupPermissionService.assert(group, membership, requester, "group:manageMedia");
        if (payload.image !== undefined)
            update.image = payload.image;
        if (payload.coverImage !== undefined)
            update.coverImage = payload.coverImage;
        changed.push("media");
    }
    const postingFields = ["joinPolicy", "postPermission", "postApprovalEnabled"];
    for (const key of postingFields) {
        if (payload[key] !== undefined) {
            group_permissions_1.GroupPermissionService.assert(group, membership, requester, "group:managePosting");
            update[key] = payload[key];
            changed.push(key);
        }
    }
    if (payload.chatEnabled !== undefined) {
        group_permissions_1.GroupPermissionService.assert(group, membership, requester, "group:manageGeneral");
        update.chatEnabled = payload.chatEnabled === true;
        changed.push("chatEnabled");
    }
    if (payload.notifyOnNewPost !== undefined) {
        group_permissions_1.GroupPermissionService.assert(group, membership, requester, "group:manageGeneral");
        update.notifyOnNewPost = payload.notifyOnNewPost === true;
        changed.push("notifyOnNewPost");
    }
    // Visibility changes are staff sensitive and must be reflected on existing
    // group posts so the global feed never leaks private content.
    if (payload.visibility !== undefined &&
        payload.visibility !== group.visibility &&
        Object.values(group_constants_1.GROUP_VISIBILITY).includes(payload.visibility)) {
        group_permissions_1.GroupPermissionService.assert(group, membership, requester, "group:manageVisibility");
        update.visibility = payload.visibility;
        changed.push("visibility");
        yield post_model_1.Post.updateMany({ group: group._id, isDeleted: false }, { groupVisibility: payload.visibility });
    }
    if (Object.keys(update).length === 0) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "No valid fields to update");
    }
    const updated = yield group_model_1.Group.findByIdAndUpdate(group._id, update, {
        new: true,
        runValidators: true,
    });
    if (!updated)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Group not found");
    if (payload.postApprovalEnabled !== undefined) {
        yield logGroupActivity(group._id, requester.id, group_constants_1.GROUP_ACTIVITY_ACTION.APPROVAL_TOGGLED, {
            targetType: "group",
            targetId: String(group._id),
            metadata: { enabled: payload.postApprovalEnabled === true },
        });
    }
    yield logGroupActivity(group._id, requester.id, group_constants_1.GROUP_ACTIVITY_ACTION.SETTINGS_UPDATED, {
        targetType: "group",
        targetId: String(group._id),
        metadata: { fields: changed },
    });
    return updated;
});
const deleteGroupFromDB = (groupIdOrSlug, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const { group } = yield group_permissions_1.GroupPermissionService.authorize(groupIdOrSlug, requester, "group:delete");
    group.isDeleted = true;
    yield group.save();
    yield logGroupActivity(group._id, requester.id, group_constants_1.GROUP_ACTIVITY_ACTION.GROUP_DELETED);
    yield notification_service_1.NotificationService.createNotificationIntoDB({
        recipient: String(group.owner),
        actor: requester.id,
        type: "group.deleted",
        title: `${group.name} was deleted`,
        link: "/groups",
        entityType: "group",
        entityId: String(group._id),
    });
});
/* ------------------------------------------------------------------ */
/* Membership                                                          */
/* ------------------------------------------------------------------ */
const resolveMembershipOutcome = (group_1, userId_1, inviteRequiresApproval_1, ...args_1) => __awaiter(void 0, [group_1, userId_1, inviteRequiresApproval_1, ...args_1], void 0, function* (group, userId, inviteRequiresApproval, viaInvite = false) {
    var _a;
    const existing = yield groupMembership_model_1.GroupMembership.findOne({ group: group._id, user: userId });
    if ((existing === null || existing === void 0 ? void 0 : existing.status) === group_constants_1.GROUP_MEMBERSHIP_STATUS.BANNED) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are banned from this group");
    }
    if ((existing === null || existing === void 0 ? void 0 : existing.status) === group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED) {
        return { status: group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED };
    }
    // A valid invite link is itself the authorization for CLOSED/REQUEST
    // groups — that is the point of an invite. Otherwise the normal
    // open-join rules apply.
    const openJoin = !inviteRequiresApproval &&
        (viaInvite ||
            (group.joinPolicy === group_constants_1.GROUP_JOIN_POLICY.OPEN &&
                group.visibility === group_constants_1.GROUP_VISIBILITY.PUBLIC));
    if (openJoin) {
        if (existing) {
            existing.status = group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED;
            existing.joinedAt = new Date();
            existing.requestedAt = (_a = existing.requestedAt) !== null && _a !== void 0 ? _a : new Date();
            existing.reviewedAt = new Date();
            existing.reviewedBy = null;
            yield existing.save({ validateBeforeSave: false });
        }
        else {
            yield groupMembership_model_1.GroupMembership.create({
                group: group._id,
                user: userId,
                role: group_constants_1.GROUP_ROLE.MEMBER,
                status: group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED,
                joinedAt: new Date(),
                requestedAt: new Date(),
            });
        }
        yield group_model_1.Group.updateOne({ _id: group._id }, { $inc: { memberCount: 1 } });
        yield syncChatMembership(group, userId, "add");
        yield logGroupActivity(group._id, userId, group_constants_1.GROUP_ACTIVITY_ACTION.MEMBER_JOINED);
        yield notification_service_1.NotificationService.createNotificationIntoDB({
            recipient: String(group.owner),
            actor: userId,
            type: "group.member_joined",
            title: "New member joined your group",
            body: `A new member joined ${group.name}.`,
            link: `/groups/${group.slug}/members`,
            entityType: "group",
            entityId: String(group._id),
            groupId: String(group._id),
            dedupe: true,
        });
        return { status: group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED };
    }
    // Request-to-join path (private groups / request policy / invite approval).
    if (existing && existing.status === group_constants_1.GROUP_MEMBERSHIP_STATUS.PENDING) {
        return { status: group_constants_1.GROUP_MEMBERSHIP_STATUS.PENDING };
    }
    if (existing) {
        existing.status = group_constants_1.GROUP_MEMBERSHIP_STATUS.PENDING;
        existing.requestedAt = new Date();
        existing.reviewedAt = null;
        existing.reviewedBy = null;
        yield existing.save({ validateBeforeSave: false });
    }
    else {
        yield groupMembership_model_1.GroupMembership.create({
            group: group._id,
            user: userId,
            role: group_constants_1.GROUP_ROLE.MEMBER,
            status: group_constants_1.GROUP_MEMBERSHIP_STATUS.PENDING,
            requestedAt: new Date(),
        });
    }
    yield group_model_1.Group.updateOne({ _id: group._id }, { $inc: { pendingCount: 1 } });
    yield logGroupActivity(group._id, userId, group_constants_1.GROUP_ACTIVITY_ACTION.MEMBER_REQUESTED);
    const staff = yield staffIdsOf(group);
    yield Promise.all(staff.map((id) => notification_service_1.NotificationService.createNotificationIntoDB({
        recipient: id,
        actor: userId,
        type: "group.join_request",
        title: "New join request",
        body: `Someone requested to join ${group.name}.`,
        link: `/groups/${group.slug}/members?tab=pending`,
        entityType: "group",
        entityId: String(group._id),
        groupId: String(group._id),
        dedupe: true,
    })));
    return { status: group_constants_1.GROUP_MEMBERSHIP_STATUS.PENDING };
});
const joinGroupIntoDB = (groupIdOrSlug, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const group = yield group_permissions_1.GroupPermissionService.loadGroup(groupIdOrSlug);
    const membership = yield group_permissions_1.GroupPermissionService.getMembership(group._id, requester.id);
    if (group_permissions_1.GroupPermissionService.isBanned(membership)) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are banned from this group");
    }
    if ((membership === null || membership === void 0 ? void 0 : membership.status) === group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED) {
        return { status: group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED };
    }
    return resolveMembershipOutcome(group, requester.id, false);
});
const leaveGroupIntoDB = (groupIdOrSlug, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const group = yield group_permissions_1.GroupPermissionService.loadGroup(groupIdOrSlug);
    const membership = yield group_permissions_1.GroupPermissionService.getMembership(group._id, requester.id);
    if (!membership || membership.status !== group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are not a member of this group");
    }
    if (String(group.owner) === requester.id) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Transfer ownership before leaving the group");
    }
    yield groupMembership_model_1.GroupMembership.updateOne({ group: group._id, user: requester.id }, { status: group_constants_1.GROUP_MEMBERSHIP_STATUS.LEFT, joinedAt: null });
    yield group_model_1.Group.updateOne({ _id: group._id }, { $inc: { memberCount: -1 } });
    yield syncChatMembership(group, requester.id, "remove");
    yield logGroupActivity(group._id, requester.id, group_constants_1.GROUP_ACTIVITY_ACTION.MEMBER_LEFT);
    return { status: group_constants_1.GROUP_MEMBERSHIP_STATUS.LEFT };
});
const reviewJoinRequestIntoDB = (groupIdOrSlug, targetUserId, decision, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const { group } = yield group_permissions_1.GroupPermissionService.authorize(groupIdOrSlug, requester, "group:manageMembers");
    const membership = yield groupMembership_model_1.GroupMembership.findOne({
        group: group._id,
        user: targetUserId,
    });
    if (!membership || membership.status !== group_constants_1.GROUP_MEMBERSHIP_STATUS.PENDING) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "No pending join request found");
    }
    membership.status = decision;
    membership.reviewedBy = new mongoose_1.Types.ObjectId(requester.id);
    membership.reviewedAt = new Date();
    if (decision === group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED) {
        membership.joinedAt = new Date();
    }
    yield membership.save({ validateBeforeSave: false });
    yield group_model_1.Group.updateOne({ _id: group._id }, decision === group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED
        ? { $inc: { memberCount: 1, pendingCount: -1 } }
        : { $inc: { pendingCount: -1 } });
    if (decision === group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED) {
        yield syncChatMembership(group, targetUserId, "add");
    }
    yield logGroupActivity(group._id, requester.id, decision === group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED
        ? group_constants_1.GROUP_ACTIVITY_ACTION.MEMBER_APPROVED
        : group_constants_1.GROUP_ACTIVITY_ACTION.MEMBER_REJECTED, { targetType: "user", targetId: targetUserId });
    yield notification_service_1.NotificationService.createNotificationIntoDB({
        recipient: targetUserId,
        actor: requester.id,
        type: "group.join_request_result",
        title: decision === group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED
            ? "Your join request was approved"
            : "Your join request was declined",
        body: decision === group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED
            ? `Welcome to ${group.name}!`
            : `Your request to join ${group.name} was declined.`,
        link: `/groups/${group.slug}`,
        entityType: "group",
        entityId: String(group._id),
        groupId: String(group._id),
    });
    return { status: decision };
});
const listMembersFromDB = (groupIdOrSlug, query, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const group = yield group_permissions_1.GroupPermissionService.loadGroup(groupIdOrSlug);
    const membership = yield group_permissions_1.GroupPermissionService.getMembership(group._id, requester.id);
    if (!group_permissions_1.GroupPermissionService.canViewGroup(group, membership, requester)) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Group not found");
    }
    // Private member rosters are member-only information.
    if (group.visibility === group_constants_1.GROUP_VISIBILITY.PRIVATE &&
        !group_permissions_1.GroupPermissionService.isActiveMember(membership) &&
        requester.role !== "ADMIN") {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Join the group to see its members");
    }
    const page = Math.max(1, parseInt(String((_a = query.page) !== null && _a !== void 0 ? _a : "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String((_b = query.limit) !== null && _b !== void 0 ? _b : "20"), 10) || 20));
    const status = String((_c = query.status) !== null && _c !== void 0 ? _c : group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED);
    const filter = { group: group._id, status };
    if (query.role && Object.values(group_constants_1.GROUP_ROLE).includes(query.role)) {
        filter.role = query.role;
    }
    if (query.search && typeof query.search === "string") {
        const userIds = yield user_model_1.User.find({
            name: { $regex: escapeRegex(String(query.search)), $options: "i" },
        }).distinct("_id");
        filter.user = { $in: userIds };
    }
    const [items, total] = yield Promise.all([
        groupMembership_model_1.GroupMembership.find(filter)
            .sort({ role: 1, joinedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("user", "name image email country"),
        groupMembership_model_1.GroupMembership.countDocuments(filter),
    ]);
    return {
        result: items,
        meta: { page, limit, total, totalPage: Math.ceil(total / limit) || 1 },
    };
});
/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */
const changeMemberRoleIntoDB = (groupIdOrSlug, targetUserId, newRole, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const { group, membership } = yield group_permissions_1.GroupPermissionService.authorize(groupIdOrSlug, requester, "group:manageRoles");
    if (!Object.values(group_constants_1.GROUP_ROLE).includes(newRole) || newRole === group_constants_1.GROUP_ROLE.OWNER) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid role");
    }
    const target = yield groupMembership_model_1.GroupMembership.findOne({
        group: group._id,
        user: targetUserId,
    });
    if (!target || target.status !== group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Member not found in this group");
    }
    if (targetUserId === requester.id) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "You cannot change your own role");
    }
    const targetCurrentRole = target.role;
    group_permissions_1.GroupPermissionService.assertCanManageRole(group, membership, requester, targetCurrentRole, newRole);
    const previousRole = target.role;
    target.role = newRole;
    yield target.save({ validateBeforeSave: false });
    yield logGroupActivity(group._id, requester.id, group_constants_1.GROUP_ACTIVITY_ACTION.ROLE_CHANGED, {
        targetType: "user",
        targetId: targetUserId,
        metadata: { from: previousRole, to: newRole },
    });
    yield notification_service_1.NotificationService.createNotificationIntoDB({
        recipient: targetUserId,
        actor: requester.id,
        type: "group.role_changed",
        title: `Your role changed in ${group.name}`,
        body: `You are now ${newRole === group_constants_1.GROUP_ROLE.MODERATOR ? "a moderator" : newRole === group_constants_1.GROUP_ROLE.ADMIN ? "an admin" : "a member"}.`,
        link: `/groups/${group.slug}`,
        entityType: "group",
        entityId: String(group._id),
        groupId: String(group._id),
    });
    return { role: newRole, previousRole };
});
const transferOwnershipIntoDB = (groupIdOrSlug, targetUserId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const { group } = yield group_permissions_1.GroupPermissionService.authorize(groupIdOrSlug, requester, "group:transferOwnership");
    if (targetUserId === requester.id) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "You already own this group");
    }
    const target = yield groupMembership_model_1.GroupMembership.findOne({
        group: group._id,
        user: targetUserId,
        status: group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED,
    });
    if (!target) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Target must be an approved member");
    }
    // Explicit, atomic-ish two-step ownership handover.
    target.role = group_constants_1.GROUP_ROLE.OWNER;
    yield target.save({ validateBeforeSave: false });
    const myMembership = yield groupMembership_model_1.GroupMembership.findOne({
        group: group._id,
        user: requester.id,
    });
    if (myMembership && String(myMembership._id) !== String(target._id)) {
        myMembership.role = group_constants_1.GROUP_ROLE.ADMIN;
        yield myMembership.save({ validateBeforeSave: false });
    }
    group.owner = new mongoose_1.Types.ObjectId(targetUserId);
    yield group.save();
    yield logGroupActivity(group._id, requester.id, group_constants_1.GROUP_ACTIVITY_ACTION.OWNERSHIP_TRANSFERRED, {
        targetType: "user",
        targetId: targetUserId,
        metadata: { previousOwner: requester.id, newOwner: targetUserId },
    });
    yield notification_service_1.NotificationService.createNotificationIntoDB({
        recipient: targetUserId,
        actor: requester.id,
        type: "group.ownership_transferred",
        title: `You are now the owner of ${group.name}`,
        link: `/groups/${group.slug}/settings`,
        entityType: "group",
        entityId: String(group._id),
        groupId: String(group._id),
    });
    return { owner: targetUserId };
});
const removeMemberIntoDB = (groupIdOrSlug_1, targetUserId_1, requester_1, ...args_1) => __awaiter(void 0, [groupIdOrSlug_1, targetUserId_1, requester_1, ...args_1], void 0, function* (groupIdOrSlug, targetUserId, requester, opts = {}) {
    var _a;
    const { group, membership } = yield group_permissions_1.GroupPermissionService.authorize(groupIdOrSlug, requester, "group:manageMembers");
    if (targetUserId === requester.id) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Use the leave-group action for yourself");
    }
    if (targetUserId === String(group.owner)) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "The owner cannot be removed");
    }
    const target = yield groupMembership_model_1.GroupMembership.findOne({
        group: group._id,
        user: targetUserId,
    });
    if (!target || target.status === group_constants_1.GROUP_MEMBERSHIP_STATUS.NONE) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Member not found in this group");
    }
    // Admins may not remove other admins — only the owner can.
    const targetRole = target.role;
    const actorRole = (_a = membership === null || membership === void 0 ? void 0 : membership.role) !== null && _a !== void 0 ? _a : group_constants_1.GROUP_ROLE.ADMIN;
    if (targetRole === group_constants_1.GROUP_ROLE.ADMIN &&
        actorRole !== group_constants_1.GROUP_ROLE.OWNER &&
        String(group.owner) !== requester.id) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Only the owner can remove an admin");
    }
    if (targetRole === group_constants_1.GROUP_ROLE.OWNER) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "The owner cannot be removed");
    }
    const wasApproved = target.status === group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED;
    const wasPending = target.status === group_constants_1.GROUP_MEMBERSHIP_STATUS.PENDING;
    target.status = opts.ban
        ? group_constants_1.GROUP_MEMBERSHIP_STATUS.BANNED
        : group_constants_1.GROUP_MEMBERSHIP_STATUS.REMOVED;
    target.bannedBy = opts.ban ? new mongoose_1.Types.ObjectId(requester.id) : null;
    target.bannedAt = opts.ban ? new Date() : null;
    if (wasApproved)
        target.joinedAt = null;
    yield target.save({ validateBeforeSave: false });
    const inc = {};
    if (wasApproved)
        inc.memberCount = -1;
    if (wasPending)
        inc.pendingCount = -1;
    if (Object.keys(inc).length)
        yield group_model_1.Group.updateOne({ _id: group._id }, { $inc: inc });
    if (wasApproved)
        yield syncChatMembership(group, targetUserId, "remove");
    if (opts.ban) {
        yield group_model_1.Group.updateOne({ _id: group._id }, { $addToSet: { bannedUsers: new mongoose_1.Types.ObjectId(targetUserId) } });
    }
    yield logGroupActivity(group._id, requester.id, opts.ban ? group_constants_1.GROUP_ACTIVITY_ACTION.MEMBER_BANNED : group_constants_1.GROUP_ACTIVITY_ACTION.MEMBER_REMOVED, { targetType: "user", targetId: targetUserId });
    yield notification_service_1.NotificationService.createNotificationIntoDB({
        recipient: targetUserId,
        actor: requester.id,
        type: opts.ban ? "group.banned" : "group.removed",
        title: opts.ban
            ? `You were banned from ${group.name}`
            : `Your membership in ${group.name} ended`,
        body: opts.ban ? undefined : "You are no longer a member of this group.",
        link: `/groups/${group.slug}`,
        entityType: "group",
        entityId: String(group._id),
        groupId: String(group._id),
    });
});
const unbanMemberIntoDB = (groupIdOrSlug, targetUserId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const { group } = yield group_permissions_1.GroupPermissionService.authorize(groupIdOrSlug, requester, "group:manageMembers");
    const target = yield groupMembership_model_1.GroupMembership.findOne({ group: group._id, user: targetUserId });
    if (!target || target.status !== group_constants_1.GROUP_MEMBERSHIP_STATUS.BANNED) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "No banned member found");
    }
    target.status = group_constants_1.GROUP_MEMBERSHIP_STATUS.LEFT;
    target.bannedBy = null;
    target.bannedAt = null;
    yield target.save({ validateBeforeSave: false });
    yield group_model_1.Group.updateOne({ _id: group._id }, { $pull: { bannedUsers: new mongoose_1.Types.ObjectId(targetUserId) } });
    yield logGroupActivity(group._id, requester.id, group_constants_1.GROUP_ACTIVITY_ACTION.MEMBER_UNBANNED, {
        targetType: "user",
        targetId: targetUserId,
    });
});
/* ------------------------------------------------------------------ */
/* Invites                                                             */
/* ------------------------------------------------------------------ */
const createInviteIntoDB = (groupIdOrSlug, payload, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const { group } = yield group_permissions_1.GroupPermissionService.authorize(groupIdOrSlug, requester, "group:manageInvites");
    let expiresAt = null;
    if (payload.expiresAt) {
        const parsed = new Date(String(payload.expiresAt));
        if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Expiry must be a future date");
        }
        expiresAt = parsed;
    }
    let maxUses = null;
    if (payload.maxUses !== undefined && payload.maxUses !== null) {
        const parsed = Number(payload.maxUses);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10000) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Max uses must be between 1 and 10000");
        }
        maxUses = Math.floor(parsed);
    }
    const token = (0, groupInvite_model_1.generateInviteToken)();
    const invite = yield groupInvite_model_1.GroupInvite.create({
        group: group._id,
        tokenHash: (0, groupInvite_model_1.hashInviteToken)(token),
        createdBy: new mongoose_1.Types.ObjectId(requester.id),
        label: payload.label ? String(payload.label) : null,
        maxUses,
        requiresApproval: payload.requiresApproval === true ||
            group.joinPolicy === group_constants_1.GROUP_JOIN_POLICY.REQUEST,
        expiresAt,
    });
    yield logGroupActivity(group._id, requester.id, group_constants_1.GROUP_ACTIVITY_ACTION.INVITE_CREATED, {
        targetType: "invite",
        targetId: String(invite._id),
    });
    // Raw token returned exactly once — only its hash is persisted.
    return { invite, token };
});
const listInvitesFromDB = (groupIdOrSlug, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const { group } = yield group_permissions_1.GroupPermissionService.authorize(groupIdOrSlug, requester, "group:manageInvites");
    return groupInvite_model_1.GroupInvite.find({ group: group._id }).sort({ createdAt: -1 });
});
const revokeInviteIntoDB = (groupIdOrSlug, inviteId, requester) => __awaiter(void 0, void 0, void 0, function* () {
    const { group } = yield group_permissions_1.GroupPermissionService.authorize(groupIdOrSlug, requester, "group:manageInvites");
    const invite = yield groupInvite_model_1.GroupInvite.findOne({ _id: inviteId, group: group._id });
    if (!invite)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Invite not found");
    invite.status = group_constants_1.GROUP_INVITE_STATUS.REVOKED;
    invite.revokedAt = new Date();
    invite.revokedBy = new mongoose_1.Types.ObjectId(requester.id);
    yield invite.save({ validateBeforeSave: false });
    yield logGroupActivity(group._id, requester.id, group_constants_1.GROUP_ACTIVITY_ACTION.INVITE_REVOKED, {
        targetType: "invite",
        targetId: String(invite._id),
    });
    return invite;
});
const inviteState = (invite, group) => {
    if (group.isDeleted)
        return "GROUP_UNAVAILABLE";
    if (invite.status === group_constants_1.GROUP_INVITE_STATUS.REVOKED)
        return "REVOKED";
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now())
        return "EXPIRED";
    if (invite.maxUses != null && invite.usedCount >= invite.maxUses)
        return "EXHAUSTED";
    if (invite.status !== group_constants_1.GROUP_INVITE_STATUS.ACTIVE)
        return "REVOKED";
    return "VALID";
};
/**
 * Public preview for the branded invite landing page. Deliberately exposes
 * only the group fields that are intentionally public (name, description,
 * category, cover, member count) — never members, posts, or conversations.
 */
const previewInvite = (token) => __awaiter(void 0, void 0, void 0, function* () {
    if (typeof token !== "string" || token.length < 20 || token.length > 100) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Invitation not found");
    }
    const invite = yield groupInvite_model_1.GroupInvite.findOne({
        tokenHash: (0, groupInvite_model_1.hashInviteToken)(token),
    }).populate("group", "name slug description category visibility image coverImage memberCount joinPolicy isDeleted");
    if (!invite || !invite.group) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Invitation not found");
    }
    const group = invite.group;
    const state = inviteState(invite, group);
    return {
        state,
        requiresApproval: invite.requiresApproval || group.joinPolicy === group_constants_1.GROUP_JOIN_POLICY.REQUEST,
        group: {
            name: group.name,
            slug: group.slug,
            description: group.description,
            category: group.category,
            visibility: group.visibility,
            image: group.image,
            coverImage: group.coverImage,
            memberCount: group.memberCount,
        },
    };
});
const redeemInviteIntoDB = (token, requester) => __awaiter(void 0, void 0, void 0, function* () {
    if (typeof token !== "string" || token.length < 20 || token.length > 100) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Invitation not found");
    }
    const tokenHash = (0, groupInvite_model_1.hashInviteToken)(token);
    // Atomically reserve one use, with status/expiry/limit enforced inside
    // the filter so concurrent redemptions of the last use cannot both win.
    const invite = yield groupInvite_model_1.GroupInvite.findOneAndUpdate({
        tokenHash,
        status: group_constants_1.GROUP_INVITE_STATUS.ACTIVE,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        $expr: {
            $or: [{ $eq: ["$maxUses", null] }, { $lt: ["$usedCount", "$maxUses"] }],
        },
    }, { $inc: { usedCount: 1 } }, { new: true }).populate("group");
    if (!invite || !invite.group) {
        const anyInvite = yield groupInvite_model_1.GroupInvite.findOne({ tokenHash });
        if (!anyInvite)
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Invitation not found");
        const groupDoc = yield group_model_1.Group.findById(anyInvite.group);
        if (groupDoc) {
            const state = inviteState(anyInvite, groupDoc);
            if (state === "EXHAUSTED") {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "This invitation has been fully used");
            }
            if (state === "EXPIRED") {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "This invitation has expired");
            }
            if (state === "REVOKED") {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "This invitation is no longer valid");
            }
        }
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "This invitation is no longer valid");
    }
    const group = invite.group;
    try {
        if (group.isDeleted) {
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Group not found");
        }
        const existing = yield groupMembership_model_1.GroupMembership.findOne({
            group: group._id,
            user: requester.id,
        });
        if ((existing === null || existing === void 0 ? void 0 : existing.status) === group_constants_1.GROUP_MEMBERSHIP_STATUS.BANNED) {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, "You are banned from this group");
        }
        if ((existing === null || existing === void 0 ? void 0 : existing.status) === group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED) {
            // Already a member: release the reservation so re-redeeming does not
            // burn another use of a limited invite.
            yield groupInvite_model_1.GroupInvite.updateOne({ _id: invite._id }, { $inc: { usedCount: -1 } });
            return { status: group_constants_1.GROUP_MEMBERSHIP_STATUS.APPROVED, slug: group.slug };
        }
        const outcome = yield resolveMembershipOutcome(group, requester.id, invite.requiresApproval, true);
        yield logGroupActivity(group._id, requester.id, group_constants_1.GROUP_ACTIVITY_ACTION.INVITE_REDEEMED, {
            targetType: "invite",
            targetId: String(invite._id),
        });
        return { status: outcome.status, slug: group.slug };
    }
    catch (err) {
        // Refund the reserved use when redemption failed after reservation.
        yield groupInvite_model_1.GroupInvite.updateOne({ _id: invite._id }, { $inc: { usedCount: -1 } });
        throw err;
    }
});
/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */
const getAuditLogFromDB = (groupIdOrSlug, query, requester) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { group } = yield group_permissions_1.GroupPermissionService.authorize(groupIdOrSlug, requester, "group:viewAuditLog");
    const page = Math.max(1, parseInt(String((_a = query.page) !== null && _a !== void 0 ? _a : "1"), 10) || 1);
    const limit = Math.min(100, parseInt(String((_b = query.limit) !== null && _b !== void 0 ? _b : "20"), 10) || 20);
    const filter = { group: group._id };
    if (query.action)
        filter.action = query.action;
    const [items, total] = yield Promise.all([
        groupActivityLog_model_1.GroupActivityLog.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("actor", "name image"),
        groupActivityLog_model_1.GroupActivityLog.countDocuments(filter),
    ]);
    return {
        result: items,
        meta: { page, limit, total, totalPage: Math.ceil(total / limit) || 1 },
    };
});
exports.GroupService = {
    createGroupIntoDB,
    getSingleGroupFromDB,
    getAllGroupsFromDB,
    updateGroupIntoDB,
    deleteGroupFromDB,
    joinGroupIntoDB,
    leaveGroupIntoDB,
    reviewJoinRequestIntoDB,
    listMembersFromDB,
    changeMemberRoleIntoDB,
    transferOwnershipIntoDB,
    removeMemberIntoDB,
    unbanMemberIntoDB,
    getOrCreateGroupConversation,
    createInviteIntoDB,
    listInvitesFromDB,
    revokeInviteIntoDB,
    previewInvite,
    redeemInviteIntoDB,
    getAuditLogFromDB,
    syncChatMembership,
    staffIdsOf,
};
