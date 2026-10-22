"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seed = void 0;
/* eslint-disable no-console */
const config_1 = __importDefault(require("../../config"));
const user_constants_1 = require("../module/User/user.constants");
const user_model_1 = require("../module/User/user.model");
const seed = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        //atfirst check if the admin exist of not
        const admin = yield user_model_1.User.findOne({
            role: user_constants_1.USER_ROLE.ADMIN,
            email: config_1.default.admin_email,
            status: user_constants_1.USER_STATUS.IN_PROGRESS,
        });
        if (!admin) {
            yield user_model_1.User.create({
                name: "Md Rijwan",
                role: user_constants_1.USER_ROLE.ADMIN,
                image: config_1.default.admin_image,
                email: config_1.default.admin_email,
                password: config_1.default.admin_password,
                status: user_constants_1.USER_STATUS.IN_PROGRESS,
                follower: [],
                following: [],
                verified: true,
            });
            console.log("Admin created successfully...");
            console.log("Seeding completed...");
        }
    }
    catch (error) {
        console.log("Error in seeding", error);
    }
});
exports.seed = seed;
