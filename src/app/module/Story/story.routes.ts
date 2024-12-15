import express from 'express';
import { StoryController } from './story.controller';
import validateRequest from '../../middlewares/validateRequest';
import { StoryValidations } from './story.validation';
import Auth from '../../middlewares/auth';
import { USER_ROLE } from '../User/user.constants';

const router = express.Router();

router.post(
  '/',
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(StoryValidations.createStoryValidationSchema),
  StoryController.createStory
);

router.get(
  '/',
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  StoryController.getUserStories
);

router.get(
  '/all-users-stories',
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  StoryController.getAllUserStories
);

router.get(
  '/:storyId',
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  StoryController.getUserStories
);

router.patch(
  '/:storyId',
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(StoryValidations.updateStoryValidationSchema),
  StoryController.updateStory
);

router.post(
  '/:storyId/view',
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(StoryValidations.addViewValidationSchema),
  StoryController.addView
);

router.post(
  '/:storyId/reaction',
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(StoryValidations.addReactionValidationSchema),
  StoryController.addReaction
);

router.delete(
  '/:storyId',
  Auth(USER_ROLE.USER, USER_ROLE.ADMIN),
  validateRequest(StoryValidations.updateStoryValidationSchema),
  StoryController.deleteStory
);

export const StoryRoutes = router;
