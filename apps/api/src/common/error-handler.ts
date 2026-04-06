import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  data?: Record<string, any>;
  constructor(message: string, statusCode: number = 400, data?: Record<string, any>) {
    super(message);
    this.statusCode = statusCode;
    this.data = data;
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...err.data,
    });
  }

  console.error('Unhandled error:', err.message, err.stack);
  return res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
}
