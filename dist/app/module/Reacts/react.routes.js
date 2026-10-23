"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReactRoutes = void 0;
const express_1 = __importDefault(require("express"));
const react_controller_1 = require("./react.controller");
const react_validation_1 = require("./react.validation");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const validateRequest_1 = __importDefault(require("../../middlewares/validateRequest"));
const rateLimiter_1 = require("../../middlewares/rateLimiter");
const user_constants_1 = require("../User/user.constants");
const router = express_1.default.Router();
// Routes for reacting to :post
// Get all likes
router.get("/:type/likes", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN), react_controller_1.ReactController.getAllLikes);
// Get all dislikes
router.get("/:type/dislikes", (0, auth_1.default)(user_constants_1.USER_ROLE.ADMIN), react_controller_1.ReactController.getAllDislikes);
// Aggregated counts per reaction type + caller's own reaction.
// Declared before the generic dynamic routes for clarity.
router.get("/summary/:targetType/:targetId", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), react_controller_1.ReactController.getReactionSummary);
// Unified 7-type reaction: create or change the caller's single reaction.
router.post("/:targetType/:targetId", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), rateLimiter_1.socialActionLimiter, (0, validateRequest_1.default)(react_validation_1.ReactValidation.setReactionValidationSchema), react_controller_1.ReactController.setReaction);
// Unified: remove the caller's reaction.
router.delete("/:targetType/:targetId", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), rateLimiter_1.socialActionLimiter, react_controller_1.ReactController.removeReaction);
// Like
router.post("/:type/:targetId/like", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), react_controller_1.ReactController.like);
// Unlike
router.post("/:type/:targetId/unlike", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), react_controller_1.ReactController.unlike);
// dislike
router.post("/:type/:targetId/dislike", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), react_controller_1.ReactController.dislike);
// undislike
router.post("/:type/:targetId/undislike", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), react_controller_1.ReactController.undislike);
exports.ReactRoutes = router;
