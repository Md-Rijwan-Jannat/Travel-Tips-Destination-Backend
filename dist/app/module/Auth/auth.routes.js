"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthRoutes = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
const express_1 = __importDefault(require("express"));
const validateRequest_1 = __importDefault(require("../../middlewares/validateRequest"));
const auth_controller_1 = require("./auth.controller");
const auth_validation_1 = require("./auth.validation");
const router = express_1.default.Router();
router.post("/register", (0, validateRequest_1.default)(auth_validation_1.UserValidation.registerUserValidationSchema), auth_controller_1.UserControllers.registerUser);
router.post("/login", (0, validateRequest_1.default)(auth_validation_1.UserValidation.loginUserValidationSchema), auth_controller_1.UserControllers.loginUser);
exports.AuthRoutes = router;
