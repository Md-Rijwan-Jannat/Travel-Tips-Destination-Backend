"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileRoutes = void 0;
const express_1 = __importDefault(require("express"));
const profile_controler_1 = require("./profile.controler");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const user_constants_1 = require("../User/user.constants");
const profile_validation_1 = require("./profile.validation");
const validateRequest_1 = __importDefault(require("../../middlewares/validateRequest"));
const router = express_1.default.Router();
router.get("/", (0, auth_1.default)(user_constants_1.USER_ROLE.USER), profile_controler_1.ProfileControllers.getMyProfile);
router.patch("/:id", (0, auth_1.default)(user_constants_1.USER_ROLE.USER), (0, validateRequest_1.default)(profile_validation_1.ProfileValidation.updateMyProfileValidationSchema), profile_controler_1.ProfileControllers.updateMyProfile);
router.delete("/:id", (0, auth_1.default)(user_constants_1.USER_ROLE.USER), profile_controler_1.ProfileControllers.deleteMyProfile);
exports.ProfileRoutes = router;
