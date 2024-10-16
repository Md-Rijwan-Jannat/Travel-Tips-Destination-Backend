import { Server as HttpServer } from "http";
import { Server as SocketIoServer, Socket } from "socket.io";

export const socketServer = (server: HttpServer): void => {
  // Set up the Socket.IO server
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

  // Handle new socket connection
  io.on("connection", (socket: Socket) => {
    console.log("Connected to socket.io");

    // Setup user when connected
    socket.on("setup", (userData: any) => {
      if (userData && userData._id) {
        socket.join(userData._id);
        console.log("User ID:", userData._id);
        socket.emit("connected");
      } else {
        console.log("No user ID provided!");
      }
    });

    // Join user to a chat room
    socket.on("join chat", (room: string) => {
      socket.join(room); // Join the specified chat room
      console.log("User Joined Room:", room);
    });

    // Typing event
    socket.on("typing", (room: string) => {
      socket.in(room).emit("typing");
    });

    // Stop typing event
    socket.on("stop typing", (room: string) => {
      socket.in(room).emit("stop typing");
    });

    // Handle new message event
    socket.on("new message", (newMessageReceived: any) => {
      const chat = newMessageReceived.chat;

      if (!chat || !chat.users) {
        return console.log("chat.users not defined");
      }

      // Broadcast the message to all users in the chat, except the sender
      chat.users.forEach((user: any) => {
        if (user._id === newMessageReceived.sender._id) return; // Skip sender

        socket.in(user._id).emit("message received", newMessageReceived); // Emit message to other users in chat
      });
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log("USER DISCONNECTED");
      // Optional cleanup or session management can go here
    });

    // Handle setup cleanup (optional)
    socket.off("setup", () => {
      console.log("USER DISCONNECTED");
      socket.leave([...socket.rooms][0]); // Leave first joined room
    });
  });
};
