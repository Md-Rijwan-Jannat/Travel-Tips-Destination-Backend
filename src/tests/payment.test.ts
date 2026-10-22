import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Batch 4 (Payment hardening): the gateway itself must never be contacted in
// tests — utils are mocked; everything else (routes, Auth, validation, models,
// service logic) runs for real against an in-memory MongoDB.
vi.mock("../app/module/payment/payment.utils", () => ({
  initialPayment: vi.fn(),
  verifyPayment: vi.fn(),
}));

import globalErrorHandler from "../app/middlewares/globalErrorhandler";
import { PaymentRoutes } from "../app/module/payment/payment.routes";
import { User } from "../app/module/User/user.model";
import Payment from "../app/module/payment/payment.model";
import {
  initialPayment,
  verifyPayment,
} from "../app/module/payment/payment.utils";
import { createToken } from "../app/utils/tokenGenerateFunction";

const TEST_SECRET = process.env.jwt_access_secret as string;

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/payment", PaymentRoutes);
  app.use(globalErrorHandler);
  return app;
};

let mongod: MongoMemoryServer;
const app = buildApp();

let alice: any;
let bob: any;
let mallory: any; // authenticated attacker (not the payer)
let aliceToken: string;
let bobToken: string;
let malloryToken: string;

const validBody = {
  customerName: "Alice",
  customerEmail: "alice@example.com",
  customerAddress: "Somewhere",
  customerCountry: "BD",
  customerNumber: "N/A",
};

const initiate = (userId: string, token: string, body: object = validBody) =>
  request(app)
    .post(`/payment/subscriptions/${userId}`)
    .set("Authorization", token)
    .send(body);

const confirm = (
  userId: string,
  transitionId: string,
  status: string,
  method: "get" | "post" = "get",
) =>
  request(app)
    [method](
      `/payment/conformation/${userId}?transitionId=${encodeURIComponent(
        transitionId,
      )}&status=${status}`,
    )
    // Gateway redirect: deliberately unauthenticated (no Authorization header).
    .send();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  await Promise.all([User.deleteMany({}), Payment.deleteMany({})]);

  alice = await User.create({
    name: "Alice",
    email: "alice@example.com",
    password: "AlicePass123!",
  });
  bob = await User.create({
    name: "Bob",
    email: "bob@example.com",
    password: "BobPass123!",
  });
  mallory = await User.create({
    name: "Mallory",
    email: "mallory@example.com",
    password: "MalloryPass123!",
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
});

