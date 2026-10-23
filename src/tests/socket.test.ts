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
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { socketServer } from "../socketIoServer";
import { User } from "../app/module/User/user.model";
import { Chat } from "../app/module/Chat/chat.model";
import { Call } from "../app/module/Call/call.model";
import { Message } from "../app/module/Messages/message.model";
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

describe("rich message relay", () => {
  it("relays a typed image message with the sender forced to the token identity", async () => {
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);

    const bobReceived = waitForEvent<any>(bobSocket, "message received");
    aliceSocket.emit("new message", {
      _id: new mongoose.Types.ObjectId().toString(),
      chat: { _id: String(chat1._id) },
      sender: { _id: String(alice._id) },
      messageType: "IMAGE",
      content: "caption",
      mediaUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    });

    const payload = await bobReceived;
    expect(payload.messageType).toBe("IMAGE");
    expect(payload.content).toBe("caption");
    expect(payload.sender).toBe(String(alice._id));
  });

  it("strips view-once media URLs from the broadcast relay", async () => {
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);

    const bobReceived = waitForEvent<any>(bobSocket, "message received");
    aliceSocket.emit("new message", {
      _id: new mongoose.Types.ObjectId().toString(),
      chat: { _id: String(chat1._id) },
      sender: { _id: String(alice._id) },
      messageType: "VIEW_ONCE_IMAGE",
      content: "",
      mediaUrl: "https://res.cloudinary.com/demo/image/upload/secret.jpg",
    });

    const payload = await bobReceived;
    expect(payload.messageType).toBe("VIEW_ONCE_IMAGE");
    expect(payload.mediaUrl).toBeNull();
  });

  it("drops typed messages missing their required media/location payload", async () => {
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);

    const bobNo = expectNoEvent(bobSocket, "message received", 800);

    // IMAGE without mediaUrl → dropped.
    aliceSocket.emit("new message", {
      _id: new mongoose.Types.ObjectId().toString(),
      chat: { _id: String(chat1._id) },
      sender: { _id: String(alice._id) },
      messageType: "IMAGE",
      content: "no media",
    });
    // LOCATION without coordinates → dropped.
    aliceSocket.emit("new message", {
      _id: new mongoose.Types.ObjectId().toString(),
      chat: { _id: String(chat1._id) },
      sender: { _id: String(alice._id) },
      messageType: "LOCATION",
      content: "",
    });

    await bobNo;
  });
});

