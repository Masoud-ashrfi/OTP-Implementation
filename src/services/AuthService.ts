import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config/env.js";
import type { AuthRepository, OtpPurpose, UserRecord } from "../db/AuthRepository.js";
import { AppError } from "../domain/errors.js";
import { generateOtp, hashOtp, validateOtpInput, verifyOtpHash } from "../domain/otp.js";
import { normalizeAfghanPhoneNumber } from "../domain/phone.js";
import type { SmsService } from "./sms/SmsService.js";
import { SessionService, type CreatedSession } from "./SessionService.js";

interface IssuedChallenge {
  challengeId: string;
  expiresAt: number;
  resendAvailableAt: number;
  developmentOtp?: string;
}

interface AuthenticationResult {
  user: UserRecord;
  session: CreatedSession;
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly smsService: SmsService,
    private readonly sessionService: SessionService,
    private readonly config: AppConfig,
    private readonly exposeMockOtp: boolean,
    private readonly now: () => number = Date.now,
  ) {}

  async signup(fullNameInput: unknown, phoneInput: unknown): Promise<IssuedChallenge> {
    const fullName = this.validateName(fullNameInput);
    const phone = normalizeAfghanPhoneNumber(phoneInput);
    const now = this.now();
    let user = this.repository.findUserByPhone(phone);

    if (user?.verifiedAt) {
      throw new AppError(409, "ALREADY_REGISTERED", "This phone number is already registered. Please log in.");
    }

    if (user) {
      this.repository.updatePendingUserName(user.id, fullName, now);
      user = { ...user, fullName, updatedAt: now };
    } else {
      user = {
        id: randomUUID(),
        fullName,
        phone,
        verifiedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.repository.createUser(user);
    }

    return this.issueChallenge(user, "signup");
  }

  async login(phoneInput: unknown): Promise<IssuedChallenge> {
    const phone = normalizeAfghanPhoneNumber(phoneInput);
    const user = this.repository.findUserByPhone(phone);

    if (!user?.verifiedAt) {
      throw new AppError(404, "ACCOUNT_NOT_FOUND", "No verified account was found for this phone number.");
    }

    return this.issueChallenge(user, "login");
  }

  async resend(challengeIdInput: unknown): Promise<IssuedChallenge> {
    const challengeId = this.validateChallengeId(challengeIdInput);
    const challenge = this.repository.findChallenge(challengeId);
    const now = this.now();

    if (!challenge) {
      throw new AppError(400, "INVALID_CHALLENGE", "This verification request is no longer active.");
    }
    const latestChallenge = this.repository.findLatestChallenge(challenge.userId, challenge.purpose);
    if (latestChallenge?.id !== challenge.id) {
      throw new AppError(400, "INVALID_CHALLENGE", "Use the most recently sent OTP or request a new login.");
    }
    if (now < challenge.resendAvailableAt) {
      const waitSeconds = Math.ceil((challenge.resendAvailableAt - now) / 1000);
      throw new AppError(429, "RESEND_COOLDOWN", `Please wait ${waitSeconds} seconds before requesting another OTP.`, {
        retryAfterSeconds: waitSeconds,
      });
    }

    const user = this.repository.findUserById(challenge.userId);
    if (!user) {
      throw new AppError(400, "INVALID_CHALLENGE", "This verification request is no longer active.");
    }

    return this.issueChallenge(user, challenge.purpose);
  }

  verify(challengeIdInput: unknown, otpInput: unknown): AuthenticationResult {
    const challengeId = this.validateChallengeId(challengeIdInput);
    const otp = validateOtpInput(otpInput);
    const challenge = this.repository.findChallenge(challengeId);
    const now = this.now();

    if (!challenge || challenge.consumedAt) {
      throw new AppError(400, "INVALID_CHALLENGE", "This verification request is no longer active.");
    }
    if (challenge.expiresAt <= now) {
      this.repository.consumeChallenge(challenge.id, now);
      throw new AppError(410, "OTP_EXPIRED", "This OTP has expired. Please request a new one.");
    }
    if (challenge.attempts >= this.config.otpMaxAttempts) {
      throw new AppError(429, "OTP_LOCKED", "Too many incorrect attempts. Please request a new OTP.");
    }

    if (!verifyOtpHash(otp, challenge.otpHash, this.config.otpSecret)) {
      const attempts = challenge.attempts + 1;
      const locked = attempts >= this.config.otpMaxAttempts;
      this.repository.recordFailedAttempt(challenge.id, attempts, locked ? now : null);
      const message = locked
        ? "Too many incorrect attempts. Please request a new OTP."
        : "The OTP is incorrect. Please try again.";
      throw new AppError(locked ? 429 : 400, locked ? "OTP_LOCKED" : "INCORRECT_OTP", message);
    }

    this.repository.consumeChallenge(challenge.id, now);
    const user = this.repository.findUserById(challenge.userId);
    if (!user) {
      throw new AppError(400, "INVALID_CHALLENGE", "This verification request is no longer active.");
    }
    if (challenge.purpose === "signup" && !user.verifiedAt) {
      this.repository.markUserVerified(user.id, now);
      user.verifiedAt = now;
    }

    return { user, session: this.sessionService.create(user.id) };
  }

  private async issueChallenge(user: UserRecord, purpose: OtpPurpose): Promise<IssuedChallenge> {
    const now = this.now();
    const rateWindowStart = now - this.config.otpRateWindowMinutes * 60 * 1000;
    if (this.repository.countChallengesSince(user.phone, rateWindowStart) >= this.config.otpMaxSendsPerWindow) {
      throw new AppError(
        429,
        "OTP_RATE_LIMIT",
        "Too many OTP requests for this phone number. Please try again later.",
      );
    }

    const otp = generateOtp();
    const challenge = {
      id: randomUUID(),
      userId: user.id,
      phone: user.phone,
      purpose,
      otpHash: hashOtp(otp, this.config.otpSecret),
      attempts: 0,
      expiresAt: now + this.config.otpExpirySeconds * 1000,
      resendAvailableAt: now + this.config.otpResendCooldownSeconds * 1000,
      consumedAt: null,
      createdAt: now,
    };

    this.repository.invalidateOpenChallenges(user.id, purpose, now);
    this.repository.createChallenge(challenge);

    try {
      await this.smsService.send({
        to: user.phone,
        body: `Your Monograph OTP is ${otp}. It expires in ${Math.ceil(this.config.otpExpirySeconds / 60)} minutes.`,
      });
    } catch {
      this.repository.consumeChallenge(challenge.id, now);
      throw new AppError(503, "SMS_UNAVAILABLE", "OTP delivery is unavailable. Please try again later.");
    }

    return {
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt,
      resendAvailableAt: challenge.resendAvailableAt,
      ...(this.exposeMockOtp ? { developmentOtp: otp } : {}),
    };
  }

  private validateName(input: unknown): string {
    if (typeof input !== "string" || input.trim().length < 2 || input.trim().length > 80) {
      throw new AppError(400, "INVALID_NAME", "Please enter your full name (2 to 80 characters).");
    }
    return input.trim();
  }

  private validateChallengeId(input: unknown): string {
    if (typeof input !== "string" || input.trim().length === 0) {
      throw new AppError(400, "INVALID_CHALLENGE", "A verification request is required.");
    }
    return input.trim();
  }
}
