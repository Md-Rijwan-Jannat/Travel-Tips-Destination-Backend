import { Router } from "express";
import { PaymentController } from "./payment.controller";
const router = Router();

router.post("/subscriptions/:userId", PaymentController.subscriptions);
router.post("/conformation/:userId", PaymentController.paymentConformation);

export const PaymentRoutes = router;
