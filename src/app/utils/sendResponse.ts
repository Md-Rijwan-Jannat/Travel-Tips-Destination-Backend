import { Response } from 'express';

type TMeta = {
  limit: number;
  page: number;
  total: number;
  // QueryBuilder.countTotal returns `totalPage`; the chat list returns
  // `totalPages`. Both optional so either spelling can be forwarded as-is.
  totalPage?: number;
  totalPages?: number;
};

type TResponse<T> = {
  statusCode: number;
  success: boolean;
  message?: string;
  meta?: TMeta;
  data?: T;
};

const sendResponse = <T>(res: Response, data: TResponse<T>) => {
  res.status(data?.statusCode).json({
    success: data.success,
    message: data.message,
    meta: data.meta,
    data: data.data,
  });
};

export default sendResponse;
