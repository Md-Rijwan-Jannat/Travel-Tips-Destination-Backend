import { Request, Response } from "express";
import { CommentService } from "./comment.service";
import sendResponse from "../../utils/sendResponse";
import catchAsync from "../../utils/catchAsync";
import httpStatus from "http-status";

// Add a new comment
const addComment = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.user;
  const comment = await CommentService.addCommentIntoDB(req.body, id);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Comment added successfully",
    data: comment,
  });
});

// Get all comment
const getAllComment = catchAsync(async (req: Request, res: Response) => {
  const comment = await CommentService.getAllCommentFromDB();
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Comments retrieved successfully",
    data: comment,
  });
});

// Get all comments for a post
const getCommentForPost = catchAsync(async (req: Request, res: Response) => {
  const comments = await CommentService.getCommentForPostFromDB(
    req.params.postId,
    req.query
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Comments retrieved successfully",
    data: comments,
  });
});

// Update a comment
const updateComment = catchAsync(async (req: Request, res: Response) => {
  const comment = await CommentService.updateCommentIntoDB(
    req.params.id,
    req.body
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Comment updated successfully",
    data: comment,
  });
});

// Delete a comment
const deleteComment = catchAsync(async (req: Request, res: Response) => {
  const comment = await CommentService.deleteCommentFromDB(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Comment deleted successfully",
    data: comment,
  });
});

// Reply to a comment
const replyToComment = catchAsync(async (req: Request, res: Response) => {
  const reply = await CommentService.replyToCommentFromDB(
    req.params.id,
    req.body,
    req.user.id
  );
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Reply added successfully",
    data: reply,
  });
});

export const CommentControllers = {
  addComment,
  getAllComment,
  getCommentForPost,
  updateComment,
  deleteComment,
  replyToComment,
};
