"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_routes_1 = require("../module/User/user.routes");
const profile_routes_1 = require("../module/Profile/profile.routes");
const auth_routes_1 = require("../module/Auth/auth.routes");
const post_routes_1 = require("../module/Post/post.routes");
const router = (0, express_1.Router)();
const moduleRoutes = [
    {
        path: "/auth",
        route: auth_routes_1.AuthRoutes,
    },
    {
        path: "/user",
        route: user_routes_1.UserRoutes,
    },
    {
        path: "/profile",
        route: profile_routes_1.ProfileRoutes,
    },
    {
        path: "/post",
        route: post_routes_1.PostRoutes,
    },
];
moduleRoutes.forEach((route) => router.use(route.path, route.route));
exports.default = router;
