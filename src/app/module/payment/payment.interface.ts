import { Types } from "mongoose";

export interface TPaymentData {
  transitionId: string;
  user: Types.ObjectId;
  amount: number;
  customerEmail: string;
  customerName: string;
  customerNumber: string;
  customerAddress?: string;
  customerCountry?: string;
  status: "Un-Paid" | "Paid";
}
