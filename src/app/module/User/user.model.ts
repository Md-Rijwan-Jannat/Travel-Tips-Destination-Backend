/* eslint-disable @typescript-eslint/no-this-alias */
import bcrypt from "bcrypt";
import { Schema, Types, model, Document } from "mongoose";
import config from "../../../config";
import { TUser, TUserModel } from "./user.interface";

// Extend the Mongoose Document interface for the 'this' context in hooks
interface TUserDocument extends TUser, Document {}

const userSchema = new Schema<TUser, TUserModel>(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
    },
    image: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: ["ADMIN", "USER"],
      default: "USER",
      trim: true,
    },
    status: {
      type: String,
      enum: ["IN_PROGRESS", "BLOCKED"],
      default: "IN_PROGRESS",
      trim: true,
    },
    follower: [
      {
        type: Types.ObjectId,
      },
    ],
    following: [
      {
        type: Types.ObjectId,
      },
    ],
    verified: {
      type: Boolean,
      default: false,
    },
    country: {
      type: String,
      default: null,
      trim: true,
    },
    address: {
      type: String,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export default userSchema;

// Pre-save hook for password hashing
userSchema.pre("save", async function (next) {
  const user = this as TUserDocument; // Cast this as TUserDocument

  // Hash the password only if it has been modified or is new
  if (user.isModified("password")) {
    user.password = await bcrypt.hash(
      user?.password as string,
      Number(config.bcrypt_salt_rounds)
    );
  }
  next();
});

// Post-save hook to avoid returning the password
userSchema.post("save", function (doc, next) {
  doc.password = "";
  next();
});

// Static method to find user by email with password
userSchema.statics.isUserExistsByEmail = async function (email: string) {
  return await User.findOne({ email }).select("+password");
};

// Static method to compare passwords
userSchema.statics.isPasswordMatched = async function (
  plainTextPassword: string,
  hashedPassword: string
) {
  return await bcrypt.compare(plainTextPassword, hashedPassword);
};

// Static method to check if the JWT was issued before the password was changed
userSchema.statics.isJWTIssuedBeforePasswordChanged = function (
  passwordChangedTimestamp: Date,
  jwtIssuedTimestamp: number
) {
  const passwordChangedTime =
    new Date(passwordChangedTimestamp).getTime() / 1000;
  return passwordChangedTime > jwtIssuedTimestamp;
};

// Exporting the User model
export const User = model<TUser, TUserModel>("User", userSchema);
