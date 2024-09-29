import { Request, Response } from "express";
import { ReactService } from "./react.service";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";

// Like a post or comment
const like = catchAsync(async (req: Request, res: Response) => {
  const { targetId, type } = req.params;
  const userId = req.user.id;

  const react = await ReactService.likeFromDB(
    userId,
    targetId,
    type as "post" | "comment"
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `You liked the ${type} successfully.`,
    data: react,
  });
});

// Unlike a post or comment
const unlike = catchAsync(async (req: Request, res: Response) => {
  const { targetId, type } = req.params;
  const userId = req.user.id;

  await ReactService.unlikeFromDB(userId, targetId, type as "post" | "comment");

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `You unliked the ${type} successfully.`,
    data: "",
  });
});

// Dislike a post or comment
const dislike = catchAsync(async (req: Request, res: Response) => {
  const { targetId, type } = req.params;
  const userId = req.user.id;

  const react = await ReactService.dislikeFromDB(
    userId,
    targetId,
    type as "post" | "comment"
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `You disliked the ${type} successfully.`,
    data: react,
  });
});

// Undislike a post or comment
const undislike = catchAsync(async (req: Request, res: Response) => {
  const { targetId, type } = req.params;
  const userId = req.user.id;

  await ReactService.undislikeFromDB(
    userId,
    targetId,
    type as "post" | "comment"
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `You undisliked the ${type} successfully.`,
    data: "",
  });
});

export const ReactController = {
  like,
  unlike,
  dislike,
  undislike,
};
