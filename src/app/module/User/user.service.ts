/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import httpStatus from "http-status";
import QueryBuilder from "../../builder/QueryBuilder";
import AppError from "../../errors/AppError";
import { User } from "./user.model";
import { UserSearchableFields } from "./user.utils";

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

export const UserServices = {
  getAllUserFromDB,
  getUserFromDB,
};
