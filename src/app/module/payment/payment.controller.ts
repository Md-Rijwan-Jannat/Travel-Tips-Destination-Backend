import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { PaymentService } from "./payment.service";

const subscriptions = catchAsync(async (req, res) => {
  const { userId } = req.params;

  const result = await PaymentService.subscriptionsIntoBD(
    req.body,
    userId as string,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Your subscriptions successful",
    data: result,
  });
});

const paymentConformation = catchAsync(async (req, res) => {
  const { transitionId, status } = req.query;
  const { userId } = req.params;

  const result = await PaymentService.paymentConformationIntoDB(
    transitionId as string,
    status as string,
    userId as string,
  );

  res.send(result);
});

const getPaymentsData = catchAsync(async (req, res) => {
  const { result, meta } = await PaymentService.getPaymentsData(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payment data retrieved successfully",
    meta: meta,
    data: result,
  });
});

const getAllPaymentsDatForAnalytics = catchAsync(async (req, res) => {
  const result = await PaymentService.getAllPaymentsDatForAnalytics();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payment data retrieved successfully",
    data: result,
  });
});

export const PaymentController = {
  subscriptions,
  paymentConformation,
  getPaymentsData,
  getAllPaymentsDatForAnalytics,
};
