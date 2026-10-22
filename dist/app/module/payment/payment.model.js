"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const PaymentSchema = new mongoose_1.Schema({
    transitionId: {
        type: String,
        required: true,
        unique: true,
    },
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
    },
    amount: {
        type: Number,
        required: true,
    },
    customerEmail: {
        type: String,
        required: true,
    },
    customerName: {
        type: String,
        required: true,
    },
    customerNumber: {
        type: String,
    },
    customerAddress: {
        type: String,
    },
    customerCountry: {
        type: String,
    },
    status: {
        type: String,
        enum: ["Un-Paid", "Paid"],
        default: "Un-Paid",
    },
}, {
    timestamps: true,
});
// Create the Payment model
const Payment = (0, mongoose_1.model)("Payment", PaymentSchema);
exports.default = Payment;
