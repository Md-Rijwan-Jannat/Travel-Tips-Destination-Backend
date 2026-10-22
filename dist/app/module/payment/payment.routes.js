"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentRoutes = void 0;
const express_1 = require("express");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const user_constants_1 = require("../User/user.constants");
const payment_controller_1 = require("./payment.controller");
const validateRequest_1 = __importDefault(require("../../middlewares/validateRequest"));
const payment_validation_1 = require("./payment.validation");
const router = (0, express_1.Router)();
// Initiate a premium subscription: authenticated, own-account only (checked
// in the controller against the token), server-side price + record binding.
router.post("/subscriptions/:userId", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), (0, validateRequest_1.default)(payment_validation_1.PaymentValidation.initiatePaymentValidationSchema), payment_controller_1.PaymentController.subscriptions);
// Gateway redirect target. aamarpay redirects the browser with GET (some
// integrations POST) — no Authorization header is available here, so security
// comes from record lookup + server-side aamarpay verification + granting
// only the payment record's owner (never the route param). Both methods are
// registered so the redirect cannot 404.
router.get("/conformation/:userId", payment_controller_1.PaymentController.paymentConformation);
router.post("/conformation/:userId", payment_controller_1.PaymentController.paymentConformation);
router.get("/", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN), payment_controller_1.PaymentController.getPaymentsData);
router.get("/analytics", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN), payment_controller_1.PaymentController.getPaymentsData);
exports.PaymentRoutes = router;
