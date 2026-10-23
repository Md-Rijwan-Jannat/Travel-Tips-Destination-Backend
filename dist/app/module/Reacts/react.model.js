"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.React = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const react_interface_1 = require("./react.interface");
const reactSchema = new mongoose_1.Schema({
    user: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "User", required: true },
    post: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "Post" },
    comment: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "Comment" },
    short: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "Short" },
    type: { type: String, enum: react_interface_1.REACT_STORE_TYPES, required: true },
}, { timestamps: true });
// Uniqueness: at most one reaction per user per target (partial indexes —
// only rows where the field exists participate, so a react is bound to
// exactly one target kind). These constraints make concurrent duplicate
// reactions impossible at the database level.
reactSchema.index({ user: 1, post: 1 }, { unique: true, partialFilterExpression: { post: { $type: "objectId" } } });
reactSchema.index({ user: 1, comment: 1 }, { unique: true, partialFilterExpression: { comment: { $type: "objectId" } } });
reactSchema.index({ user: 1, short: 1 }, { unique: true, partialFilterExpression: { short: { $type: "objectId" } } });
// Summary aggregation hot path: counts by type for one target.
reactSchema.index({ post: 1, type: 1 });
reactSchema.index({ comment: 1, type: 1 });
reactSchema.index({ short: 1, type: 1 });
exports.React = mongoose_1.default.model("React", reactSchema);
