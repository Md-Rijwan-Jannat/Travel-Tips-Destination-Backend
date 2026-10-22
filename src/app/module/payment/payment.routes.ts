import { Router } from "express";
import Auth from "../../middlewares/auth";
import { USER_ROLE } from "../User/user.constants";
import { PaymentController } from "./payment.controller";
import validateRequest from "../../middlewares/validateRequest";
import { PaymentValidation } from "./payment.validation";
const router = Router();

// Initiate a premium subscription: authenticated, own-account only (checked
// in the controller against the token), server-side price + record binding.
router.post(
  "/subscriptions/:userId",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(PaymentValidation.initiatePaymentValidationSchema),
  PaymentController.subscriptions,
);

// Gateway redirect target. aamarpay redirects the browser with GET (some
// integrations POST) — no Authorization header is available here, so security
// comes from record lookup + server-side aamarpay verification + granting
// only the payment record's owner (never the route param). Both methods are
// registered so the redirect cannot 404.
router.get("/conformation/:userId", PaymentController.paymentConformation);
router.post("/conformation/:userId", PaymentController.paymentConformation);

router.get("/", Auth(USER_ROLE.ADMIN), PaymentController.getPaymentsData);

router.get(
  "/analytics",
  Auth(USER_ROLE.ADMIN),
  PaymentController.getPaymentsData,
);

export const PaymentRoutes = router;
