/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { User } from "./user.model";

const getAllUserFromDB = async () => {
  const result = await User.find();
  return result;
};

export const UserServices = {
  getAllUserFromDB,
};
