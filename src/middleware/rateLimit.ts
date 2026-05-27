import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AppError } from "../domain/errors.js";

interface Bucket {
  count: number;
  resetAt: number;
}

export function rateLimit(maxRequests: number, windowMs: number): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (request: Request, _response: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = request.ip ?? request.socket.remoteAddress ?? "unknown";
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (current.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
      next(
        new AppError(429, "RATE_LIMITED", "Too many requests. Please try again later.", {
          retryAfterSeconds,
        }),
      );
      return;
    }

    current.count += 1;
    next();
  };
}
