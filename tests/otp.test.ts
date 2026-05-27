import { describe, expect, it } from "vitest";
import { generateOtp, hashOtp, verifyOtpHash } from "../src/domain/otp.js";

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
});
