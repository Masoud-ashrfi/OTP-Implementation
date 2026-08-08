import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app.js";
import { loadConfig, type AppConfig } from "../src/config/env.js";
import { AuthRepository } from "../src/db/AuthRepository.js";
import { createDatabase } from "../src/db/database.js";
import { MockSmsService } from "../src/services/sms/MockSmsService.js";
import type { SmsMessage, SmsService } from "../src/services/sms/SmsService.js";

interface TestContext {
  app: ReturnType<typeof createApp>;
  config: AppConfig;
  database: Database.Database;
  repository: AuthRepository;
  smsService: SmsService;
  advanceTime(milliseconds: number): void;
}

class FailingSmsService implements SmsService {
  async send(_message: SmsMessage): Promise<void> {
    throw new Error("simulated gateway failure");
  }
}

const databases: Database.Database[] = [];

function setup(
  configOverrides: Partial<AppConfig> = {},
  smsService: SmsService = new MockSmsService(),
): TestContext {
  let time = Date.now();
  const config = loadConfig({
    databasePath: ":memory:",
    otpSecret: "integration-test-secret-with-more-than-32-characters",
    otpExpirySeconds: 120,
    otpResendCooldownSeconds: 30,
    otpMaxAttempts: 3,
    otpLockoutSeconds: 60,
    otpMaxSendsPerWindow: 5,
    otpRateWindowMinutes: 15,
    sessionExpiryHours: 12,
    smsDriver: "mock",
    showMockOtp: true,
    ...configOverrides,
  });

  const database = createDatabase(":memory:");
  databases.push(database);
  const repository = new AuthRepository(database);
  const app = createApp({
    config,
    repository,
    smsService,
    exposeMockOtp: true,
    now: () => time,
  });

  return {
    app,
    config,
    database,
    repository,
    smsService,
    advanceTime(milliseconds: number) {
      time += milliseconds;
    },
  };
}

afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
});

