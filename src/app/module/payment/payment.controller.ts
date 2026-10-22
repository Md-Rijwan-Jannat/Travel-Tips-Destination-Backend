import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import AppError from '../../errors/AppError';
import { PaymentService } from './payment.service';

const subscriptions = catchAsync(async (req, res) => {
  const { userId } = req.params;

  // The record must be bound to the authenticated caller — a token for user A
  // may never initiate (and pay for) user B's account.
  if (String(req.user.id) !== String(userId)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You can only start a payment for your own account',
    );
  }

  const result = await PaymentService.subscriptionsIntoBD(
    req.body,
    String(req.user.id),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Your subscriptions successful',
    data: result,
  });
});

const paymentConformation = catchAsync(async (req, res) => {
  const { transitionId, status } = req.query;
  // NOTE: `:userId` in the route is only there because the aamarpay redirect
  // URL contains it — the service never trusts it (grants go to the payment
  // record's owner only). No Auth middleware: the gateway redirects the
  // browser here, so no Authorization header is available.

  const result = await PaymentService.paymentConformationIntoDB(
    transitionId as string | undefined,
    status as string | undefined,
  );

  res.send(result);
});

const getPaymentsData = catchAsync(async (req, res) => {
  const { result, meta } = await PaymentService.getPaymentsData(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Payment data retrieved successfully',
    meta: meta,
    data: result,
  });
});

const getAllPaymentsDatForAnalytics = catchAsync(async (req, res) => {
  const result = await PaymentService.getAllPaymentsDatForAnalytics();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Payment data retrieved successfully',
    data: result,
  });
});

export const PaymentController = {
  subscriptions,
  paymentConformation,
  getPaymentsData,
  getAllPaymentsDatForAnalytics,
};