beforeEach(async () => {
  vi.mocked(initialPayment).mockReset();
  vi.mocked(initialPayment).mockResolvedValue({
    payment_url: "https://gateway.example/checkout",
  });
  vi.mocked(verifyPayment).mockReset();
  vi.mocked(verifyPayment).mockResolvedValue({ pay_status: "Successful" });

  await Payment.deleteMany({});
  await User.updateMany({}, { verified: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

describe("payment initiation hardening", () => {
  it("rejects anonymous initiation (401)", async () => {
    const res = await request(app)
      .post(`/payment/subscriptions/${String(alice._id)}`)
      .send(validBody);
    expect(res.status).toBe(401);
    expect(await Payment.countDocuments({})).toBe(0);
    expect(vi.mocked(initialPayment)).not.toHaveBeenCalled();
  });

  it("rejects initiating for another user's account (403)", async () => {
    const res = await initiate(String(bob._id), aliceToken);
    expect(res.status).toBe(403);
    expect(await Payment.countDocuments({})).toBe(0);
    expect(vi.mocked(initialPayment)).not.toHaveBeenCalled();
  });

  it("ignores client amount/status/user/transitionId and binds the record server-side", async () => {
    const res = await initiate(String(alice._id), aliceToken, {
      ...validBody,
      amount: 1, // hostile: pay 1 BDT
      status: "Paid", // hostile: pre-mark as paid
      user: String(bob._id), // hostile: bind someone else
      transitionId: "hacked-id", // hostile: choose the transaction id
    });
    expect(res.status).toBe(200);
    expect(res.body.data?.paymentResponse?.payment_url).toBe(
      "https://gateway.example/checkout",
    );

    const record = await Payment.findById(res.body.data.result._id);
    expect(record).toBeTruthy();
    expect(String(record!.user)).toBe(String(alice._id));
    expect(record!.amount).toBe(1000); // server price table, not client's 1
    expect(record!.status).toBe("Un-Paid");
    expect(record!.transitionId).not.toBe("hacked-id");

    // the gateway was instructed with the server-computed values
    expect(vi.mocked(initialPayment)).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1000,
        status: "Un-Paid",
        transitionId: record!.transitionId,
      }),
    );
    expect(String(vi.mocked(initialPayment).mock.calls[0][0].user)).toBe(
      String(alice._id),
    );
  });

  it("rejects an invalid customer email (400, validation wired)", async () => {
    const res = await initiate(String(alice._id), aliceToken, {
      ...validBody,
      customerEmail: "not-an-email",
    });
    expect(res.status).toBe(400);
    expect(await Payment.countDocuments({})).toBe(0);
  });

  it("stores no record when the gateway rejects initiation (400)", async () => {
    vi.mocked(initialPayment).mockRejectedValue(new Error("gateway down"));
    const res = await initiate(String(alice._id), aliceToken);
    expect(res.status).toBe(400);
    expect(await Payment.countDocuments({})).toBe(0);
  });
});

describe("payment confirmation hardening", () => {
  const startPaymentAndGetRecord = async (userId: string, token: string) => {
    const res = await initiate(userId, token);
    expect(res.status).toBe(200);
    const record = await Payment.findById(res.body.data.result._id);
    expect(record).toBeTruthy();
    return record!;
  };

  it("happy path: verifies with the gateway and grants the payer (GET redirect)", async () => {
    const record = await startPaymentAndGetRecord(
      String(alice._id),
      aliceToken,
    );

    const res = await confirm(
      String(alice._id),
      record.transitionId,
      "success",
      "get",
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain("completed successfully");
    expect(vi.mocked(verifyPayment)).toHaveBeenCalledWith(record.transitionId);

    const freshAlice = await User.findById(alice._id);
    expect(freshAlice?.verified).toBe(true);

    const freshRecord = await Payment.findById(record._id);
    expect(freshRecord?.status).toBe("Paid");
  });

  it("POST confirmation (form-post gateways) behaves the same", async () => {
    const record = await startPaymentAndGetRecord(
      String(alice._id),
      aliceToken,
    );
    const res = await confirm(
      String(alice._id),
      record.transitionId,
      "success",
      "post",
    );
    expect(res.status).toBe(200);
    expect((await User.findById(alice._id))?.verified).toBe(true);
  });

  it("forges cannot grant premium without a payment record (no verify call)", async () => {
    const res = await confirm(
      String(mallory._id),
      "made-up-transition-id",
      "success",
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain("Payment Failed");
    expect(vi.mocked(verifyPayment)).not.toHaveBeenCalled();
    expect((await User.findById(mallory._id))?.verified).toBe(false);
  });

  it("a stolen transitionId can never verify a different account", async () => {
    // bob's pending (Un-Paid) transaction, replayed by mallory with mallory's
    // own userId in the path — the grant must go to bob, never to mallory.
    const record = await startPaymentAndGetRecord(String(bob._id), bobToken);

    const res = await confirm(
      String(mallory._id),
      record.transitionId,
      "success",
    );
    expect(res.status).toBe(200);

    const freshMallory = await User.findById(mallory._id);
    const freshBob = await User.findById(bob._id);
    expect(freshMallory?.verified).toBe(false);
    expect(freshBob?.verified).toBe(true); // only the record's owner benefits
    expect((await Payment.findById(record._id))?.status).toBe("Paid");
  });

  it("an already-Paid transitionId is not replayable (no re-grant)", async () => {
    const paidRecord = await Payment.create({
      transitionId: "already-paid-txn",
      user: bob._id,
      amount: 1000,
      customerName: "Bob",
      customerEmail: "bob@example.com",
      status: "Paid",
    });

    const res = await confirm(
      String(mallory._id),
      paidRecord.transitionId,
      "success",
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain("completed successfully"); // cosmetic only

    // no grant happens on replay — bob stays unverified, mallory untouched
    expect((await User.findById(bob._id))?.verified).toBe(false);
    expect((await User.findById(mallory._id))?.verified).toBe(false);
    expect(vi.mocked(verifyPayment)).not.toHaveBeenCalled();
  });

  it("status=failed shows the failed page without calling verify", async () => {
    const record = await startPaymentAndGetRecord(
      String(alice._id),
      aliceToken,
    );

    const res = await confirm(String(alice._id), record.transitionId, "failed");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Payment Failed");
    expect(vi.mocked(verifyPayment)).not.toHaveBeenCalled();
    expect((await User.findById(alice._id))?.verified).toBe(false);
    expect((await Payment.findById(record._id))?.status).toBe("Un-Paid");
  });

  it("gateway verification failure leaves everything untouched", async () => {
    vi.mocked(verifyPayment).mockResolvedValue({ pay_status: "Failed" });
    const record = await startPaymentAndGetRecord(
      String(alice._id),
      aliceToken,
    );

    const res = await confirm(
      String(alice._id),
      record.transitionId,
      "success",
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain("Payment Failed");
    expect((await User.findById(alice._id))?.verified).toBe(false);
    expect((await Payment.findById(record._id))?.status).toBe("Un-Paid");
  });

  it("gateway network error is swallowed into the failed page (no 500)", async () => {
    vi.mocked(verifyPayment).mockRejectedValue(new Error("network down"));
    const record = await startPaymentAndGetRecord(
      String(alice._id),
      aliceToken,
    );

    const res = await confirm(
      String(alice._id),
      record.transitionId,
      "success",
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain("Payment Failed");
    expect((await User.findById(alice._id))?.verified).toBe(false);
  });

  it("missing transitionId cannot match some random record", async () => {
    await Payment.create({
      transitionId: "unrelated-txn",
      user: bob._id,
      amount: 1000,
      customerName: "Bob",
      customerEmail: "bob@example.com",
      status: "Un-Paid",
    });

    const res = await request(app).get(
      `/payment/conformation/${String(mallory._id)}?status=success`,
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain("Payment Failed");
    expect(vi.mocked(verifyPayment)).not.toHaveBeenCalled();
    expect((await User.findById(bob._id))?.verified).toBe(false);
  });
});
