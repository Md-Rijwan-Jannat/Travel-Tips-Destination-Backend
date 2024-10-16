import { QueryObj, TPost, TReport } from "./post.interface";
import { Post } from "./post.model";
import AppError from "../../errors/AppError";
import httpStatus from "http-status";
import QueryBuilder from "../../builder/QueryBuilder";
import { postSearchFields } from "./post.constants";
import mongoose from "mongoose";

// Create a new post
const createPostIntoDB = async (
  payload: TPost,
  userId: string
): Promise<TPost> => {
  const post = await Post.create({ ...payload, user: userId });
  return post;
};

// Get a post by ID
const getPostByIdFromDB = async (postId: string): Promise<TPost | null> => {
  const post = await Post.findById(postId).populate("user comments");
  if (!post || post.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Post not found");
  }
  return post;
};

// Get all posts for normal posts
const getAllPostsNormalForAnalytics = async (query: Record<string, any>) => {
  const postQueryBuilder = new QueryBuilder(
    Post.find({ isDeleted: false, status: "FREE" })
      .populate({
        path: "user",
      })
      .populate({
        path: "comments",
        populate: {
          path: "user",
          model: "User",
        },
      }),
    query
  )
    .search(postSearchFields)
    .sort()
    .fields()
    .filter()
    .paginate();

  const result = await postQueryBuilder.modelQuery;
  const meta = await postQueryBuilder.countTotal();

  // Return meta only if the role is ADMIN
  return { result: result, meta: meta };
};

// Get all posts for premium posts
const getAllPostsPremiumForAnalytics = async (query: Record<string, any>) => {
  const postQueryBuilder = new QueryBuilder(
    Post.find({ isDeleted: false, status: "PREMIUM" })
      .populate({
        path: "user",
      })
      .populate({
        path: "comments",
        populate: {
          path: "user",
          model: "User",
        },
      }),
    query
  )
    .search(postSearchFields)
    .sort()
    .fields()
    .filter()
    .paginate();

  const result = await postQueryBuilder.modelQuery;
  const meta = await postQueryBuilder.countTotal();

  // Return meta only if the role is ADMIN
  return { result: result, meta: meta };
};

// Get all posts (with optional filters)
const getAllPostsFromDB = async (query: Record<string, any>) => {
  const { categories } = query;

  let queryObj: QueryObj = { isDeleted: false, status: "FREE" };

  if (categories) {
    queryObj = {
      ...queryObj,
      category: { $in: categories || "" },
    };
  }

  // Build the post query
  const postQueryBuilder = new QueryBuilder(
    Post.find(queryObj)
      .populate({
        path: "user",
      })
      .populate({
        path: "comments",
        populate: {
          path: "user",
          model: "User",
        },
      }),
    query
  )
    .search(postSearchFields)
    .sort()
    .fields()
    .filter()
    .paginate();

  // Execute the query
  const result = await postQueryBuilder.modelQuery;
  const meta = await postQueryBuilder.countTotal();

  // Return result and meta (meta only if the role is ADMIN)
  return { result, meta };
};

// Get all premium posts (with optional filters)
const getAllPremiumPostsFromDB = async (query: Record<string, any>) => {
  const postQueryBuilder = new QueryBuilder(
    Post.find({ isDeleted: false, status: "PREMIUM" })
      .populate({
        path: "user",
      })
      .populate({
        path: "comments",
        populate: {
          path: "user",
          model: "User",
        },
      }),
    query
  )
    .search(postSearchFields)
    .sort()
    .fields()
    .filter();

  const result = await postQueryBuilder.modelQuery;

  // Return meta only if the role is ADMIN
  return result;
};

// Update a post by ID
const updatePostIntoDB = async (
  postId: string,
  payload: Partial<TPost>
): Promise<TPost | null> => {
  const post = await Post.findByIdAndUpdate(postId, payload, { new: true });
  if (!post || post.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Post not found");
  }
  return post;
};

// Delete a post by ID (soft delete)
const deletePostFromDB = async (postId: string): Promise<TPost | null> => {
  const post = await Post.findByIdAndUpdate(
    postId,
    { isDeleted: true },
    { new: true }
  );
  if (!post) {
    throw new AppError(httpStatus.NOT_FOUND, "Post not found");
  }
  return post;
};

// Delete a post by ID (soft delete)
const recoverPostFromDB = async (postId: string): Promise<TPost | null> => {
  const post = await Post.findByIdAndUpdate(
    postId,
    { isDeleted: false },
    { new: true }
  );
  if (!post) {
    throw new AppError(httpStatus.NOT_FOUND, "Post not found");
  }
  return post;
};

const reportPostFromDB = async (
  postId: string,
  payload: TReport,
  userId: string
): Promise<TPost | null> => {
  if (!mongoose.Types.ObjectId.isValid(postId)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid Post ID");
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid User ID");
  }

  // Find the post first to check the reportCount
  const post = await Post.findById(postId);

  if (!post) {
    throw new AppError(httpStatus.NOT_FOUND, "Post not found");
  }

  // Increment the report count
  const updatedReportCount = post.reportCount + 1;

  // If reportCount reaches 5, soft delete the post
  const isSoftDeleted = updatedReportCount >= 5;

  // Update the post with new report and report count
  const updatedPost = await Post.findByIdAndUpdate(
    postId,
    {
      $push: {
        report: {
          report: payload.report,
          user: userId,
          post: postId,
        },
      },
      reportCount: updatedReportCount,
      isDeleted: isSoftDeleted,
    },
    { new: true }
  );

  return updatedPost;
};

export const PostService = {
  createPostIntoDB,
  getPostByIdFromDB,
  getAllPostsPremiumForAnalytics,
  getAllPostsNormalForAnalytics,
  getAllPostsFromDB,
  getAllPremiumPostsFromDB,
  updatePostIntoDB,
  deletePostFromDB,
  recoverPostFromDB,
  reportPostFromDB,
};
