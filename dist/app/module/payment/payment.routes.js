"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentRoutes = void 0;
const express_1 = require("express");
const payment_controller_1 = require("./payment.controller");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const user_constants_1 = require("../User/user.constants");
const router = (0, express_1.Router)();
router.post("/subscriptions/:userId", payment_controller_1.PaymentController.subscriptions);
router.post("/conformation/:userId", payment_controller_1.PaymentController.paymentConformation);
router.get("/", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN), payment_controller_1.PaymentController.getPaymentsData);
router.get("/analytics", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN), payment_controller_1.PaymentController.getPaymentsData);
exports.PaymentRoutes = router;
