import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import { ReviewService } from './review.service';
import sendResponse from '../../utils/sendResponse';

const createReview = catchAsync(async (req: Request, res: Response) => {
  const review = await ReviewService.createReview(req.user.id, req.body);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Review created successfully',
    data: review,
  });
});

const getReviews = catchAsync(async (req: Request, res: Response) => {
  const { result, meta } = await ReviewService.getReviews(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Reviews fetched successfully',
    data: result,
    meta: meta,
  });
});

const updateReview = catchAsync(async (req: Request, res: Response) => {
  const { reviewId } = req.params;
  const review = await ReviewService.updateReview(
    reviewId,
    req.user.id,
    req.body
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Review updated successfully',
    data: review,
  });
});

const deleteReview = catchAsync(async (req: Request, res: Response) => {
  const { reviewId } = req.params;
  await ReviewService.deleteReview(reviewId, req.user.id);

  sendResponse(res, {
    statusCode: 204,
    success: true,
    message: 'Review deleted successfully',
  });
});

export const ReviewController = {
  createReview,
  getReviews,
  updateReview,
  deleteReview,
};
