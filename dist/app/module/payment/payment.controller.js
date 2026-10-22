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
exports.PaymentController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const payment_service_1 = require("./payment.service");
const subscriptions = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.params;
    // The record must be bound to the authenticated caller — a token for user A
    // may never initiate (and pay for) user B's account.
    if (String(req.user.id) !== String(userId)) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'You can only start a payment for your own account');
    }
    const result = yield payment_service_1.PaymentService.subscriptionsIntoBD(req.body, String(req.user.id));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Your subscriptions successful',
        data: result,
    });
}));
const paymentConformation = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { transitionId, status } = req.query;
    // NOTE: `:userId` in the route is only there because the aamarpay redirect
    // URL contains it — the service never trusts it (grants go to the payment
    // record's owner only). No Auth middleware: the gateway redirects the
    // browser here, so no Authorization header is available.
    const result = yield payment_service_1.PaymentService.paymentConformationIntoDB(transitionId, status);
    res.send(result);
}));
const getPaymentsData = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { result, meta } = yield payment_service_1.PaymentService.getPaymentsData(req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Payment data retrieved successfully',
        meta: meta,
        data: result,
    });
}));
const getAllPaymentsDatForAnalytics = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield payment_service_1.PaymentService.getAllPaymentsDatForAnalytics();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Payment data retrieved successfully',
        data: result,
    });
}));
exports.PaymentController = {
    subscriptions,
    paymentConformation,
    getPaymentsData,
    getAllPaymentsDatForAnalytics,
};
