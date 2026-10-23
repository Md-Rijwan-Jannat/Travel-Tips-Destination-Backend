import express from "express";
import Auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLE } from "../User/user.constants";
import { ShortController } from "./short.controller";
import { ShortValidation } from "./short.validation";
import { groupActionLimiter } from "../../middlewares/rateLimiter";

const router = express.Router();

// Vertical Shorts feed (audience + group-membership aware).
router.get(
  "/",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ShortController.getAllShorts,
);

router.post(
  "/",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  groupActionLimiter,
  validateRequest(ShortValidation.createShortValidationSchema),
  ShortController.createShort,
);

router.get(
  "/:shortId",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ShortController.getSingleShort,
);

router.patch(
  "/:shortId",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(ShortValidation.updateShortValidationSchema),
  ShortController.updateShort,
);

router.delete(
  "/:shortId",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ShortController.deleteShort,
);

// Hard delete + verified media cleanup (author/platform admin only).
router.delete(
  "/:shortId/purge",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ShortController.purgeShort,
);

router.post(
  "/:shortId/view",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ShortController.viewShort,
);

router.post(
  "/:shortId/like",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ShortController.likeShort,
);

router.delete(
  "/:shortId/like",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  ShortController.unlikeShort,
);

router.post(
  "/:shortId/report",
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(ShortValidation.reportShortValidationSchema),
  ShortController.reportShort,
);

export const ShortRoutes = router;
