import { createServer, Server as HttpServer } from "http";
import { AddressInfo } from "net";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { io as connectSocket, Socket as ClientSocket } from "socket.io-client";
import { Server as SocketIoServer } from "socket.io";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { socketServer } from "../socketIoServer";
import { User } from "../app/module/User/user.model";
import { Chat } from "../app/module/Chat/chat.model";
import { createToken } from "../app/utils/tokenGenerateFunction";

const TEST_SECRET = process.env.jwt_access_secret as string;

let mongod: MongoMemoryServer;
let httpServer: HttpServer;
let io: SocketIoServer;
let port: number;

let alice: any;
let bob: any;
let mallory: any; // authenticated non-member attacker
let chat1: any; // members: alice + bob

let aliceToken: string;
let bobToken: string;
let malloryToken: string;
let tamperedToken: string;
let wrongSecretToken: string;

const clients: ClientSocket[] = [];

const connectClient = (token?: string): Promise<ClientSocket> =>
  new Promise((resolve, reject) => {
    const socket = connectSocket(`http://127.0.0.1:${port}`, {
      auth: token ? { token } : {},
      reconnection: false,
      transports: ["websocket"],
      timeout: 3000,
    });
    clients.push(socket);

    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error("connection timeout"));
    }, 4000);

    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect_error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });

