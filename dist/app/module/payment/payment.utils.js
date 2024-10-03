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
exports.verifyPayment = exports.initialPayment = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = __importDefault(require("../../../config"));
const initialPayment = (paymentData) => __awaiter(void 0, void 0, void 0, function* () {
    const frontendUrl = `${config_1.default.NODE_ENV === "development" ? config_1.default.frontend_base_url : config_1.default.frontend_live_url}`;
    const backendUrl = `${config_1.default.NODE_ENV === "development" ? "http://localhost:5000" : config_1.default.backend_live_url}`;
    const response = yield axios_1.default.post(config_1.default.aamarpay_url, {
        store_id: config_1.default.store_id,
        signature_key: config_1.default.signature_key,
        tran_id: paymentData.transitionId,
        success_url: `${backendUrl}/api/v1/payment/conformation/${paymentData.user}?transitionId=${paymentData.transitionId}&status=success`,
        fail_url: `${backendUrl}/api/v1/payment/conformation/${paymentData.user}?transitionId=${paymentData.transitionId}&status=failed`,
        cancel_url: `${frontendUrl}`,
        amount: paymentData.amount,
        currency: "BDT",
        desc: "Payment for get a premium accessability on the TT&DG",
        cus_name: paymentData.customerName,
        cus_email: paymentData.customerEmail,
        cus_add1: paymentData.customerAddress,
        cus_add2: "N/A",
        cus_city: "N/A",
        cus_state: "N/A",
        cus_postcode: "N/A",
        cus_country: paymentData.customerCountry,
        cus_phone: "N/A",
        type: "json",
    });
    return response.data;
});
exports.initialPayment = initialPayment;
// verify payment
const verifyPayment = (transitionId) => __awaiter(void 0, void 0, void 0, function* () {
    const response = yield axios_1.default.get(config_1.default.payment_verify_url, {
        params: {
            request_id: transitionId,
            store_id: config_1.default.store_id,
            signature_key: config_1.default.signature_key,
            type: "json",
        },
    });
    return response.data;
});
exports.verifyPayment = verifyPayment;
