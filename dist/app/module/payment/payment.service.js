"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentService = void 0;
const user_model_1 = require("../User/user.model");
const payment_model_1 = __importDefault(require("./payment.model"));
const payment_utils_1 = require("./payment.utils");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const uuid_1 = require("uuid");
const post_model_1 = require("../Post/post.model");
const QueryBuilder_1 = __importDefault(require("../../builder/QueryBuilder"));
const subscriptionsIntoBD = (payload, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findById(userId);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "User is not found");
    }
    const post = yield post_model_1.Post.find({ user: user._id });
    // Generate a transition ID
    const transitionId = (0, uuid_1.v4)();
    const paymentData = Object.assign(Object.assign({}, payload), { transitionId });
    // Make the initial payment request
    const paymentResponse = yield (0, payment_utils_1.initialPayment)(paymentData);
    if (!paymentResponse) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Payment initiation failed");
    }
    // Save payment data to the database
    const result = yield payment_model_1.default.create(Object.assign(Object.assign({}, paymentData), { user: userId }));
    return {
        paymentResponse,
        result,
    };
});
const paymentConformationIntoDB = (transitionId, status, userId) => __awaiter(void 0, void 0, void 0, function* () {
    let paymentStatus = "failed";
    let message = "Payment Failed. Please try again.";
    if (status === "success") {
        const verifyResponse = yield (0, payment_utils_1.verifyPayment)(transitionId);
        if (verifyResponse && verifyResponse.pay_status === "Successful") {
            yield user_model_1.User.findByIdAndUpdate(userId, { verified: true }, { new: true });
            const updatedPayment = yield payment_model_1.default.findOneAndUpdate({ transitionId }, { status: "Paid" }, { new: true });
            if (!updatedPayment) {
                throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Payment record not found");
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
});
const getPaymentsData = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const paymentQueryBuilder = new QueryBuilder_1.default(payment_model_1.default.find().populate("user"), query)
        .filter()
        .sort()
        .paginate();
    const result = yield paymentQueryBuilder.modelQuery;
    const meta = yield paymentQueryBuilder.countTotal();
    return {
        meta,
        result,
    };
});
const getAllPaymentsDatForAnalytics = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield payment_model_1.default.find().populate("user");
    return result;
});
exports.PaymentService = {
    subscriptionsIntoBD,
    paymentConformationIntoDB,
    getPaymentsData,
    getAllPaymentsDatForAnalytics,
};