const waitForEvent = <T = unknown>(
  socket: ClientSocket,
  event: string,
  ms = 3000,
): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for "${event}"`));
    }, ms);
    const handler = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });

const expectNoEvent = async (
  socket: ClientSocket,
  event: string,
  ms = 600,
): Promise<void> => {
  await expect(waitForEvent(socket, event, ms)).rejects.toThrow(
    `timeout waiting for "${event}"`,
  );
};

const setupClient = async (
  token: string,
  hostileSetupPayload?: unknown,
): Promise<ClientSocket> => {
  const socket = await connectClient(token);
  const connected = waitForEvent(socket, "connected");
  socket.emit("setup", hostileSetupPayload);
  await connected;
  return socket;
};

const messagePayload = (senderId: string, chatId: string) => ({
  _id: new mongoose.Types.ObjectId().toString(),
  content: "hello",
  chat: { _id: chatId },
  sender: { _id: senderId, name: "Sender" },
});

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  await Promise.all([User.deleteMany({}), Chat.deleteMany({})]);

  alice = await User.create({
    name: "Alice",
    email: "alice-socket@example.com",
    password: "AlicePass123!",
  });
  bob = await User.create({
    name: "Bob",
    email: "bob-socket@example.com",
    password: "BobPass123!",
  });
  mallory = await User.create({
    name: "Mallory",
    email: "mallory-socket@example.com",
    password: "MalloryPass123!",
  });

  chat1 = await Chat.create({
    chatName: "Alice and Bob",
    user: alice._id,
    users: [alice._id, bob._id],
    isGroupChat: false,
  });

  aliceToken = createToken(
    { id: String(alice._id), email: alice.email, role: "USER" },
    TEST_SECRET,
    "1h",
  );
  bobToken = createToken(
    { id: String(bob._id), email: bob.email, role: "USER" },
    TEST_SECRET,
    "1h",
  );
  malloryToken = createToken(
    { id: String(mallory._id), email: mallory.email, role: "USER" },
    TEST_SECRET,
    "1h",
  );
  tamperedToken = `${aliceToken}x`;
  wrongSecretToken = createToken(
    { id: String(alice._id), email: alice.email, role: "USER" },
    "not-the-server-secret",
    "1h",
  );

  httpServer = createServer();
  io = socketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  port = (httpServer.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const socket of clients) {
    socket.disconnect();
  }
  clients.length = 0;
  // let the server process disconnects before the next test
  await new Promise((resolve) => setTimeout(resolve, 80));
});

afterAll(async () => {
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await mongoose.disconnect();
  await mongod?.stop();
});

describe("socket handshake authentication", () => {
  it("rejects a connection with no token", async () => {
    await expect(connectClient()).rejects.toThrow("Authentication required");
  });

  it("rejects a connection with a token signed by the wrong secret", async () => {
    await expect(connectClient(wrongSecretToken)).rejects.toThrow(
      "Authentication failed",
    );
  });

  it("rejects a tampered token", async () => {
    await expect(connectClient(tamperedToken)).rejects.toThrow(
      "Authentication failed",
    );
  });

  it("accepts a valid token, including a Bearer-prefixed one", async () => {
    const socket = await setupClient(`Bearer ${aliceToken}`);
    expect(socket.connected).toBe(true);
  });

  it("acknowledges setup with 'connected' and an online-users broadcast", async () => {
    const socket = await connectClient(aliceToken);
    // attach both waiters BEFORE emitting setup (server sends them together)
    const connected = waitForEvent(socket, "connected");
    const onlineWait = waitForEvent<string[]>(socket, "online users");
    socket.emit("setup");
    await connected;
    const online = await onlineWait;
    expect(online).toContain(String(alice._id));
    expect(new Set(online).size).toBe(online.length);
  });
});

describe("identity comes from the token, not the payload", () => {
  it("hostile setup payload cannot hijack another user's room", async () => {
    // mallory tries to join alice's room via the (now ignored) setup payload,
    // then a legit message is routed to alice's room — mallory must not see it.
    const mallorySocket = await setupClient(malloryToken, {
      _id: String(alice._id),
    });
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);

    const bobReceived = waitForEvent(bobSocket, "message received");
    const aliceNo = expectNoEvent(aliceSocket, "message received");
    const malloryNo = expectNoEvent(mallorySocket, "message received");

    aliceSocket.emit(
      "new message",
      messagePayload(String(alice._id), String(chat1._id)),
    );

    const payload: any = await bobReceived;
    expect(payload.content).toBe("hello");
    await aliceNo;
    await malloryNo;
  });

  it("a member cannot spoof the sender of a message", async () => {
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);

    const bobNo = expectNoEvent(bobSocket, "message received");

    // authenticated as alice, but claims bob as sender → rejected
    aliceSocket.emit(
      "new message",
      messagePayload(String(bob._id), String(chat1._id)),
    );

    await bobNo;
  });

  it("spoofed client-side chat.users cannot redirect delivery", async () => {
    const mallorySocket = await setupClient(malloryToken);
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);

    const bobReceived = waitForEvent(bobSocket, "message received");
    const malloryNo = expectNoEvent(mallorySocket, "message received");

    // alice claims the chat's users are [mallory] — the database says
    // [alice, bob], and only the database decides routing
    aliceSocket.emit("new message", {
      ...messagePayload(String(alice._id), String(chat1._id)),
      chat: { _id: String(chat1._id), users: [{ _id: String(mallory._id) }] },
    });

    const payload: any = await bobReceived;
    expect(payload.content).toBe("hello");
    await malloryNo;
  });

  it("a non-member cannot inject messages into a chat", async () => {
    const mallorySocket = await setupClient(malloryToken);
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);

    const aliceNo = expectNoEvent(aliceSocket, "message received");
    const bobNo = expectNoEvent(bobSocket, "message received");

    mallorySocket.emit(
      "new message",
      messagePayload(String(mallory._id), String(chat1._id)),
    );

    await aliceNo;
    await bobNo;
  });
});

describe("chat room join authorization", () => {
  it("a member can join and exchange typing indicators", async () => {
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);

    aliceSocket.emit("join chat", String(chat1._id));
    bobSocket.emit("join chat", String(chat1._id));
    await new Promise((resolve) => setTimeout(resolve, 200));

    const aliceTyping = waitForEvent(aliceSocket, "typing");
    bobSocket.emit("typing", String(chat1._id));

    await expect(aliceTyping).resolves.toBeUndefined();
  });

  it("a non-member cannot join a chat (unauthorized) and cannot hear typing", async () => {
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);
    const mallorySocket = await setupClient(malloryToken);

    // member joins succeed silently
    aliceSocket.emit("join chat", String(chat1._id));
    bobSocket.emit("join chat", String(chat1._id));
    // non-member join is refused
    const unauthorized = waitForEvent(mallorySocket, "unauthorized");
    mallorySocket.emit("join chat", String(chat1._id));
    await expect(unauthorized).resolves.toBe(String(chat1._id));

    await new Promise((resolve) => setTimeout(resolve, 200));

    const aliceTyping = waitForEvent(aliceSocket, "typing", 1500);
    const malloryTyping = expectNoEvent(mallorySocket, "typing");

    bobSocket.emit("typing", String(chat1._id));

    await expect(aliceTyping).resolves.toBeUndefined();
    await malloryTyping;
  });

  it("a non-member cannot emit typing into a chat they never joined", async () => {
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);
    const mallorySocket = await setupClient(malloryToken);

    aliceSocket.emit("join chat", String(chat1._id));
    await new Promise((resolve) => setTimeout(resolve, 200));

    const bobNo = expectNoEvent(bobSocket, "typing", 1000);

    // mallory is not in the room → the server must not forward this
    mallorySocket.emit("typing", String(chat1._id));

    await bobNo;
  });

  it("rejects non-objectId room names", async () => {
    const mallorySocket = await setupClient(malloryToken);
    const aliceSocket = await setupClient(aliceToken);

    const aliceNo = expectNoEvent(aliceSocket, "typing");

    mallorySocket.emit("join chat", "../../etc/passwd");
    await new Promise((resolve) => setTimeout(resolve, 150));
    mallorySocket.emit("typing", "../../etc/passwd");

    await aliceNo;
  });
});
