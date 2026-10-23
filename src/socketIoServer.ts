import { Server as HttpServer } from "http";
import { Server as SocketIoServer, Socket } from "socket.io";
import { Types } from "mongoose";
import config from "./config";
import { verifyToken } from "./app/utils/tokenGenerateFunction";
import { Chat } from "./app/module/Chat/chat.model";

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
    // client-supplied `chat.users` list is never trusted for routing, and the
    // payload's sender cannot be spoofed.
    socket.on("new message", async (newMessageReceived: unknown) => {
      if (typeof newMessageReceived !== "object" || newMessageReceived === null) {
        return;
      }

      const message = newMessageReceived as {
        chat?: unknown;
        sender?: unknown;
        content?: unknown;
      };

      const chatId = extractId(message.chat);
      const senderId = extractId(message.sender);

      if (!chatId || !senderId || senderId !== userId) {
        return;
      }

      // Validate payload: content must be a non-empty, bounded string.
      if (
        typeof message.content !== "string" ||
        message.content.trim().length === 0 ||
        message.content.length > 5000
      ) {
        return;
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

        for (const member of members) {
          if (member === userId) {
            continue;
          }
          io.to(member).emit("message received", newMessageReceived);
        }
      } catch {
        // Malformed id or DB error → drop the event.
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
