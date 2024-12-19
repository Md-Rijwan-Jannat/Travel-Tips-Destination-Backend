"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketServer = void 0;
const socket_io_1 = require("socket.io");
const socketServer = (server) => {
    // Set up the Socket.IO server
    const io = new socket_io_1.Server(server, {
        pingTimeout: 60000,
        cors: {
            origin: [
                'http://localhost:3000',
                'https://traveltipsdestinationcommunity.vercel.app',
            ],
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });
    // Handle new socket connection
    io.on('connection', (socket) => {
        console.log('Connected to socket.io');
        // Setup user when connected
        socket.on('setup', (userData) => {
            if (userData && userData._id) {
                socket.join(userData._id);
                console.log('User ID:', userData._id);
                socket.emit('connected');
            }
            else {
                console.log('No user ID provided!');
            }
        });
        // Join user to a chat room
        socket.on('join chat', (room) => {
            socket.join(room); // Join the specified chat room
            console.log('User Joined Room:', room);
        });
        // Typing event
        socket.on('typing', (room) => {
            socket.in(room).emit('typing');
        });
        // Stop typing event
        socket.on('stop typing', (room) => {
            socket.in(room).emit('stop typing');
        });
        // Handle new message event
        socket.on('new message', (newMessageReceived) => {
            console.log('newMessageReceived', newMessageReceived);
            const chat = newMessageReceived.chat;
            if (!chat || !chat.users) {
                return console.log('chat.users not defined');
            }
            // Broadcast the message to all users in the chat, except the sender
            chat.users.forEach((user) => {
                if (user._id === newMessageReceived.sender._id)
                    return;
                socket.in(user._id).emit('message received', newMessageReceived);
            });
        });
        // Handle disconnect
        socket.on('disconnect', () => {
            console.log('USER DISCONNECTED');
        });
        // Handle setup cleanup (optional)
        socket.off('setup', () => {
            console.log('USER DISCONNECTED');
            socket.leave([...socket.rooms][0]);
        });
    });
};
exports.socketServer = socketServer;
