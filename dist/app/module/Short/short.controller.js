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
exports.ShortController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const short_service_1 = require("./short.service");
const requesterOf = (req) => ({
    id: String(req.user.id),
    role: String(req.user.role),
});
const createShort = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const short = yield short_service_1.ShortService.createShortIntoDB(req.body, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: "Short uploaded successfully",
        data: short,
    });
}));
const getAllShorts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { result, meta } = yield short_service_1.ShortService.getShortsFeedFromDB(req.query, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Shorts retrieved successfully",
        meta,
        data: result,
    });
}));
const getSingleShort = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const short = yield short_service_1.ShortService.getSingleShortFromDB(req.params.shortId, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Short retrieved successfully",
        data: short,
    });
}));
const updateShort = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const short = yield short_service_1.ShortService.updateShortIntoDB(req.params.shortId, req.body, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Short updated successfully",
        data: short,
    });
}));
const deleteShort = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield short_service_1.ShortService.deleteShortFromDB(req.params.shortId, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Short deleted successfully",
    });
}));
const viewShort = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield short_service_1.ShortService.viewShortIntoDB(req.params.shortId, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        data,
    });
}));
const likeShort = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield short_service_1.ShortService.likeShortIntoDB(req.params.shortId, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Short liked",
        data,
    });
}));
const unlikeShort = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield short_service_1.ShortService.unlikeShortIntoDB(req.params.shortId, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Short like removed",
        data,
    });
}));
const reportShort = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield short_service_1.ShortService.reportShortIntoDB(req.params.shortId, req.body.reason, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Report submitted",
        data,
    });
}));
const purgeShort = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield short_service_1.ShortService.purgeShortFromDB(req.params.shortId, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Short permanently removed",
    });
}));
const moderateShort = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const short = yield short_service_1.ShortService.moderateShortIntoDB(req.params.id, req.params.shortId, req.params.action, (_a = req.body) === null || _a === void 0 ? void 0 : _a.reason, requesterOf(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: "Short moderated",
        data: short,
    });
}));
exports.ShortController = {
    createShort,
    getAllShorts,
    getSingleShort,
    updateShort,
    deleteShort,
    viewShort,
    likeShort,
    unlikeShort,
    reportShort,
    purgeShort,
    moderateShort,
};
