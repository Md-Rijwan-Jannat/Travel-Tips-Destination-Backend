import { model, Schema } from "mongoose";
import { TPaymentData } from "./payment.interface";

const PaymentSchema: Schema = new Schema(
  {
    transitionId: {
      type: String,
      required: true,
      unique: true,
    },
    user: {
      type: Schema.Types.ObjectId,
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
  },
  {
    timestamps: true,
  },
);

// Create the Payment model
const Payment = model<TPaymentData>("Payment", PaymentSchema);

export default Payment;
