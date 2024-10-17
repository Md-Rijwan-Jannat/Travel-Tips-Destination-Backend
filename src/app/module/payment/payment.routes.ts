import { Router } from "express";
import Auth from "../../middlewares/auth";
import { USER_ROLE } from "../User/user.constants";
import { PaymentController } from "./payment.controller";
const router = Router();

router.post("/subscriptions/:userId", PaymentController.subscriptions);

router.post("/conformation/:userId", PaymentController.paymentConformation);

router.get("/", Auth(USER_ROLE.ADMIN), PaymentController.getPaymentsData);

router.get(
  "/analytics",
  Auth(USER_ROLE.ADMIN),
  PaymentController.getPaymentsData,
);

export const PaymentRoutes = router;
