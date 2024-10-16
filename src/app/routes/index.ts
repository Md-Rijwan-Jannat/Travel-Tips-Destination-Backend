import { Router } from "express";
import { UserRoutes } from "../module/User/user.routes";
import { ProfileRoutes } from "../module/Profile/profile.routes";
import { AuthRoutes } from "../module/Auth/auth.routes";
import { PostRoutes } from "../module/Post/post.routes";
import { CommentRoutes } from "../module/Comment/comment.routes";
import { ReactRoutes } from "../module/Reacts/react.routes";
import { PaymentRoutes } from "../module/Payment/payment.routes";
import { MessageRoutes } from "../module/Messages/message.routes";
import { ChatRoutes } from "../module/Chat/chat.routes";

const router = Router();

const moduleRoutes = [
  {
    path: "/auth",
    route: AuthRoutes,
  },
  {
    path: "/users",
    route: UserRoutes,
  },
  {
    path: "/profile",
    route: ProfileRoutes,
  },
  {
    path: "/posts",
    route: PostRoutes,
  },
  {
    path: "/comments",
    route: CommentRoutes,
  },
  {
    path: "/react",
    route: ReactRoutes,
  },
  {
    path: "/payment",
    route: PaymentRoutes,
  },
  {
    path: "/chats",
    route: ChatRoutes,
  },
  {
    path: "/messages",
    route: MessageRoutes,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
