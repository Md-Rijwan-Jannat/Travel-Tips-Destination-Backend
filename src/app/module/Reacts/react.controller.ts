import { ReactService } from "./react.service";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";

// Like a post or comment
const getAllLikes = catchAsync(async (req, res) => {
  const react = await ReactService.getAllLikes();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Likes are retrieved successfully.`,
    data: react,
  });
});
// Like a post or comment
const getAllDislikes = catchAsync(async (req, res) => {
  const react = await ReactService.getAllDisLikes();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Dislikes are retrieved successfully.`,
    data: react,
  });
});

// Like a post or comment
const like = catchAsync(async (req, res) => {
  const { targetId, type } = req.params;
  const userId = req.user.id;

  const react = await ReactService.likeFromDB(
    userId,
    targetId,
    type as "post" | "comment",
    { id: userId, role: req.user.role },
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `You liked the ${type} successfully.`,
    data: react,
  });
});

// Unlike a post or comment
const unlike = catchAsync(async (req, res) => {
  const { targetId, type } = req.params;
  const userId = req.user.id;

  await ReactService.unlikeFromDB(userId, targetId, type as "post" | "comment", {
    id: userId,
    role: req.user.role,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `You unliked the ${type} successfully.`,
    data: "",
  });
});

// Dislike a post or comment
const dislike = catchAsync(async (req, res) => {
  const { targetId, type } = req.params;
  const userId = req.user.id;

  const react = await ReactService.dislikeFromDB(
    userId,
    targetId,
    type as "post" | "comment",
    { id: userId, role: req.user.role },
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `You disliked the ${type} successfully.`,
    data: react,
  });
});

// Undislike a post or comment
const undislike = catchAsync(async (req, res) => {
  const { targetId, type } = req.params;
  const userId = req.user.id;

  await ReactService.undislikeFromDB(
    userId,
    targetId,
    type as "post" | "comment",
    { id: userId, role: req.user.role },
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `You undisliked the ${type} successfully.`,
    data: "",
  });
});

// Unified: set (create or change) one of the seven reactions.
const setReaction = catchAsync(async (req, res) => {
  const { targetType, targetId } = req.params;
  const userId = req.user.id;

  if (!ReactService.isTargetType(targetType)) {
    sendResponse(res, {
      statusCode: 400,
      success: false,
      message: "Invalid target type. Use post, comment or short.",
      data: "",
    });
    return;
  }

  const summary = await ReactService.setReactionFromDB(
    userId,
    targetType,
    targetId,
    req.body.type,
    { id: userId, role: req.user.role },
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Reaction updated successfully.",
    data: summary,
  });
});

// Unified: remove the caller's reaction from a target.
const removeReaction = catchAsync(async (req, res) => {
  const { targetType, targetId } = req.params;
  const userId = req.user.id;

  if (!ReactService.isTargetType(targetType)) {
    sendResponse(res, {
      statusCode: 400,
      success: false,
      message: "Invalid target type. Use post, comment or short.",
      data: "",
    });
    return;
  }

  const summary = await ReactService.removeReactionFromDB(
    userId,
    targetType,
    targetId,
    { id: userId, role: req.user.role },
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Reaction removed successfully.",
    data: summary,
  });
});

// Aggregated counts per type + the caller's own reaction.
const getReactionSummary = catchAsync(async (req, res) => {
  const { targetType, targetId } = req.params;
  const userId = req.user.id;

  if (!ReactService.isTargetType(targetType)) {
    sendResponse(res, {
      statusCode: 400,
      success: false,
      message: "Invalid target type. Use post, comment or short.",
      data: "",
    });
    return;
  }

  const summary = await ReactService.getReactionSummary(
    userId,
    targetType,
    targetId,
    { requester: { id: userId, role: req.user.role } },
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Reaction summary retrieved successfully",
    data: summary,
  });
});

export const ReactController = {
  getAllLikes,
  getAllDislikes,
  like,
  unlike,
  dislike,
  undislike,
  setReaction,
  removeReaction,
  getReactionSummary,
};
