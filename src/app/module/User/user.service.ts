/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import httpStatus from "http-status";
import QueryBuilder from "../../builder/QueryBuilder";
import AppError from "../../errors/AppError";
import { User } from "./user.model";
import { UserSearchableFields } from "./user.utils";
import mongoose, { Types } from "mongoose";

const getAllUserFromDB = async (query: Record<string, any>) => {
  const usersQueryBuilder = new QueryBuilder(User.find(), query)
    .fields()
    .paginate()
    .sort()
    .filter()
    .search(UserSearchableFields);

  const result = await usersQueryBuilder.modelQuery;
  const meta = await usersQueryBuilder.countTotal();

  return {
    meta: meta,
    result: result,
  };
};

const getUserFromDB = async (id: string) => {
  const result = await User.findById(id);

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "This user not found");
  }

  return result;
};

// Follow a user with transaction
const followUser = async (
  userId: Types.ObjectId,
  followedUserId: Types.ObjectId
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (userId === followedUserId) {
      throw new AppError(httpStatus.BAD_REQUEST, "You cannot follow yourself.");
    }

    const followerObjectId = new mongoose.Types.ObjectId(userId);
    const followedObjectId = new mongoose.Types.ObjectId(followedUserId);

    const user = await User.findById(followerObjectId).session(session);
    const followedUser = await User.findById(followedObjectId).session(session);

    if (!user || !followedUser) {
      throw new AppError(httpStatus.NOT_FOUND, "User not found");
    }

    if (!user?.following?.includes(followedObjectId)) {
      user?.following?.push(followedObjectId);
    } else {
      throw new AppError(httpStatus.BAD_REQUEST, "You're already following");
    }

    if (!followedUser?.follower?.includes(followerObjectId)) {
      followedUser?.follower?.push(followerObjectId);
    } else {
      throw new AppError(httpStatus.BAD_REQUEST, "You're already following");
    }

    await user.save({ session });
    await followedUser.save({ session });

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    return {
      message: `You are now following ${followedUser.name}`,
    };
  } catch (error) {
    // If any error occurs, abort the transaction
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

// Unfollow a user with transaction
const unFollowUser = async (
  userId: Types.ObjectId,
  unFollowedUserId: Types.ObjectId
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const unFollowedUserObjectId = new mongoose.Types.ObjectId(
      unFollowedUserId
    );

    const user = await User.findById(userObjectId).session(session);
    const unFollowedUser = await User.findById(unFollowedUserObjectId).session(
      session
    );

    if (!user || !unFollowedUser) {
      throw new AppError(httpStatus.NOT_FOUND, "User not found");
    }

    const updateFollowingResult = await User.updateOne(
      { _id: userObjectId },
      { $pull: { following: unFollowedUserObjectId } },
      { session }
    );

    const updateFollowerResult = await User.updateOne(
      { _id: unFollowedUserObjectId },
      { $pull: { follower: userObjectId } },
      { session }
    );

    if (
      updateFollowingResult.modifiedCount === 0 ||
      updateFollowerResult.modifiedCount === 0
    ) {
      throw new AppError(httpStatus.BAD_REQUEST, "Unfollow action failed");
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    return {
      message: `You have unfollowed ${unFollowedUser.name}`,
    };
  } catch (error) {
    // If any error occurs, abort the transaction
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

export const UserServices = {
  getAllUserFromDB,
  getUserFromDB,
  followUser,
  unFollowUser,
};
