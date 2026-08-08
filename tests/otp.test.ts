import { describe, expect, it } from "vitest";
import { generateOtp, hashOtp, validateOtpInput, verifyOtpHash } from "../src/domain/otp.js";
import { normalizeAfghanPhoneNumber } from "../src/domain/phone.js";

describe("OTP primitives", () => {
  it("generates six digit OTP values", () => {
    for (let count = 0; count < 100; count += 1) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });

  it("stores a non-plain-text hash and verifies only the correct OTP", () => {
    const secret = "unit-test-secret-that-is-long-enough";
    const hash = hashOtp("420731", secret);

    expect(hash).not.toContain("420731");
    expect(verifyOtpHash("420731", hash, secret)).toBe(true);
    expect(verifyOtpHash("420732", hash, secret)).toBe(false);
  });

  it("accepts exactly six numeric digits as OTP input", () => {
    expect(validateOtpInput(" 420731 ")).toBe("420731");
    expect(() => validateOtpInput("12345")).toThrow();
    expect(() => validateOtpInput("1234567")).toThrow();
    expect(() => validateOtpInput("12a456")).toThrow();
  });

  it("normalizes supported Afghanistan mobile-number formats", () => {
    expect(normalizeAfghanPhoneNumber("070 123 4567")).toBe("+93701234567");
    expect(normalizeAfghanPhoneNumber("93701234567")).toBe("+93701234567");
    expect(normalizeAfghanPhoneNumber("0093701234567")).toBe("+93701234567");
    expect(normalizeAfghanPhoneNumber("+93701234567")).toBe("+93701234567");
    expect(() => normalizeAfghanPhoneNumber("+12025550123")).toThrow();
  });
});
