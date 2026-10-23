import type { Server as SocketIoServer } from "socket.io";

// Services emit real-time events through this registry so that business
// logic never needs a reference to the HTTP server. Registered once from
// server.ts right after socketServer(server) runs.
let io: SocketIoServer | null = null;

export const registerSocketServer = (server: SocketIoServer): void => {
  io = server;
};

export const getSocketServer = (): SocketIoServer | null => io;

/** Emit an event to a single user's personal room (room === userId). */
export const emitToUser = (userId: string, event: string, payload: unknown): void => {
  if (!io) return;
  io.to(userId).emit(event, payload);
};

/**
 * Force-leave: evicts every connected socket of a user from a room after a
 * membership change (removed/banned/left group member). Live re-checks on
 * later events still apply; this removes stale subscriptions promptly.
 */
export const removeUserFromRoom = (userId: string, roomId: string): void => {
  if (!io) return;
  for (const [, socket] of io.of("/").sockets) {
    if (socket.data.userId === userId) {
      socket.leave(roomId);
    }
  }
};

export const emitToUsers = (
  userIds: string[],
  event: string,
  payload: unknown,
): void => {
  if (!io) return;
  for (const id of userIds) {
    io.to(id).emit(event, payload);
  }
};
