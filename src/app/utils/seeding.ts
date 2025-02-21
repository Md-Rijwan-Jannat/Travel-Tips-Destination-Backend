/* eslint-disable no-console */
import config from "../../config";
import { USER_ROLE, USER_STATUS } from "../module/User/user.constants";
import { User } from "../module/User/user.model";

export const seed = async () => {
  try {
    //atfirst check if the admin exist of not
    const admin = await User.findOne({
      role: USER_ROLE.ADMIN,
      email: config.admin_email,
      status: USER_STATUS.IN_PROGRESS,
    });
    if (!admin) {
      await User.create({
        name: "Md Rijwan",
        role: USER_ROLE.ADMIN,
        image: config.admin_image,
        email: config.admin_email,
        password: config.admin_password,
        status: USER_STATUS.IN_PROGRESS,
        follower: [],
        following: [],
        verified: true,
      });
      console.log("Admin created successfully...");
      console.log("Seeding completed...");
    }
  } catch (error) {
    console.log("Error in seeding", error);
  }
};