describe("live location sharing", () => {
  beforeEach(async () => {
    await Message.deleteMany({});
  });

  const createLiveMessage = () =>
    Message.create({
      sender: alice._id,
      chat: chat1._id,
      messageType: "LIVE_LOCATION",
      content: "",
      location: { lat: 46.5, lng: 6.6, label: "Old spot" },
      liveLocation: { expiresAt: new Date(Date.now() + 10 * 60_000) },
      readBy: [alice._id],
    });

  const joinBoth = async () => {
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);
    aliceSocket.emit("join chat", String(chat1._id));
    bobSocket.emit("join chat", String(chat1._id));
    await new Promise((resolve) => setTimeout(resolve, 200));
    return { aliceSocket, bobSocket };
  };

  it("relays the sharer's position patches to room members", async () => {
    const liveMsg = await createLiveMessage();
    const { aliceSocket, bobSocket } = await joinBoth();

    const bobPosition = waitForEvent<{
      messageId: string;
      location: { lat: number; lng: number };
    }>(bobSocket, "live:position");
    aliceSocket.emit("live:update", {
      messageId: String(liveMsg._id),
      chat: String(chat1._id),
      location: { lat: 46.6, lng: 6.7 },
    });

    const payload = await bobPosition;
    expect(payload.messageId).toBe(String(liveMsg._id));
    expect(payload.location.lat).toBeCloseTo(46.6);

    const updated = await Message.findById(liveMsg._id).lean();
    expect(updated?.location?.lat).toBeCloseTo(46.6);
  });

  it("ignores position patches from anyone but the sharer", async () => {
    const liveMsg = await createLiveMessage();
    const { aliceSocket, bobSocket } = await joinBoth();

    const aliceNo = expectNoEvent(aliceSocket, "live:position", 800);
    bobSocket.emit("live:update", {
      messageId: String(liveMsg._id),
      chat: String(chat1._id),
      location: { lat: 10, lng: 10 },
    });
    await aliceNo;

    const updated = await Message.findById(liveMsg._id).lean();
    expect(updated?.location?.lat).toBeCloseTo(46.5);
  });

  it("rejects patches after the session window expires", async () => {
    const liveMsg = await createLiveMessage();
    await Message.updateOne(
      { _id: liveMsg._id },
      { $set: { "liveLocation.expiresAt": new Date(Date.now() - 1000) } },
    );
    const { aliceSocket, bobSocket } = await joinBoth();

    const bobNo = expectNoEvent(bobSocket, "live:position", 800);
    aliceSocket.emit("live:update", {
      messageId: String(liveMsg._id),
      chat: String(chat1._id),
      location: { lat: 47, lng: 7 },
    });
    await bobNo;

    const updated = await Message.findById(liveMsg._id).lean();
    expect(updated?.location?.lat).toBeCloseTo(46.5);
  });

  it("lets only the sharer stop the session early", async () => {
    const liveMsg = await createLiveMessage();
    const { aliceSocket, bobSocket } = await joinBoth();

    // A member who is not the sharer cannot stop someone else's share.
    const aliceNo = expectNoEvent(aliceSocket, "live:ended", 800);
    bobSocket.emit("live:stop", {
      messageId: String(liveMsg._id),
      chat: String(chat1._id),
    });
    await aliceNo;
    const stillLive = await Message.findById(liveMsg._id).lean();
    expect(stillLive?.liveLocation?.expiresAt.getTime()).toBeGreaterThan(
      Date.now(),
    );

    const bobEnded = waitForEvent(bobSocket, "live:ended");
    aliceSocket.emit("live:stop", {
      messageId: String(liveMsg._id),
      chat: String(chat1._id),
    });
    await bobEnded;

    // Once stopped, further patches are refused.
    const bobNo = expectNoEvent(bobSocket, "live:position", 800);
    aliceSocket.emit("live:update", {
      messageId: String(liveMsg._id),
      chat: String(chat1._id),
      location: { lat: 48, lng: 8 },
    });
    await bobNo;
  });
});

