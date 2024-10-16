import httpStatus from "http-status";
import AppError from "../../errors/AppError";
import { User } from "../User/user.model";
import { TUpdateUser } from "./profile.interface";
import { USER_STATUS } from "../User/user.constants";
import { Post } from "../Post/post.model";
import QueryBuilder from "../../builder/QueryBuilder";
import { postSearchFields } from "../Post/post.constants";

// Get my profile by email
const getMyProfileFormDB = async (email: string) => {
  const user = await User.findOne({ email });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.status === USER_STATUS.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
  }

  return user;
};

// Update my profile by id and email
const updateMyProfileIntoDB = async (
  payload: Partial<TUpdateUser>,
  id: string,
  email: string
) => {
  const user = await User.findOne({ _id: id, email });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.status === USER_STATUS.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
  }

  // Update user profile
  const updatedUser = await User.findByIdAndUpdate(id, payload, { new: true });
  return updatedUser;
};

// Delete my profile by id and email
const deleteMyProfileFromDB = async (id: string, email: string) => {
  const user = await User.findOne({ _id: id, email });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.status === USER_STATUS.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
  }

  const result = await User.findByIdAndDelete(id);
  return result;
};

// Get my posts
const getMyPosts = async (id: string, query: Record<string, any>) => {
  const user = await User.findById(id);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.status === USER_STATUS.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
  }

  const postQueryBuilder = new QueryBuilder(
    Post.find({ user: user._id, isDeleted: false, status: "FREE" })
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
  return result;
};

// Get my premium posts
const getMyPremiumPosts = async (id: string, query: Record<string, any>) => {
  const user = await User.findById(id);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.status === USER_STATUS.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
  }

  const postQueryBuilder = new QueryBuilder(
    Post.find({ user: user._id, isDeleted: false, status: "PREMIUM" })
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
  return result;
};

const myFollowersFromDB = async (userId: string) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const followerIds = user.follower;

  const followers = await User.find({ _id: { $in: followerIds } });

  return followers;
};

const myFollowingFromDB = async (userId: string) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const followingIds = user.following;

  const following = await User.find({ _id: { $in: followingIds } });

  return following;
};

export const ProfileServices = {
  updateMyProfileIntoDB,
  getMyProfileFormDB,
  deleteMyProfileFromDB,
  getMyPosts,
  getMyPremiumPosts,
  myFollowersFromDB,
  myFollowingFromDB,
};
