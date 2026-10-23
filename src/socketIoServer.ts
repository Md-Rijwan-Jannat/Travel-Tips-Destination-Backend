import { Server as HttpServer } from "http";
import { Server as SocketIoServer, Socket } from "socket.io";
import { Types } from "mongoose";
import config from "./config";
import { verifyToken } from "./app/utils/tokenGenerateFunction";
import { Chat } from "./app/module/Chat/chat.model";
import { Message } from "./app/module/Messages/message.model";
import { CallServices } from "./app/module/Call/call.service";
import { CALL_MEDIA_TYPE, CALL_STATUS } from "./app/module/Call/call.interface";
import AppError from "./app/errors/AppError";

interface ConnectedUser {
  socketId: string;
  userId: string;
}

const isValidObjectIdString = (value: unknown): value is string =>
  typeof value === "string" && Types.ObjectId.isValid(value);

const extractId = (value: unknown): string | undefined => {
  if (isValidObjectIdString(value)) return value;
  if (typeof value === "object" && value !== null) {
    const id = (value as { _id?: unknown })._id;
    if (isValidObjectIdString(id)) return id;
  }
  return undefined;
};

/** Id of a populated ref or a raw ObjectId, as a string. */
const refId = (value: unknown): string =>
  String((value as { _id?: unknown })?._id ?? value);

