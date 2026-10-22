"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
/* eslint-disable @typescript-eslint/no-this-alias */
const bcrypt_1 = __importDefault(require("bcrypt"));
const mongoose_1 = require("mongoose");
const config_1 = __importDefault(require("../../../config"));
const userSchema = new mongoose_1.Schema({
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
    bio: {
        type: String,
        trim: true,
    },
    password: {
        type: String,
        // Never returned by queries/find/update results; only flows that must
        // compare hashes opt in with `.select("+password")` (e.g. login).
        select: false,
    },
    image: {
        type: String,
        trim: true,
    },
    role: {
        type: String,
        enum: ['ADMIN', 'USER'],
        default: 'USER',
        trim: true,
    },
    status: {
        type: String,
        enum: ['IN_PROGRESS', 'BLOCKED'],
        default: 'IN_PROGRESS',
        trim: true,
    },
    follower: [
        {
            type: mongoose_1.Types.ObjectId,
        },
    ],
    following: [
        {
            type: mongoose_1.Types.ObjectId,
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
    isActive: {
        type: Boolean,
        default: false,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});
exports.default = userSchema;
// Pre-save hook for password hashing
userSchema.pre('save', function (next) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = this; // Cast this as TUserDocument
        // Hash the password only if it has been modified or is new
        if (user.isModified('password')) {
            user.password = yield bcrypt_1.default.hash(user === null || user === void 0 ? void 0 : user.password, Number(config_1.default.bcrypt_salt_rounds));
        }
        next();
    });
});
// Post-save hook: drop the password from the returned document entirely so it
// is never serialized into an API response (previously set to an empty string,
// which still emitted a `password` key).
userSchema.post('save', function (doc, next) {
    doc.password = undefined;
    next();
});
// Static method to find user by email (password is excluded by schema default)
userSchema.statics.isUserExistsByEmail = function (email) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield exports.User.findOne({ email });
    });
};
// Static method to compare passwords
userSchema.statics.isPasswordMatched = function (plainTextPassword, hashedPassword) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield bcrypt_1.default.compare(plainTextPassword, hashedPassword);
    });
};
// Static method to check if the JWT was issued before the password was changed
userSchema.statics.isJWTIssuedBeforePasswordChanged = function (passwordChangedTimestamp, jwtIssuedTimestamp) {
    const passwordChangedTime = new Date(passwordChangedTimestamp).getTime() / 1000;
    return passwordChangedTime > jwtIssuedTimestamp;
};
// Exporting the User model
exports.User = (0, mongoose_1.model)('User', userSchema);
