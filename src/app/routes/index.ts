import { Router } from "express";
import { UserRoutes } from "../module/User/user.route";

const router = Router();

const moduleRoutes = [
  {
    path: "/register",
    route: UserRoutes,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