describe("WebRTC call signaling", () => {
  beforeEach(async () => {
    await Call.deleteMany({});
  });

  it("delivers call:outgoing to the caller and call:incoming to the callee", async () => {
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);

    const outgoing = waitForEvent<any>(aliceSocket, "call:outgoing");
    const incoming = waitForEvent<any>(bobSocket, "call:incoming");

    aliceSocket.emit("call:invite", {
      chatId: String(chat1._id),
      mediaType: "VIDEO",
    });

    const out = await outgoing;
    const inc = await incoming;
    expect(out.callId).toBeTruthy();
    expect(inc.callId).toBe(out.callId);
    expect(inc.caller).toBe(String(alice._id));
    expect(inc.mediaType).toBe("VIDEO");
    // Callee must never receive a call:error alongside a successful invite.
    expect(await Call.countDocuments({ status: "RINGING" })).toBe(1);
  });

  it("refuses invites from non-members with call:error", async () => {
    const mallorySocket = await setupClient(malloryToken);

    const error = waitForEvent<any>(mallorySocket, "call:error");
    mallorySocket.emit("call:invite", {
      chatId: String(chat1._id),
      mediaType: "AUDIO",
    });

    expect((await error).message).toBeTruthy();
    expect(await Call.countDocuments()).toBe(0);
  });

  it("runs accept → signal relay between the two participants only", async () => {
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);
    const mallorySocket = await setupClient(malloryToken);

    const outgoing = waitForEvent<any>(aliceSocket, "call:outgoing");
    const incoming = waitForEvent<any>(bobSocket, "call:incoming");
    aliceSocket.emit("call:invite", {
      chatId: String(chat1._id),
      mediaType: "AUDIO",
    });
    const { callId } = await outgoing;
    await incoming;

    const accepted = waitForEvent<any>(aliceSocket, "call:accepted");
    bobSocket.emit("call:accept", { callId });
    await expect(accepted).resolves.toMatchObject({ callId });

    // Caller's offer reaches the callee…
    const bobSignal = waitForEvent<any>(bobSocket, "call:signal");
    aliceSocket.emit("call:signal", {
      callId,
      kind: "offer",
      sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n",
    });
    const offer = await bobSignal;
    expect(offer.kind).toBe("offer");
    expect(offer.from).toBe(String(alice._id));

    // …the answer travels back…
    const aliceSignal = waitForEvent<any>(aliceSocket, "call:signal");
    bobSocket.emit("call:signal", {
      callId,
      kind: "answer",
      sdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n",
    });
    await expect(aliceSignal).resolves.toMatchObject({ kind: "answer" });

    // …but a stranger's signals are dropped silently.
    const bobNo = expectNoEvent(bobSocket, "call:signal", 700);
    mallorySocket.emit("call:signal", {
      callId,
      kind: "offer",
      sdp: "v=0\r\nmalicious\r\n",
    });
    await bobNo;
  });

  it("notifies the caller when the callee rejects", async () => {
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);

    const outgoing = waitForEvent<any>(aliceSocket, "call:outgoing");
    const incoming = waitForEvent<any>(bobSocket, "call:incoming");
    aliceSocket.emit("call:invite", {
      chatId: String(chat1._id),
      mediaType: "VIDEO",
    });
    const { callId } = await outgoing;
    await incoming;

    const rejected = waitForEvent<any>(aliceSocket, "call:rejected");
    bobSocket.emit("call:reject", { callId });
    await expect(rejected).resolves.toMatchObject({ callId });

    expect((await Call.findById(callId))!.status).toBe("REJECTED");
    // After rejection the chat is free for a new invite.
    expect(await Call.countDocuments({ status: { $in: ["RINGING", "ACTIVE"] } })).toBe(0);
  });

  it("delivers call:ended with the final status to the other side", async () => {
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);

    const outgoing = waitForEvent<any>(aliceSocket, "call:outgoing");
    const incoming = waitForEvent<any>(bobSocket, "call:incoming");
    aliceSocket.emit("call:invite", {
      chatId: String(chat1._id),
      mediaType: "AUDIO",
    });
    const { callId } = await outgoing;
    await incoming;

    const ended = waitForEvent<any>(bobSocket, "call:ended");
    aliceSocket.emit("call:end", { callId });
    const payload = await ended;
    expect(payload.callId).toBe(callId);
    expect(payload.status).toBe("CANCELLED");
  });
});

