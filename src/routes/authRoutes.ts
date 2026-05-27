import { Router, type NextFunction, type Request, type Response } from "express";
import type { AppConfig } from "../config/env.js";
import { AppError } from "../domain/errors.js";
import { rateLimit } from "../middleware/rateLimit.js";
import type { AuthService } from "../services/AuthService.js";
import type { SessionService } from "../services/SessionService.js";

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    handler(request, response).catch(next);
  };
}

function readSessionCookie(request: Request): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return undefined;
  }
  const sessionEntry = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("otp_session="));
  return sessionEntry ? decodeURIComponent(sessionEntry.slice("otp_session=".length)) : undefined;
}

function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `otp_session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

function publicUser(user: { fullName: string; phone: string }): { fullName: string; phone: string } {
  return { fullName: user.fullName, phone: user.phone };
}

export function createAuthRouter(
  authService: AuthService,
  sessions: SessionService,
  config: AppConfig,
): Router {
  const router = Router();
  const issueLimiter = rateLimit(8, 15 * 60 * 1000);
  const verifyLimiter = rateLimit(15, 15 * 60 * 1000);

  router.post(
    "/signup",
    issueLimiter,
    asyncRoute(async (request, response) => {
      const challenge = await authService.signup(request.body?.fullName, request.body?.phone);
      response.status(201).json({ message: "OTP sent. Please check your phone.", ...challenge });
    }),
  );

  router.post(
    "/login",
    issueLimiter,
    asyncRoute(async (request, response) => {
      const challenge = await authService.login(request.body?.phone);
      response.json({ message: "OTP sent. Please check your phone.", ...challenge });
    }),
  );

  router.post(
    "/resend",
    issueLimiter,
    asyncRoute(async (request, response) => {
      const challenge = await authService.resend(request.body?.challengeId);
      response.json({ message: "A new OTP has been sent.", ...challenge });
    }),
  );

  router.post(
    "/verify",
    verifyLimiter,
    (request: Request, response: Response, next: NextFunction): void => {
      try {
        const authenticated = authService.verify(request.body?.challengeId, request.body?.otp);
        const maxAgeSeconds = Math.floor((authenticated.session.expiresAt - Date.now()) / 1000);
        response.setHeader(
          "Set-Cookie",
          sessionCookie(authenticated.session.token, maxAgeSeconds, config.nodeEnv === "production"),
        );
        response.json({
          message: "Authentication successful.",
          user: publicUser(authenticated.user),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/me", (request, response, next) => {
    const user = sessions.authenticate(readSessionCookie(request));
    if (!user) {
      next(new AppError(401, "NOT_AUTHENTICATED", "Please log in to continue."));
      return;
    }
    response.json({ user: publicUser(user) });
  });

  router.post("/logout", (request, response) => {
    sessions.destroy(readSessionCookie(request));
    response.setHeader("Set-Cookie", sessionCookie("", 0, config.nodeEnv === "production"));
    response.json({ message: "You have been logged out." });
  });

  return router;
}
