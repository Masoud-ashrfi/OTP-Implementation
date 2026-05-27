import express, { type ErrorRequestHandler } from "express";
import { resolve } from "node:path";
import type { AppConfig } from "./config/env.js";
import type { AuthRepository } from "./db/AuthRepository.js";
import { AppError } from "./domain/errors.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { AuthService } from "./services/AuthService.js";
import { SessionService } from "./services/SessionService.js";
import type { SmsService } from "./services/sms/SmsService.js";

export interface AppDependencies {
  config: AppConfig;
  repository: AuthRepository;
  smsService: SmsService;
  exposeMockOtp?: boolean;
  now?: () => number;
}

export function createApp(dependencies: AppDependencies): express.Express {
  const app = express();
  const sessions = new SessionService(
    dependencies.repository,
    dependencies.config.sessionExpiryHours,
    dependencies.now,
  );
  const authService = new AuthService(
    dependencies.repository,
    dependencies.smsService,
    sessions,
    dependencies.config,
    dependencies.exposeMockOtp ?? false,
    dependencies.now,
  );

  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.use(express.json({ limit: "10kb" }));
  app.use(express.static(resolve(process.cwd(), "public")));
  app.use("/api/auth", createAuthRouter(authService, sessions, dependencies.config));
  app.get("/", (_request, response) => response.redirect("/login.html"));

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof AppError) {
      if (typeof error.details?.retryAfterSeconds === "number") {
        response.setHeader("Retry-After", error.details.retryAfterSeconds.toString());
      }
      response.status(error.status).json({
        error: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }

    console.error(error);
    response.status(500).json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." });
  };
  app.use(errorHandler);

  return app;
}
