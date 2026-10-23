import { PostService } from './post.service';
import sendResponse from '../../utils/sendResponse';
import catchAsync from '../../utils/catchAsync';
import httpStatus from 'http-status';

// Create a new post
const createPost = catchAsync(async (req, res) => {
  const post = await PostService.createPostIntoDB(req.body, req.user.id, {
    id: req.user.id,
    role: req.user.role,
  });
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Post created successfully',
    data: post,
  });
});

// Get a post by ID
const getPostById = catchAsync(async (req, res) => {
  const post = await PostService.getPostByIdFromDB(req.params.id, {
    id: req.user.id,
    role: req.user.role,
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Post retrieved successfully',
    data: post,
  });
});

// Get all posts
const getAllPosts = catchAsync(async (req, res) => {
  const { result, meta } = await PostService.getAllPostsFromDB(req.query, {
    id: req.user.id,
    role: req.user.role,
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Posts retrieved successfully',
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
    message: 'Normal posts retrieved successfully',
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
    message: 'Premium posts retrieved successfully',
    meta: meta,
    data: result,
  });
});

// Get all  premium posts
const getAllPremiumPosts = catchAsync(async (req, res) => {
  const { result, meta } = await PostService.getAllPremiumPostsFromDB(
    req.query,
    { id: req.user.id, role: req.user.role }
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Premium posts retrieved successfully',
    meta: meta,
    data: result,
  });
});

// Pin/unpin a post to the owner's profile (owner or admin only)
const setPin = catchAsync(async (req, res) => {
  const pinned = req.body.pinned === true;
  const post = await PostService.setProfilePinFromDB(req.params.id, pinned, {
    id: req.user.id,
    role: req.user.role,
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: pinned ? 'Post pinned' : 'Post unpinned',
    data: post,
  });
});

// Feature/unfeature a post on the owner's profile (owner or admin only)
const setFeature = catchAsync(async (req, res) => {
  const featured = req.body.featured === true;
  const post = await PostService.setProfileFeatureFromDB(
    req.params.id,
    featured,
    { id: req.user.id, role: req.user.role }
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: featured ? 'Post featured' : 'Post unfeatured',
    data: post,
  });
});

// Pin/unpin a post inside its community group (group staff only)
const setGroupPin = catchAsync(async (req, res) => {
  const post = await PostService.setGroupPinFromDB(
    req.params.id,
    req.body.pinned === true,
    { id: req.user.id, role: req.user.role }
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Group pin updated',
    data: post,
  });
});

// Hide a post from the caller's own feed (never affects other viewers)
const hidePost = catchAsync(async (req, res) => {
  const result = await PostService.hidePostForUserFromDB(
    req.params.id,
    req.user.id,
    { id: req.user.id, role: req.user.role }
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Post hidden from your feed',
    data: result,
  });
});

// Undo a per-user hide
const unhidePost = catchAsync(async (req, res) => {
  const result = await PostService.unhidePostForUserFromDB(
    req.params.id,
    req.user.id
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Post restored to your feed',
    data: result,
  });
});

// Persist the post owner's comment ordering + featured-comment policy
const updateCommentSettings = catchAsync(async (req, res) => {
  const post = await PostService.updateCommentSettingsFromDB(
    req.params.id,
    req.body,
    { id: req.user.id, role: req.user.role }
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Comment settings updated',
    data: post.commentSettings ?? null,
  });
});

// Update a post by ID
const updatePost = catchAsync(async (req, res) => {
  const post = await PostService.updatePostIntoDB(req.params.id, req.body, {
    id: req.user.id,
    role: req.user.role,
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Post updated successfully',
    data: post,
  });
});

// Delete a post by ID
const deletePost = catchAsync(async (req, res) => {
  const post = await PostService.deletePostFromDB(req.params.id, {
    id: req.user.id,
    role: req.user.role,
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Post deleted successfully',
    data: post,
  });
});

// Recover Delete a post by ID
const recoverPost = catchAsync(async (req, res) => {
  const post = await PostService.recoverPostFromDB(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Post recover successfully',
    data: post,
  });
});

// Report a post by ID
const reportPost = catchAsync(async (req, res) => {
  const post = await PostService.reportPostFromDB(
    req.params.id,
    req.body,
    req.user.id,
    { id: req.user.id, role: req.user.role }
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Report successful',
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
  setPin,
  setFeature,
  setGroupPin,
  hidePost,
  unhidePost,
  updateCommentSettings,
};
