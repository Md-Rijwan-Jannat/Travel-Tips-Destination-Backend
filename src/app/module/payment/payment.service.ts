import { Types } from "mongoose";
import { User } from "../User/user.model";
import AppError from "../../errors/AppError";
import httpStatus from "http-status";
import { v4 as uuidv4 } from "uuid";
import QueryBuilder from "../../builder/QueryBuilder";
import { TPaymentData } from "./payment.interface";
import { initialPayment, verifyPayment } from "./payment.utils";
import Payment from "./payment.model";
import config from "../../../config";

const subscriptionsIntoBD = async (
  payload: Partial<TPaymentData>,
  userId: string,
) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User is not found");
  }

  // Generate a transition ID (server-owned)
  const transitionId = uuidv4();

  // Server-owned payment data: the record is bound to the authenticated user,
  // the amount comes from the server price table, and status always starts as
  // Un-Paid. Client-sent user/amount/transitionId/status are never trusted.
  const paymentData: TPaymentData = {
    transitionId,
    user: user._id as Types.ObjectId,
    amount: config.premium_price,
    customerName: payload.customerName || user.name || "N/A",
    customerEmail: payload.customerEmail || user.email,
    customerNumber: payload.customerNumber,
    customerAddress: payload.customerAddress,
    customerCountry: payload.customerCountry,
    status: "Un-Paid",
  };

  // Make the initial payment request
  let paymentResponse;
  try {
    paymentResponse = await initialPayment(paymentData);
  } catch {
    throw new AppError(httpStatus.BAD_REQUEST, "Payment initiation failed");
  }

  if (!paymentResponse) {
    throw new AppError(httpStatus.BAD_REQUEST, "Payment initiation failed");
  }

  // Save payment data to the database (only after the gateway accepted)
  const result = await Payment.create(paymentData);

  return {
    paymentResponse,
    result,
  };
};

const paymentConformationIntoDB = async (
  transitionId: string | undefined,
  status: string | undefined,
) => {
  let paymentStatus = "failed";
  let message = "Payment Failed. Please try again.";

  // The gateway redirects the browser here (no Authorization header can be
  // required), so safety comes from: (1) lookup the server-side record, (2)
  // verify with aamarpay, (3) grant ONLY to the record's owner — the route
  // param userId is never trusted and a paid transitionId can never be
  // replayed to verify a different account.
  const isValidTransitionId =
    typeof transitionId === "string" && transitionId.length > 0;

  const paymentRecord = isValidTransitionId
    ? await Payment.findOne({ transitionId })
    : null;

  if (status === "success" && paymentRecord) {
    if (paymentRecord.status === "Paid") {
      // Already processed — show success without re-granting anything.
      paymentStatus = "success";
      message =
        "Thank you for upgrading to premium access.Your transaction <br /> has been completed successfully!";
    } else {
      try {
        const verifyResponse = await verifyPayment(paymentRecord.transitionId);

        if (verifyResponse && verifyResponse.pay_status === "Successful") {
          // Grant strictly to the payment record's owner.
          await User.findByIdAndUpdate(
            paymentRecord.user,
            { verified: true },
            { new: true },
          );

          paymentRecord.status = "Paid";
          await paymentRecord.save();

          paymentStatus = "success";
          message =
            "Thank you for upgrading to premium access.Your transaction <br /> has been completed successfully!";
        }
      } catch {
        // Gateway unreachable / verification error → keep the failed page.
        paymentStatus = "failed";
        message = "Payment Failed. Please try again.";
      }
    }
  }

  // Return the HTML for both success and failed cases
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment ${paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1)}</title>
      <style>
          body {
              font-family: 'Arial', sans-serif;
              background-color: #ffffff;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: auto;
              width:100%;
          }
          .container {
              background-color: #fff0f6;
              padding: 50px;
              border-radius: 10px;
              box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
              text-align: center;
          }
          .container h1 {
              color: ${paymentStatus === "success" ? "#FF69B4" : "#F25081"};
              font-size: 20px;
              margin-bottom: 20px;
          }
          .container p {
              color: #333;
              font-size: 1.1rem;
              margin-bottom: 30px;
          }
          .icon {
              font-size: 4rem;
              color: ${paymentStatus === "success" ? "#FF69B4" : "#F25081"};
              margin-bottom: 20px;
          }
          .button {
              display: inline-block;
              background-color: ${paymentStatus === "success" ? "#FF69B4" : "#F25081"};
              color: #ffffff;
              padding: 15px 30px;
              text-decoration: none;
              border-radius: 30px;
              font-size: 1rem;
              transition: background-color 0.3s ease;
          }
          .button:hover {
              background-color: ${paymentStatus === "success" ? "#FF85B2" : "#FF4588"};
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="success-icon"><img src="${paymentStatus === "success" ? "https://img.icons8.com/?size=100&id=123575&format=png&color=F25081" : "https://img.icons8.com/?size=100&id=35879&format=png&color=F25081"}" /></div>
          <h1>${message}</h1>
          <a href="https://traveltipsdestinationcommunity.vercel.app/profile" class="button">Go Back</a>
      </div>
  </body>
  </html>
  `;
};

const getPaymentsData = async (query: Record<string, unknown>) => {
  const paymentQueryBuilder = new QueryBuilder(
    Payment.find().populate("user"),
    query,
  )
    .filter()
    .sort()
    .paginate();

  const result = await paymentQueryBuilder.modelQuery;
  const meta = await paymentQueryBuilder.countTotal();

  return {
    meta,
    result,
  };
};

const getAllPaymentsDatForAnalytics = async () => {
  const result = await Payment.find().populate("user");

  return result;
};

export const PaymentService = {
  subscriptionsIntoBD,
  paymentConformationIntoDB,
  getPaymentsData,
  getAllPaymentsDatForAnalytics,
};
