import { User } from "../User/user.model";
import AppError from "../../errors/AppError";
import httpStatus from "http-status";
import { v4 as uuidv4 } from "uuid";
import { Post } from "../Post/post.model";
import QueryBuilder from "../../builder/QueryBuilder";
import { TPaymentData } from "./payment.interface";
import { initialPayment, verifyPayment } from "./payment.utils";
import Payment from "./payment.model";

const subscriptionsIntoBD = async (
  payload: Omit<TPaymentData, "transitionId">,
  userId: string,
) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User is not found");
  }

  const post = await Post.find({ user: user._id });

  // Generate a transition ID
  const transitionId = uuidv4();

  const paymentData = { ...payload, transitionId };

  // Make the initial payment request
  const paymentResponse = await initialPayment(paymentData);

  if (!paymentResponse) {
    throw new AppError(httpStatus.BAD_REQUEST, "Payment initiation failed");
  }

  // Save payment data to the database
  const result = await Payment.create({ ...paymentData, user: userId });

  return {
    paymentResponse,
    result,
  };
};

const paymentConformationIntoDB = async (
  transitionId: string,
  status: string,
  userId: string,
) => {
  let paymentStatus = "failed";
  let message = "Payment Failed. Please try again.";

  if (status === "success") {
    const verifyResponse = await verifyPayment(transitionId);

    if (verifyResponse && verifyResponse.pay_status === "Successful") {
      await User.findByIdAndUpdate(userId, { verified: true }, { new: true });

      const updatedPayment = await Payment.findOneAndUpdate(
        { transitionId },
        { status: "Paid" },
        { new: true },
      );

      if (!updatedPayment) {
        throw new AppError(httpStatus.NOT_FOUND, "Payment record not found");
      }

      paymentStatus = "success";
      message =
        "Thank you for upgrading to premium access.Your transaction <br /> has been completed successfully!";
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

const getPaymentsData = async (query: Record<string, any>) => {
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
