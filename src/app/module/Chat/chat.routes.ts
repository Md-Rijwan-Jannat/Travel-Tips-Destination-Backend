import express from 'express';
import { ChatController } from './chat.controller';
import Auth from '../../middlewares/auth';
import { USER_ROLE } from '../User/user.constants';

const router = express.Router();

// Chat routes
router.post(
  '/',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  ChatController.createChat
);

router.get(
  '/',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  ChatController.getUserChats
);

router.get(
  '/:chatId',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  ChatController.getSingleChat
);

router.post(
  '/group',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  ChatController.createGroupChat
);

router.put(
  '/rename',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  ChatController.renameGroup
);

router.put(
  '/group-remove',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  ChatController.removeFromGroup
);

router.put(
  '/group-add',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  ChatController.addToGroup
);

export const ChatRoutes = router;
