import { TPost, TReport } from "./post.interface";
import { Post } from "./post.model";
import AppError from "../../errors/AppError";
import httpStatus from "http-status";
import QueryBuilder from "../../builder/QueryBuilder";
import { postSearchFelids } from "./post.constants";
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

// Get all posts (with optional filters)
const getAllPostsFromDB = async (
  query: Record<string, any>
): Promise<TPost[]> => {
  const postQueryBuilder = new QueryBuilder(
    Post.find({ isDeleted: false }).populate("user comments"),
    query
  )
    .search(postSearchFelids)
    .sort()
    .fields()
    .filter();

  const posts = await postQueryBuilder.modelQuery;

  return posts;
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
          user: userId, // Assuming userId is already a valid ObjectId
          post: postId,
        },
      },
      reportCount: updatedReportCount,
      isDeleted: isSoftDeleted, // Mark as soft deleted if reportCount >= 5
    },
    { new: true }
  );

  return updatedPost;
};

export const PostService = {
  createPostIntoDB,
  getPostByIdFromDB,
  getAllPostsFromDB,
  updatePostIntoDB,
  deletePostFromDB,
  recoverPostFromDB,
  reportPostFromDB,
};