export const socketServer = (server: HttpServer): SocketIoServer => {
  const io = new SocketIoServer(server, {
    pingTimeout: 60000,
    cors: {
      origin: [
        "http://localhost:3000",
        "https://traveltipsdestinationcommunity.vercel.app",
      ],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Handshake authentication: every socket must present a valid access token.
  // Identity for every later event comes from this verified token — never
  // from client-sent payloads (which previously allowed any anonymous
  // client to `setup` into any user's room and eavesdrop).
  io.use((socket, next) => {
    const raw: unknown =
      socket.handshake.auth?.token ?? socket.handshake.headers?.authorization;

    if (typeof raw !== "string" || raw.length === 0) {
      return next(new Error("Authentication required"));
    }

    const token = raw.startsWith("Bearer ") ? raw.slice(7) : raw;

    try {
      const decoded = verifyToken(token, config.jwt_access_secret as string);
      const userId = typeof decoded.id === "string" ? decoded.id : undefined;

      if (!userId || !Types.ObjectId.isValid(userId)) {
        return next(new Error("Authentication failed"));
      }

      socket.data.userId = userId;
      return next();
    } catch {
      return next(new Error("Authentication failed"));
    }
  });

  const connectedUsers: ConnectedUser[] = [];

  const broadcastOnlineUsers = (): void => {
    // Deduplicated: one entry per user id even with multiple sockets.
    io.emit("online users", [
      ...new Set(connectedUsers.map((user) => user.userId)),
    ]);
  };

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;

    // Register presence when the client signals readiness. The payload is
    // intentionally ignored — the room is always the verified identity.
    socket.on("setup", () => {
      if (!connectedUsers.some((user) => user.socketId === socket.id)) {
        connectedUsers.push({ socketId: socket.id, userId });
      }

      socket.join(userId);
      socket.emit("connected");
      broadcastOnlineUsers();
    });

    // Allow clients to explicitly ask for the presence list.
    socket.on("get online users", () => {
      socket.emit("online users", [
        ...new Set(connectedUsers.map((user) => user.userId)),
      ]);
    });

    // Join a chat room only after verifying membership in the database —
    // any user can no longer eavesdrop on arbitrary conversations.
    socket.on("join chat", async (room: unknown) => {
      if (!isValidObjectIdString(room)) {
        return;
      }

      try {
        const isMember = await Chat.exists({ _id: room, users: userId });

        if (!isMember) {
          socket.emit("unauthorized", room);
          return;
        }

        socket.join(room);
      } catch {
        socket.emit("unauthorized", room);
      }
    });

    // Typing indicators may only be broadcast into rooms this socket has
    // been authorized to join (no DB hit per keystroke).
    socket.on("typing", (room: unknown) => {
      if (!isValidObjectIdString(room) || !socket.rooms.has(room)) {
        return;
      }
      socket.in(room).emit("typing");
    });

    socket.on("stop typing", (room: unknown) => {
      if (!isValidObjectIdString(room) || !socket.rooms.has(room)) {
        return;
      }
      socket.in(room).emit("stop typing");
    });

    // Per-socket message rate limit (abuse/spam protection on the
    // real-time channel). Sliding 60s window, generous for humans.
    let messageTimestamps: number[] = [];

    const withinMessageBudget = (): boolean => {
      const now = Date.now();
      messageTimestamps = messageTimestamps.filter((t) => now - t < 60_000);
      if (messageTimestamps.length >= 60) return false;
      messageTimestamps.push(now);
      return true;
    };

    // Deliver a message notification only to the REAL chat members from the
    // database, and only when the authenticated sender is that member — the
    // client-supplied `chat.users` list is never trusted for routing, the
    // payload's sender cannot be spoofed, and view-once media URLs are
    // stripped from the relayed copy (recipients must consume them through
    // the one-shot REST endpoint).
    socket.on("new message", async (newMessageReceived: unknown) => {
      if (typeof newMessageReceived !== "object" || newMessageReceived === null) {
        return;
      }

      const message = newMessageReceived as {
        chat?: unknown;
        sender?: unknown;
        content?: unknown;
        messageType?: unknown;
        mediaUrl?: unknown;
        mediaMeta?: unknown;
        location?: unknown;
        replyTo?: unknown;
      };

      const chatId = extractId(message.chat);
      const senderId = extractId(message.sender);

      if (!chatId || !senderId || senderId !== userId) {
        return;
      }

      const messageType =
        typeof message.messageType === "string" &&
        ["TEXT", "IMAGE", "VOICE", "LOCATION", "EMOJI", "VIEW_ONCE_IMAGE", "LIVE_LOCATION"].includes(
          message.messageType,
        )
          ? message.messageType
          : "TEXT";

      const content = typeof message.content === "string" ? message.content : "";
      if (content.length > 5000) {
        return;
      }

      // Per-type minimum payload (creation itself was validated on REST).
      const hasMedia = typeof message.mediaUrl === "string" && message.mediaUrl.startsWith("https://");
      const hasLocation =
        typeof message.location === "object" &&
        message.location !== null &&
        typeof (message.location as { lat?: unknown }).lat === "number";
      if (messageType === "TEXT" && content.trim().length === 0) {
        return;
      }
      if (
        (messageType === "IMAGE" ||
          messageType === "VOICE" ||
          messageType === "VIEW_ONCE_IMAGE") &&
        !hasMedia
      ) {
        return;
      }
      if (messageType === "LOCATION" || messageType === "LIVE_LOCATION") {
        if (!hasLocation) return;
        // Live shares are tracked by their id — without it recipients could
        // never receive position patches.
        if (
          messageType === "LIVE_LOCATION" &&
          !extractId((newMessageReceived as { _id?: unknown })._id)
        ) {
          return;
        }
      }

      if (!withinMessageBudget()) {
        socket.emit("rate limited", { chat: chatId });
        return;
      }

      try {
        const chat = await Chat.findById(chatId).select("users").lean();

        if (!chat) {
          return;
        }

        const members = (chat.users ?? []).map((member) => String(member));

        if (!members.includes(userId)) {
          return;
        }

        // Reply preview: re-read the parent from the database (never trust a
        // client-supplied preview) and only expose the safe projection.
        let replyTo: Record<string, unknown> | null = null;
        const replyToId = extractId(message.replyTo);
        if (replyToId) {
          const parent = await Message.findById(replyToId)
            .select("chat content messageType isDeleted sender")
            .populate("sender", "name image")
            .lean();
          if (parent && String(parent.chat) === chatId) {
            const sender = parent.sender as unknown as {
              _id?: unknown;
              name?: string;
              image?: string;
            };
            replyTo = {
              _id: replyToId,
              sender: {
                _id: String(sender?._id ?? ""),
                name: typeof sender?.name === "string" ? sender.name : "",
                image: typeof sender?.image === "string" ? sender.image : null,
              },
              content: parent.isDeleted
                ? ""
                : typeof parent.content === "string"
                  ? parent.content.slice(0, 300)
                  : "",
              messageType: parent.messageType ?? "TEXT",
              isDeleted: Boolean(parent.isDeleted),
            };
          }
        }

        // LIVE_LOCATION expiry is server-set — re-read it from the database
        // instead of trusting anything the client relays.
        let liveLocation: { expiresAt: string } | null = null;
        if (messageType === "LIVE_LOCATION") {
          const doc = await Message.findById(
            extractId((newMessageReceived as { _id?: unknown })._id),
          )
            .select("liveLocation")
            .lean();
          if (doc?.liveLocation?.expiresAt) {
            liveLocation = {
              expiresAt: doc.liveLocation.expiresAt.toISOString(),
            };
          } else {
            return; // session unknown or already expired
          }
        }

        // Normalized relay: sender forced to the verified identity, and the
        // view-once media URL never travels over the broadcast channel.
        const relayPayload = {
          _id: extractId((newMessageReceived as { _id?: unknown })._id),
          chat: chatId,
          sender: userId,
          messageType,
          content,
          mediaUrl: messageType === "VIEW_ONCE_IMAGE" ? null : hasMedia ? message.mediaUrl : null,
          mediaMeta:
            messageType === "VOICE" || messageType === "IMAGE" ? message.mediaMeta ?? null : null,
          location:
            messageType === "LOCATION" || messageType === "LIVE_LOCATION"
              ? message.location
              : null,
          liveLocation,
          replyTo,
          createdAt: (newMessageReceived as { createdAt?: unknown }).createdAt ?? new Date().toISOString(),
        };

        for (const member of members) {
          if (member === userId) {
            continue;
          }
          io.to(member).emit("message received", relayPayload);
        }
      } catch {
        // Malformed id or DB error → drop the event.
      }
    });

    // ---------------------------------------------------------------------
    // Live location sharing: the sharer streams throttled position patches
    // into the chat room; only the message owner can update/stop, only while
    // the server-set session window is still open.
    // ---------------------------------------------------------------------
    let liveLocationTimestamps: number[] = [];
    const withinLiveLocationBudget = (): boolean => {
      const now = Date.now();
      liveLocationTimestamps = liveLocationTimestamps.filter((t) => now - t < 60_000);
      if (liveLocationTimestamps.length >= 60) return false;
      liveLocationTimestamps.push(now);
      return true;
    };

    const normalizeLiveLocation = (
      raw: unknown,
    ): { lat: number; lng: number; label?: string } | null => {
      if (typeof raw !== "object" || raw === null) return null;
      const loc = raw as { lat?: unknown; lng?: unknown; label?: unknown };
      if (typeof loc.lat !== "number" || typeof loc.lng !== "number") return null;
      if (loc.lat < -90 || loc.lat > 90 || loc.lng < -180 || loc.lng > 180) return null;
      return {
        lat: loc.lat,
        lng: loc.lng,
        label: typeof loc.label === "string" ? loc.label.slice(0, 200) : undefined,
      };
    };

    const liveShareTarget = (payload: unknown): {
      messageId: string;
      chatId: string;
    } | null => {
      if (typeof payload !== "object" || payload === null) return null;
      const p = payload as { messageId?: unknown; chat?: unknown };
      const messageId = extractId(p.messageId);
      const chatId = extractId(p.chat);
      if (!messageId || !chatId) return null;
      // Room membership was DB-verified when the client joined the chat room.
      if (!socket.rooms.has(chatId)) return null;
      return { messageId, chatId };
    };

    socket.on("live:update", async (payload: unknown) => {
      const target = liveShareTarget(payload);
      if (!target || !withinLiveLocationBudget()) return;
      const location = normalizeLiveLocation(
        (payload as { location?: unknown }).location,
      );
      if (!location) return;

      try {
        const updated = await Message.updateOne(
          {
            _id: target.messageId,
            chat: target.chatId,
            sender: userId,
            messageType: "LIVE_LOCATION",
            isDeleted: false,
            "liveLocation.expiresAt": { $gt: new Date() },
          },
          { $set: { location } },
        );
        if (updated.modifiedCount !== 1) return;
        socket
          .to(target.chatId)
          .emit("live:position", {
            messageId: target.messageId,
            chat: target.chatId,
            location,
          });
      } catch {
        // Malformed id or DB error → drop the event.
      }
    });

    socket.on("live:stop", async (payload: unknown) => {
      const target = liveShareTarget(payload);
      if (!target) return;

      try {
        const stopped = await Message.updateOne(
          {
            _id: target.messageId,
            chat: target.chatId,
            sender: userId,
            messageType: "LIVE_LOCATION",
            isDeleted: false,
            "liveLocation.expiresAt": { $gt: new Date() },
          },
          { $set: { "liveLocation.expiresAt": new Date(0) } },
        );
        if (stopped.modifiedCount !== 1) return;
        socket.to(target.chatId).emit("live:ended", {
          messageId: target.messageId,
          chat: target.chatId,
        });
      } catch {
        // Malformed id or DB error → drop the event.
      }
    });

    // ---------------------------------------------------------------------
    // WebRTC call signaling. Every transition and every relayed SDP/ICE
    // payload re-checks call participation in the database — the identity
    // always comes from the verified handshake token.
    // ---------------------------------------------------------------------

    // Per-socket call-invite budget (spam protection on the realtime channel).
    let callInviteTimestamps: number[] = [];
    const withinCallInviteBudget = (): boolean => {
      const now = Date.now();
      callInviteTimestamps = callInviteTimestamps.filter((t) => now - t < 5 * 60_000);
      if (callInviteTimestamps.length >= 10) return false;
      callInviteTimestamps.push(now);
      return true;
    };

    const emitCallError = (message: string) => {
      socket.emit("call:error", { message });
    };

    /**
     * Group mesh join: room entry + roster hand-off (the joiner offers to
     * everyone already present) + stop the rings of the remaining invitees.
     * Used both when a member accepts and when they press "call" to join an
     * already-ACTIVE group call.
     */
    const emitGroupJoin = (
      call: {
        _id: unknown;
        chat: unknown;
        mediaType: string;
        participants?: unknown[];
      },
      userIdValue: string,
      chatUsers: unknown[],
    ) => {
      const callId = String(call._id);
      socket.join(`call:${callId}`);

      const participants = (call.participants ?? []).map((p) => refId(p));
      const chatId = refId(call.chat);

      socket.to(`call:${callId}`).emit("call:participant-joined", {
        callId,
        chatId,
        userId: userIdValue,
        mediaType: call.mediaType,
        participants,
      });

      socket.emit("call:joined", {
        callId,
        chatId,
        mediaType: call.mediaType,
        isGroupCall: true,
        participants,
      });

      // Stop the rings of invitees who have not joined yet.
      const members = chatUsers.map((u) => refId(u));
      for (const member of members) {
        if (member === userIdValue || participants.includes(member)) continue;
        io.to(member).emit("call:answered", { callId });
      }
    };

    socket.on("call:invite", async (payload: unknown) => {
      const body = payload as { chatId?: unknown; mediaType?: unknown };
      const chatId = extractId(body?.chatId);
      if (!chatId) {
        return emitCallError("Invalid chat");
      }
      if (!withinCallInviteBudget()) {
        return emitCallError("Too many call attempts, please try again later");
      }

      const mediaType =
        body?.mediaType === CALL_MEDIA_TYPE.VIDEO
          ? CALL_MEDIA_TYPE.VIDEO
          : CALL_MEDIA_TYPE.AUDIO;

      try {
        const call = await CallServices.inviteToCallFromDB(
          chatId,
          mediaType,
          { id: userId, role: "USER" },
        );
        const callId = String(call._id);
        socket.join(`call:${callId}`);

        const participants = (call.participants ?? []).map((p) => refId(p));
        const chatUsers =
          ((call.chat as unknown as { users?: unknown[] })?.users ?? []);
        socket.emit("call:outgoing", {
          callId,
          chatId,
          mediaType: call.mediaType,
          callee: call.callee ? refId(call.callee) : null,
          isGroupCall: Boolean(call.isGroupCall),
          participants,
          inviteeCount: Math.max(0, chatUsers.map((u) => refId(u)).length - 1),
        });

        if (call.isGroupCall) {
          // Group: ring every OTHER member of the conversation.
          const members = chatUsers.map((u) => refId(u));
          for (const member of members) {
            if (member === userId) continue;
            io.to(member).emit("call:incoming", {
              callId,
              chatId,
              mediaType: call.mediaType,
              caller: userId,
              isGroupCall: true,
            });
          }
        } else {
          io.to(refId(call.callee)).emit("call:incoming", {
            callId,
            chatId,
            mediaType: call.mediaType,
            caller: refId(call.caller),
          });
        }
      } catch (error) {
        // Group: pressing "call" while the conversation already has an ACTIVE
        // group call joins it instead of failing.
        if (error instanceof AppError && error.statusCode === 409) {
          try {
            const joined = await CallServices.joinActiveGroupCallFromDB(
              chatId,
              { id: userId, role: "USER" },
            );
            if (joined?.isGroupCall) {
              emitGroupJoin(
                joined,
                userId,
                ((joined.chat as unknown as { users?: unknown[] })?.users ?? []),
              );
              return;
            }
          } catch (inner) {
            emitCallError(
              inner instanceof AppError ? inner.message : "Unable to join call",
            );
            return;
          }
        }
        emitCallError(
          error instanceof AppError ? error.message : "Unable to start call",
        );
      }
    });

    socket.on("call:accept", async (payload: unknown) => {
      const callId = extractId((payload as { callId?: unknown })?.callId);
      if (!callId) return;

      try {
        const call = await CallServices.acceptCallFromDB(callId, {
          id: userId,
          role: "USER",
        });

        if (call.isGroupCall) {
          // Room entry, roster hand-off and ring cleanup in one place.
          emitGroupJoin(
            call,
            userId,
            ((call.chat as unknown as { users?: unknown[] })?.users ?? []),
          );
          return;
        }

        socket.join(`call:${callId}`);
        io.to(refId(call.caller)).emit("call:accepted", {
          callId,
          mediaType: call.mediaType,
        });
      } catch (error) {
        emitCallError(
          error instanceof AppError ? error.message : "Unable to accept call",
        );
      }
    });

    socket.on("call:reject", async (payload: unknown) => {
      const callId = extractId((payload as { callId?: unknown })?.callId);
      if (!callId) return;

      try {
        const call = await CallServices.rejectCallFromDB(callId, {
          id: userId,
          role: "USER",
        });

        if (call.isGroupCall) {
          // Personal decline: only the starter hears about it, the ring for
          // everyone else continues.
          io.to(refId(call.caller)).emit("call:declined", { callId, userId });
          return;
        }

        io.to(refId(call.caller)).emit("call:rejected", {
          callId,
        });
      } catch (error) {
        emitCallError(
          error instanceof AppError ? error.message : "Unable to reject call",
        );
      }
    });

    socket.on("call:end", async (payload: unknown) => {
      const callId = extractId((payload as { callId?: unknown })?.callId);
      if (!callId) return;

      try {
        const call = await CallServices.endCallFromDB(callId, {
          id: userId,
          role: "USER",
        });

        if (call.isGroupCall) {
          if (
            call.status === CALL_STATUS.ENDED ||
            call.status === CALL_STATUS.CANCELLED
          ) {
            // Ring cancelled or the last participant left → reset everyone.
            const members =
              ((call.chat as unknown as { users?: unknown[] })?.users ?? []).map(
                (u) => refId(u),
              );
            for (const member of members) {
              if (member === userId) continue;
              io.to(member).emit("call:ended", {
                callId,
                status: call.status,
                durationSeconds: call.durationSeconds,
              });
            }
          } else {
            // The requester left; the call continues for the rest.
            socket.to(`call:${callId}`).emit("call:participant-left", {
              callId,
              userId,
              participants: (call.participants ?? []).map((p) => refId(p)),
            });
          }
          return;
        }

        const other =
          refId(call.caller) === userId
            ? refId(call.callee)
            : refId(call.caller);
        io.to(other).emit("call:ended", {
          callId,
          status: call.status,
          durationSeconds: call.durationSeconds,
        });
      } catch (error) {
        emitCallError(
          error instanceof AppError ? error.message : "Unable to end call",
        );
      }
    });

    // SDP/ICE relay between participants of a live call only: pairs for DMs,
    // per-target inside the participant roster for mesh group calls.
    socket.on("call:signal", async (payload: unknown) => {
      const body = payload as {
        callId?: unknown;
        kind?: unknown;
        sdp?: unknown;
        candidate?: unknown;
        to?: unknown;
      };
      const callId = extractId(body?.callId);
      const kind = body?.kind;
      if (
        !callId ||
        (kind !== "offer" && kind !== "answer" && kind !== "candidate")
      ) {
        return;
      }

      // Size caps: an SDP blob or ICE candidate is small; anything larger is abuse.
      const sdp = typeof body.sdp === "string" && body.sdp.length <= 100_000 ? body.sdp : undefined;
      const candidate =
        typeof body.candidate === "string" && body.candidate.length <= 10_000
          ? body.candidate
          : undefined;
      if (kind !== "candidate" && sdp === undefined) {
        return;
      }

      try {
        const { caller, callee, isGroupCall, participants } =
          await CallServices.assertLiveCallParticipant(callId, userId);

        if (isGroupCall) {
          // Mesh: address one live participant of this call; roster enforced
          // so a member cannot aim signals at outsiders.
          const to = isValidObjectIdString(body.to) ? body.to : undefined;
          if (!to || to === userId || !participants.includes(to)) {
            return;
          }
          io.to(to).emit("call:signal", {
            callId,
            kind,
            sdp,
            candidate,
            from: userId,
            to,
          });
          return;
        }

        const target = caller === userId ? callee : caller;
        io.to(target).emit("call:signal", {
          callId,
          kind,
          sdp,
          candidate,
          from: userId,
        });
      } catch {
        // Inactive call or non-participant → drop the signal silently.
      }
    });

    socket.on("disconnect", () => {
      const index = connectedUsers.findIndex(
        (user) => user.socketId === socket.id,
      );

      if (index !== -1) {
        connectedUsers.splice(index, 1);
        broadcastOnlineUsers();
      }
    });
  });

  return io;
};
