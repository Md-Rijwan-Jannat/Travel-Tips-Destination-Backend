"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShortRoutes = void 0;
const express_1 = __importDefault(require("express"));
const auth_1 = __importDefault(require("../../middlewares/auth"));
const validateRequest_1 = __importDefault(require("../../middlewares/validateRequest"));
const user_constants_1 = require("../User/user.constants");
const short_controller_1 = require("./short.controller");
const short_validation_1 = require("./short.validation");
const rateLimiter_1 = require("../../middlewares/rateLimiter");
const router = express_1.default.Router();
// Vertical Shorts feed (audience + group-membership aware).
router.get("/", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), short_controller_1.ShortController.getAllShorts);
router.post("/", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), rateLimiter_1.groupActionLimiter, (0, validateRequest_1.default)(short_validation_1.ShortValidation.createShortValidationSchema), short_controller_1.ShortController.createShort);
router.get("/:shortId", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), short_controller_1.ShortController.getSingleShort);
router.patch("/:shortId", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), (0, validateRequest_1.default)(short_validation_1.ShortValidation.updateShortValidationSchema), short_controller_1.ShortController.updateShort);
router.delete("/:shortId", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), short_controller_1.ShortController.deleteShort);
// Hard delete + verified media cleanup (author/platform admin only).
router.delete("/:shortId/purge", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), short_controller_1.ShortController.purgeShort);
router.post("/:shortId/view", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), short_controller_1.ShortController.viewShort);
router.post("/:shortId/like", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), short_controller_1.ShortController.likeShort);
router.delete("/:shortId/like", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), short_controller_1.ShortController.unlikeShort);
router.post("/:shortId/report", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), (0, validateRequest_1.default)(short_validation_1.ShortValidation.reportShortValidationSchema), short_controller_1.ShortController.reportShort);
exports.ShortRoutes = router;
