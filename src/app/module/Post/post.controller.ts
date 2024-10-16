import { PostService } from "./post.service";
import sendResponse from "../../utils/sendResponse";
import catchAsync from "../../utils/catchAsync";
import httpStatus from "http-status";

// Create a new post
const createPost = catchAsync(async (req, res) => {
  const post = await PostService.createPostIntoDB(req.body, req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Post created successfully",
    data: post,
  });
});

// Get a post by ID
const getPostById = catchAsync(async (req, res) => {
  const post = await PostService.getPostByIdFromDB(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Post retrieved successfully",
    data: post,
  });
});

// Get all posts
const getAllPosts = catchAsync(async (req, res) => {
  const { result, meta } = await PostService.getAllPostsFromDB(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Posts retrieved successfully",
    data: result,
    meta: meta,
  });
});

// Get all normal posts
const getAllPostsNormalForAnalytics = catchAsync(async (req, res) => {
  const { result, meta } = await PostService.getAllPostsNormalForAnalytics(
    req.query
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Normal posts retrieved successfully",
    meta: meta,
    data: result,
  });
});

// Get all premium posts
const getAllPostsPremiumForAnalytics = catchAsync(async (req, res) => {
  const { result, meta } = await PostService.getAllPostsPremiumForAnalytics(
    req.query
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Premium posts retrieved successfully",
    meta: meta,
    data: result,
  });
});

// Get all  premium posts
const getAllPremiumPosts = catchAsync(async (req, res) => {
  const result = await PostService.getAllPremiumPostsFromDB(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Premium posts retrieved successfully",
    data: result,
  });
});

// Update a post by ID
const updatePost = catchAsync(async (req, res) => {
  const post = await PostService.updatePostIntoDB(req.params.id, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Post updated successfully",
    data: post,
  });
});

// Delete a post by ID
const deletePost = catchAsync(async (req, res) => {
  const post = await PostService.deletePostFromDB(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Post deleted successfully",
    data: post,
  });
});

// Recover Delete a post by ID
const recoverPost = catchAsync(async (req, res) => {
  const post = await PostService.recoverPostFromDB(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Post recover successfully",
    data: post,
  });
});

// Report a post by ID
const reportPost = catchAsync(async (req, res) => {
  const post = await PostService.reportPostFromDB(
    req.params.id,
    req.body,
    req.user.id
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Report successful",
    data: post,
  });
});

export const PostControllers = {
  createPost,
  getPostById,
  getAllPosts,
  getAllPostsNormalForAnalytics,
  getAllPostsPremiumForAnalytics,
  getAllPremiumPosts,
  updatePost,
  deletePost,
  recoverPost,
  reportPost,
};
