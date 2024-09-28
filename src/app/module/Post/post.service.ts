import { TPost } from "./post.interface";
import { Post } from "./post.model";
import AppError from "../../errors/AppError";
import httpStatus from "http-status";
import QueryBuilder from "../../builder/QueryBuilder";
import { postSearchFelids } from "./post.constants";

// Create a new post
const createPostIntoDB = async (payload: TPost): Promise<TPost> => {
  const post = await Post.create(payload);
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
  console.log("posId", postId);
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

export const PostService = {
  createPostIntoDB,
  getPostByIdFromDB,
  getAllPostsFromDB,
  updatePostIntoDB,
  deletePostFromDB,
  recoverPostFromDB,
};
