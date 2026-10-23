"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitToUsers = exports.removeUserFromRoom = exports.emitToUser = exports.getSocketServer = exports.registerSocketServer = void 0;
// Services emit real-time events through this registry so that business
// logic never needs a reference to the HTTP server. Registered once from
// server.ts right after socketServer(server) runs.
let io = null;
const registerSocketServer = (server) => {
    io = server;
};
exports.registerSocketServer = registerSocketServer;
const getSocketServer = () => io;
exports.getSocketServer = getSocketServer;
/** Emit an event to a single user's personal room (room === userId). */
const emitToUser = (userId, event, payload) => {
    if (!io)
        return;
    io.to(userId).emit(event, payload);
};
exports.emitToUser = emitToUser;
/**
 * Force-leave: evicts every connected socket of a user from a room after a
 * membership change (removed/banned/left group member). Live re-checks on
 * later events still apply; this removes stale subscriptions promptly.
 */
const removeUserFromRoom = (userId, roomId) => {
    if (!io)
        return;
    for (const [, socket] of io.of("/").sockets) {
        if (socket.data.userId === userId) {
            socket.leave(roomId);
        }
    }
};
exports.removeUserFromRoom = removeUserFromRoom;
const emitToUsers = (userIds, event, payload) => {
    if (!io)
        return;
    for (const id of userIds) {
        io.to(id).emit(event, payload);
    }
};
exports.emitToUsers = emitToUsers;
