/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import validateRequest from '../../middlewares/validateRequest';
import { UserControllers } from './auth.controller';
import { UserValidation } from './auth.validation';
import Auth from '../../middlewares/auth';
import { USER_ROLE } from '../User/user.constants';

const router = express.Router();

router.post(
  '/register',
  validateRequest(UserValidation.registerUserValidationSchema),
  UserControllers.registerUser
);

router.post(
  '/login',
  validateRequest(UserValidation.loginUserValidationSchema),
  UserControllers.loginUser
);

router.post('/reset-link', UserControllers.resetLink);

router.post('/forget-password', UserControllers.forgetPassword);

router.post(
  '/change-password',
  Auth(USER_ROLE.ADMIN, USER_ROLE.USER),
  UserControllers.changePassword
);
export const AuthRoutes = router;
