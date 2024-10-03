"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReactRoutes = void 0;
const express_1 = __importDefault(require("express"));
const react_controller_1 = require("./react.controller");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const user_constants_1 = require("../User/user.constants");
const router = express_1.default.Router();
// Routes for reacting to :post
router.get("/", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), react_controller_1.ReactController.getAllReacts);
router.post("/:type/:targetId/like", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), react_controller_1.ReactController.like);
router.post("/:type/:targetId/unlike", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), react_controller_1.ReactController.unlike);
router.post("/:type/:targetId/dislike", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), react_controller_1.ReactController.dislike);
router.post("/:type/:targetId/undislike", (0, auth_1.default)(user_constants_1.USER_ROLE.USER, user_constants_1.USER_ROLE.ADMIN), react_controller_1.ReactController.undislike);
exports.ReactRoutes = router;
