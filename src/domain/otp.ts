import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors.js";

export function generateOtp(): string {
  return randomInt(100_000, 1_000_000).toString();
}

export function hashOtp(otp: string, secret: string): string {
  return createHmac("sha256", secret).update(otp).digest("hex");
}

export function verifyOtpHash(otp: string, expectedHash: string, secret: string): boolean {
  const suppliedHash = Buffer.from(hashOtp(otp, secret), "hex");
  const storedHash = Buffer.from(expectedHash, "hex");
  return suppliedHash.length === storedHash.length && timingSafeEqual(suppliedHash, storedHash);
}

export function validateOtpInput(input: unknown): string {
  if (typeof input !== "string" || !/^\d{6}$/.test(input.trim())) {
    throw new AppError(400, "INVALID_OTP_FORMAT", "The OTP must be exactly 6 digits.");
  }
  return input.trim();
}