describe("group call signaling (mesh)", () => {
  let groupChat: any;

  beforeEach(async () => {
    await Call.deleteMany({});
    await Chat.deleteMany({});
    groupChat = await Chat.create({
      chatName: "Trio",
      users: [alice._id, bob._id, mallory._id],
      isGroupChat: true,
    });
    chat1 = await Chat.create({
      chatName: "Alice and Bob",
      users: [alice._id, bob._id],
      isGroupChat: false,
    });
  });

  it("invite rings every other member; accept yields the mesh roster", async () => {
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);
    const mallorySocket = await setupClient(malloryToken);

    const outgoing = waitForEvent<any>(aliceSocket, "call:outgoing");
    const bobIncoming = waitForEvent<any>(bobSocket, "call:incoming");
    const malloryIncoming = waitForEvent<any>(mallorySocket, "call:incoming");

    aliceSocket.emit("call:invite", {
      chatId: String(groupChat._id),
      mediaType: "VIDEO",
    });

    const out = await outgoing;
    expect(out.isGroupCall).toBe(true);
    expect(out.callee).toBeNull();
    expect(out.participants.map(String)).toEqual([String(alice._id)]);

    expect((await bobIncoming).isGroupCall).toBe(true);
    expect((await malloryIncoming).isGroupCall).toBe(true);

    // Bob joins: he gets the roster (he will open links to each member)…
    const joined = waitForEvent<any>(bobSocket, "call:joined");
    // …the starter learns that a participant entered the room…
    const participantJoined = waitForEvent<any>(aliceSocket, "call:participant-joined");
    // …and anyone still ringing learns the call was picked up.
    const answered = waitForEvent<any>(mallorySocket, "call:answered");

    bobSocket.emit("call:accept", { callId: out.callId });

    const roster = await joined;
    expect(roster.participants.map(String).sort()).toEqual(
      [String(alice._id), String(bob._id)].sort(),
    );
    expect((await participantJoined).userId).toBe(String(bob._id));
    expect((await answered).callId).toBe(out.callId);

    expect((await Call.findById(out.callId))!.status).toBe("ACTIVE");
  });

  it("routes signals only to live participants via the roster", async () => {
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);
    const mallorySocket = await setupClient(malloryToken);

    const outgoing = waitForEvent<any>(aliceSocket, "call:outgoing");
    const bobIncoming = waitForEvent<any>(bobSocket, "call:incoming");
    aliceSocket.emit("call:invite", {
      chatId: String(groupChat._id),
      mediaType: "AUDIO",
    });
    const { callId } = await outgoing;
    await bobIncoming;

    const joined = waitForEvent<any>(bobSocket, "call:joined");
    const participantJoined = waitForEvent<any>(aliceSocket, "call:participant-joined");
    bobSocket.emit("call:accept", { callId });
    await joined;
    await participantJoined;

    // Newcomer's offer reaches the addressed participant…
    const aliceSignal = waitForEvent<any>(aliceSocket, "call:signal");
    bobSocket.emit("call:signal", {
      callId,
      kind: "offer",
      sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n",
      to: String(alice._id),
    });
    const offer = await aliceSignal;
    expect(offer.from).toBe(String(bob._id));
    expect(offer.to).toBe(String(alice._id));

    // …signals aimed at a non-participant are dropped…
    const malloryNo = expectNoEvent(mallorySocket, "call:signal", 700);
    bobSocket.emit("call:signal", {
      callId,
      kind: "candidate",
      candidate: JSON.stringify({ candidate: "candidate:1 1 UDP 1 1.2.3.4 1 typ host" }),
      to: String(mallory._id),
    });
    await malloryNo;

    // …and a member who has not joined cannot signal at all.
    const aliceNo = expectNoEvent(aliceSocket, "call:signal", 700);
    mallorySocket.emit("call:signal", {
      callId,
      kind: "offer",
      sdp: "v=0\r\nmalicious\r\n",
      to: String(alice._id),
    });
    await aliceNo;
  });

  it("personal declines keep the ring; starter cancel resets everyone", async () => {
    const aliceSocket = await setupClient(aliceToken);
    const bobSocket = await setupClient(bobToken);
    const mallorySocket = await setupClient(malloryToken);

    const outgoing = waitForEvent<any>(aliceSocket, "call:outgoing");
    const bobIncoming = waitForEvent<any>(bobSocket, "call:incoming");
    const malloryIncoming = waitForEvent<any>(mallorySocket, "call:incoming");
    aliceSocket.emit("call:invite", {
      chatId: String(groupChat._id),
      mediaType: "AUDIO",
    });
    const { callId } = await outgoing;
    await bobIncoming;
    await malloryIncoming;

    // Mallory declines personally → only the starter hears about it.
    const declined = waitForEvent<any>(aliceSocket, "call:declined");
    mallorySocket.emit("call:reject", { callId });
    const decl = await declined;
    expect(decl.userId).toBe(String(mallory._id));
    expect((await Call.findById(callId))!.status).toBe("RINGING");

    // Bob hears the ring stop when the starter cancels.
    const bobEnded = waitForEvent<any>(bobSocket, "call:ended");
    const malloryEnded = waitForEvent<any>(mallorySocket, "call:ended");
    aliceSocket.emit("call:end", { callId });
    expect((await bobEnded).status).toBe("CANCELLED");
    expect((await malloryEnded).status).toBe("CANCELLED");
  });
});
