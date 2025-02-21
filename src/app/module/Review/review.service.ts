import QueryBuilder from "../../builder/QueryBuilder";
import AppError from "../../errors/AppError";
import { Review } from "./review.mnodel";

const createReview = async (userId: string, data: any) => {
  const review = await Review.create({ ...data, user: userId });
  return review;
};

const getReviews = async (query: Record<string, any>) => {
  const reviewQueryBuilder = new QueryBuilder(
    Review.find().populate({
      path: "user",
    }),
    query
  )
    .search(["content"])
    .sort()
    .fields()
    .filter()
    .paginate();

  // Execute the query
  const result = await reviewQueryBuilder.modelQuery;
  const meta = await reviewQueryBuilder.countTotal();

  return { result, meta };
};

const updateReview = async (reviewId: string, userId: string, data: any) => {
  const review = await Review.findOneAndUpdate(
    { _id: reviewId, user: userId },
    data,
    { new: true }
  );

  if (!review) throw new AppError(404, "Review not found or unauthorized");
  return review;
};

const deleteReview = async (reviewId: string, userId: string) => {
  const review = await Review.findOneAndDelete({ _id: reviewId, user: userId });

  if (!review) throw new AppError(404, "Review not found or unauthorized");
  return review;
};

export const ReviewService = {
  createReview,
  getReviews,
  updateReview,
  deleteReview,
};