describe("authentication API flow", () => {
  it("signs up, verifies an OTP, establishes a session, and permits OTP login", async () => {
    const { app, repository } = setup();

    const signup = await request(app)
      .post("/api/auth/signup")
      .send({ fullName: "Ahmad Rahimi", phone: "070 123 4567" })
      .expect(201);

    expect(signup.body.developmentOtp).toMatch(/^\d{6}$/);
    const stored = repository.findChallenge(signup.body.challengeId);
    expect(stored?.phone).toBe("+93701234567");
    expect(stored?.otpHash).not.toBe(signup.body.developmentOtp);

    const verification = await request(app)
      .post("/api/auth/verify")
      .send({ challengeId: signup.body.challengeId, otp: signup.body.developmentOtp })
      .expect(200);

    expect(verification.body.user.phone).toBe("+93701234567");
    const cookie = verification.headers["set-cookie"]?.[0];
    expect(cookie).toBeDefined();
    if (!cookie) {
      throw new Error("Verification did not issue a session cookie.");
    }

    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(200);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ phone: "+93701234567" })
      .expect(200);

    await request(app)
      .post("/api/auth/verify")
      .send({ challengeId: login.body.challengeId, otp: login.body.developmentOtp })
      .expect(200);
  });

  it("expires an OTP and allows a replacement after its cooldown", async () => {
    const { app, config, advanceTime } = setup({
      otpExpirySeconds: 10,
      otpResendCooldownSeconds: 5,
    });

    const signup = await request(app)
      .post("/api/auth/signup")
      .send({ fullName: "Mina", phone: "0791234567" })
      .expect(201);

    advanceTime((config.otpExpirySeconds + 1) * 1000);

    await request(app)
      .post("/api/auth/verify")
      .send({ challengeId: signup.body.challengeId, otp: signup.body.developmentOtp })
      .expect(410);

    const resend = await request(app)
      .post("/api/auth/resend")
      .send({ challengeId: signup.body.challengeId })
      .expect(200);

    expect(resend.body.challengeId).not.toBe(signup.body.challengeId);
  });

  it("enforces resend cooldown and prevents stale challenge resends and verification", async () => {
    const { app, config, advanceTime } = setup();

    const original = await request(app)
      .post("/api/auth/signup")
      .send({ fullName: "Farid", phone: "0781234567" })
      .expect(201);

    await request(app)
      .post("/api/auth/resend")
      .send({ challengeId: original.body.challengeId })
      .expect(429);

    advanceTime(config.otpResendCooldownSeconds * 1000);

    const latest = await request(app)
      .post("/api/auth/resend")
      .send({ challengeId: original.body.challengeId })
      .expect(200);

    const staleVerification = await request(app)
      .post("/api/auth/verify")
      .send({ challengeId: original.body.challengeId, otp: original.body.developmentOtp })
      .expect(400);

    expect(staleVerification.body.error).toBe("INVALID_CHALLENGE");

    advanceTime(config.otpResendCooldownSeconds * 1000);

    const staleResend = await request(app)
      .post("/api/auth/resend")
      .send({ challengeId: original.body.challengeId })
      .expect(400);

    expect(staleResend.body.error).toBe("INVALID_CHALLENGE");
    expect(latest.body.challengeId).not.toBe(original.body.challengeId);
  });

  it("keeps failed OTP attempts at subscriber scope across replacement challenges", async () => {
    const { app, config, repository, advanceTime } = setup({
      otpMaxAttempts: 3,
      otpLockoutSeconds: 60,
      otpResendCooldownSeconds: 1,
    });

    const signup = await request(app)
      .post("/api/auth/signup")
      .send({ fullName: "Laila", phone: "0771234567" })
      .expect(201);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(app)
        .post("/api/auth/verify")
        .send({ challengeId: signup.body.challengeId, otp: "111111" })
        .expect(400);
    }

    advanceTime(config.otpResendCooldownSeconds * 1000);

    const replacement = await request(app)
      .post("/api/auth/resend")
      .send({ challengeId: signup.body.challengeId })
      .expect(200);

    const locked = await request(app)
      .post("/api/auth/verify")
      .send({ challengeId: replacement.body.challengeId, otp: "111111" })
      .expect(429);

    expect(locked.body.error).toBe("OTP_LOCKED");

    const user = repository.findUserByPhone("+93771234567");
    expect(user).toBeDefined();
    if (!user) {
      throw new Error("Test user was not created.");
    }
    expect(repository.findOtpFailureState(user.id)?.failedAttempts).toBe(3);

    const blockedResend = await request(app)
      .post("/api/auth/resend")
      .send({ challengeId: replacement.body.challengeId })
      .expect(429);

    expect(blockedResend.body.error).toBe("OTP_LOCKED");

    advanceTime(config.otpLockoutSeconds * 1000 + 1);

    const afterLockout = await request(app)
      .post("/api/auth/resend")
      .send({ challengeId: replacement.body.challengeId })
      .expect(200);

    await request(app)
      .post("/api/auth/verify")
      .send({ challengeId: afterLockout.body.challengeId, otp: afterLockout.body.developmentOtp })
      .expect(200);

    expect(repository.findOtpFailureState(user.id)?.failedAttempts).toBe(0);
  });

  it("enforces the per-phone OTP issuance limit", async () => {
    const { app, config, advanceTime } = setup({
      otpMaxSendsPerWindow: 2,
      otpResendCooldownSeconds: 1,
    });

    const first = await request(app)
      .post("/api/auth/signup")
      .send({ fullName: "Sami", phone: "0761234567" })
      .expect(201);

    advanceTime(config.otpResendCooldownSeconds * 1000);

    const second = await request(app)
      .post("/api/auth/resend")
      .send({ challengeId: first.body.challengeId })
      .expect(200);

    advanceTime(config.otpResendCooldownSeconds * 1000);

    const limited = await request(app)
      .post("/api/auth/resend")
      .send({ challengeId: second.body.challengeId })
      .expect(429);

    expect(limited.body.error).toBe("OTP_RATE_LIMIT");
  });

  it("consumes a challenge when SMS delivery fails", async () => {
    const { app, repository } = setup({}, new FailingSmsService());

    const failure = await request(app)
      .post("/api/auth/signup")
      .send({ fullName: "Nadia", phone: "0751234567" })
      .expect(503);

    expect(failure.body.error).toBe("SMS_UNAVAILABLE");

    const user = repository.findUserByPhone("+93751234567");
    expect(user).toBeDefined();
    if (!user) {
      throw new Error("Test user was not created.");
    }

    const challenge = repository.findLatestChallenge(user.id, "signup");
    expect(challenge?.consumedAt).not.toBeNull();
  });

  it("does not allow a successfully used OTP challenge to be replayed", async () => {
    const { app } = setup();

    const signup = await request(app)
      .post("/api/auth/signup")
      .send({ fullName: "Omid", phone: "0741234567" })
      .expect(201);

    await request(app)
      .post("/api/auth/verify")
      .send({ challengeId: signup.body.challengeId, otp: signup.body.developmentOtp })
      .expect(200);

    const replay = await request(app)
      .post("/api/auth/verify")
      .send({ challengeId: signup.body.challengeId, otp: signup.body.developmentOtp })
      .expect(400);

    expect(replay.body.error).toBe("INVALID_CHALLENGE");
  });

  it("logs out by destroying the current server-side session", async () => {
    const { app } = setup();

    const signup = await request(app)
      .post("/api/auth/signup")
      .send({ fullName: "Maryam", phone: "0731234567" })
      .expect(201);

    const verification = await request(app)
      .post("/api/auth/verify")
      .send({ challengeId: signup.body.challengeId, otp: signup.body.developmentOtp })
      .expect(200);

    const cookie = verification.headers["set-cookie"]?.[0];
    expect(cookie).toBeDefined();
    if (!cookie) {
      throw new Error("Verification did not issue a session cookie.");
    }

    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(200);
    await request(app).post("/api/auth/logout").set("Cookie", cookie).expect(200);
    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(401);
  });

  it("rejects an expired server-side session", async () => {
    const { app, config, advanceTime } = setup({ sessionExpiryHours: 1 });

    const signup = await request(app)
      .post("/api/auth/signup")
      .send({ fullName: "Wali", phone: "0721234567" })
      .expect(201);

    const verification = await request(app)
      .post("/api/auth/verify")
      .send({ challengeId: signup.body.challengeId, otp: signup.body.developmentOtp })
      .expect(200);

    const cookie = verification.headers["set-cookie"]?.[0];
    expect(cookie).toBeDefined();
    if (!cookie) {
      throw new Error("Verification did not issue a session cookie.");
    }

    advanceTime(config.sessionExpiryHours * 60 * 60 * 1000 + 1);
    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(401);
  });

  it("rejects invalid phone numbers and invalid OTP formats", async () => {
    const { app } = setup();

    const invalidPhone = await request(app)
      .post("/api/auth/signup")
      .send({ fullName: "Test User", phone: "+12025550123" })
      .expect(400);

    expect(invalidPhone.body.error).toBe("INVALID_PHONE");

    const signup = await request(app)
      .post("/api/auth/signup")
      .send({ fullName: "Test User", phone: "0711234567" })
      .expect(201);

    const invalidOtp = await request(app)
      .post("/api/auth/verify")
      .send({ challengeId: signup.body.challengeId, otp: "12345" })
      .expect(400);

    expect(invalidOtp.body.error).toBe("INVALID_OTP_FORMAT");
  });

  it("prevents a verified phone number from being registered twice", async () => {
    const { app } = setup();

    const signup = await request(app)
      .post("/api/auth/signup")
      .send({ fullName: "Zahra", phone: "0707654321" })
      .expect(201);

    await request(app)
      .post("/api/auth/verify")
      .send({ challengeId: signup.body.challengeId, otp: signup.body.developmentOtp })
      .expect(200);

    const duplicate = await request(app)
      .post("/api/auth/signup")
      .send({ fullName: "Zahra Again", phone: "0707654321" })
      .expect(409);

    expect(duplicate.body.error).toBe("ALREADY_REGISTERED");
  });
});
