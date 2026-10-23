import httpStatus from "http-status";
import { Request } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { ShortService } from "./short.service";

const requesterOf = (req: Request): { id: string; role: string } => ({
  id: String(req.user.id),
  role: String(req.user.role),
});

const createShort = catchAsync(async (req, res) => {
  const short = await ShortService.createShortIntoDB(req.body, requesterOf(req));
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Short uploaded successfully",
    data: short,
  });
});

const getAllShorts = catchAsync(async (req, res) => {
  const { result, meta } = await ShortService.getShortsFeedFromDB(
    req.query as Record<string, unknown>,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shorts retrieved successfully",
    meta,
    data: result,
  });
});

const getSingleShort = catchAsync(async (req, res) => {
  const short = await ShortService.getSingleShortFromDB(
    req.params.shortId,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Short retrieved successfully",
    data: short,
  });
});

const updateShort = catchAsync(async (req, res) => {
  const short = await ShortService.updateShortIntoDB(
    req.params.shortId,
    req.body,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Short updated successfully",
    data: short,
  });
});

const deleteShort = catchAsync(async (req, res) => {
  await ShortService.deleteShortFromDB(req.params.shortId, requesterOf(req));
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Short deleted successfully",
  });
});

const viewShort = catchAsync(async (req, res) => {
  const data = await ShortService.viewShortIntoDB(req.params.shortId, requesterOf(req));
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    data,
  });
});

const likeShort = catchAsync(async (req, res) => {
  const data = await ShortService.likeShortIntoDB(req.params.shortId, requesterOf(req));
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Short liked",
    data,
  });
});

const unlikeShort = catchAsync(async (req, res) => {
  const data = await ShortService.unlikeShortIntoDB(req.params.shortId, requesterOf(req));
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Short like removed",
    data,
  });
});

const reportShort = catchAsync(async (req, res) => {
  const data = await ShortService.reportShortIntoDB(
    req.params.shortId,
    req.body.reason,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Report submitted",
    data,
  });
});

const purgeShort = catchAsync(async (req, res) => {
  await ShortService.purgeShortFromDB(req.params.shortId, requesterOf(req));
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Short permanently removed",
  });
});

const moderateShort = catchAsync(async (req, res) => {
  const short = await ShortService.moderateShortIntoDB(
    req.params.id,
    req.params.shortId,
    req.params.action as "approve" | "reject" | "remove",
    req.body?.reason,
    requesterOf(req),
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Short moderated",
    data: short,
  });
});

export const ShortController = {
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
