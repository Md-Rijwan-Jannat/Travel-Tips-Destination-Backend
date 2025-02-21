"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const user_routes_1 = require("../module/User/user.routes");
const profile_routes_1 = require("../module/Profile/profile.routes");
const auth_routes_1 = require("../module/Auth/auth.routes");
const post_routes_1 = require("../module/Post/post.routes");
const comment_routes_1 = require("../module/Comment/comment.routes");
const react_routes_1 = require("../module/Reacts/react.routes");
const message_routes_1 = require("../module/Messages/message.routes");
const chat_routes_1 = require("../module/Chat/chat.routes");
const payment_routes_1 = require("../module/payment/payment.routes");
const story_routes_1 = require("../module/Story/story.routes");
const review_routes_1 = require("../module/Review/review.routes");
const router = express_1.default.Router();
const moduleRoutes = [
    {
        path: "/auth",
        route: auth_routes_1.AuthRoutes,
    },
    {
        path: "/users",
        route: user_routes_1.UserRoutes,
    },
    {
        path: "/profile",
        route: profile_routes_1.ProfileRoutes,
    },
    {
        path: "/posts",
        route: post_routes_1.PostRoutes,
    },
    {
        path: "/comments",
        route: comment_routes_1.CommentRoutes,
    },
    {
        path: "/react",
        route: react_routes_1.ReactRoutes,
    },
    {
        path: "/payment",
        route: payment_routes_1.PaymentRoutes,
    },
    {
        path: "/chats",
        route: chat_routes_1.ChatRoutes,
    },
    {
        path: "/messages",
        route: message_routes_1.MessageRoutes,
    },
    {
        path: "/stories",
        route: story_routes_1.StoryRoutes,
    },
    {
        path: "/reviews",
        route: review_routes_1.ReviewRoutes,
    },
];
moduleRoutes.forEach((route) => router.use(route.path, route.route));
exports.default = router;
