"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_routes_1 = require("../module/User/user.routes");
const profile_routes_1 = require("../module/Profile/profile.routes");
const auth_routes_1 = require("../module/Auth/auth.routes");
const post_routes_1 = require("../module/Post/post.routes");
const comment_routes_1 = require("../module/Comment/comment.routes");
const react_routes_1 = require("../module/Reacts/react.routes");
const router = (0, express_1.Router)();
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
];
moduleRoutes.forEach((route) => router.use(route.path, route.route));
exports.default = router;
