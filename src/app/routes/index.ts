import { Router } from "express";
import { UserRoutes } from "../module/User/user.routes";
import { ProfileRoutes } from "../module/Profile/profile.routes";
import { AuthRoutes } from "../module/Auth/auth.routes";

const router = Router();

const moduleRoutes = [
  {
    path: "/auth",
    route: AuthRoutes,
  },
  {
    path: "/user",
    route: UserRoutes,
  },
  {
    path: "/profile",
    route: ProfileRoutes,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
