import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { AppError } from './error-handler';
import { prisma } from '../main';

const HMAC_TOLERANCE = parseInt(process.env.SDK_HMAC_TOLERANCE_SECONDS || '30', 10);

export function hmacGuard(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const apiKey = req.headers['x-oghub-api-key'] as string;
  const signature = req.headers['x-oghub-signature'] as string;
  const timestamp = req.headers['x-oghub-timestamp'] as string;

  if (!apiKey || !signature || !timestamp) {
    return next(new AppError('Missing SDK authentication headers', 401));
  }

  // Validate timestamp freshness
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (Math.abs(now - ts) > HMAC_TOLERANCE) {
    return next(new AppError('Request timestamp too old', 401));
  }

  // Look up app secret and validate
  prisma.developerApp
    .findUnique({ where: { apiKey } })
    .then((app) => {
      if (!app || !app.isActive) {
        return next(new AppError('Invalid API key', 401));
      }

      const body = JSON.stringify(req.body || {});
      const expected = crypto
        .createHmac('sha256', app.apiSecret)
        .update(timestamp + body)
        .digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return next(new AppError('Invalid signature', 401));
      }

      (req as any).developerApp = app;
      next();
    })
    .catch(next);
}
