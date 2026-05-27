import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app.js";
import { loadConfig, type AppConfig } from "../src/config/env.js";
import { AuthRepository } from "../src/db/AuthRepository.js";
import { createDatabase } from "../src/db/database.js";
import { MockSmsService } from "../src/services/sms/MockSmsService.js";

interface TestContext {
  app: ReturnType<typeof createApp>;
  config: AppConfig;
  database: Database.Database;
  repository: AuthRepository;
  advanceTime(milliseconds: number): void;
}

const databases: Database.Database[] = [];

function setup(configOverrides: Partial<AppConfig> = {}): TestContext {
  let time = Date.now();
  const config = loadConfig({
    databasePath: ":memory:",
    otpSecret: "integration-test-secret-with-more-than-32-characters",
    otpExpirySeconds: 120,
    otpResendCooldownSeconds: 30,
    otpMaxAttempts: 3,
    otpMaxSendsPerWindow: 5,
    ...configOverrides,
  });
  const database = createDatabase(":memory:");
  databases.push(database);
  const repository = new AuthRepository(database);
  const app = createApp({
    config,
    repository,
    smsService: new MockSmsService(),
    exposeMockOtp: true,
    now: () => time,
  });

  return {
    app,
    config,
    database,
    repository,
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
    const { app, config, advanceTime } = setup({ otpExpirySeconds: 10, otpResendCooldownSeconds: 5 });
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

  it("enforces resend cooldown and prevents stale challenge resends", async () => {
    const { app, config, advanceTime } = setup();
    const original = await request(app)
      .post("/api/auth/signup")
      .send({ fullName: "Farid", phone: "0781234567" })
      .expect(201);

    await request(app).post("/api/auth/resend").send({ challengeId: original.body.challengeId }).expect(429);
    advanceTime(config.otpResendCooldownSeconds * 1000);
    const latest = await request(app)
      .post("/api/auth/resend")
      .send({ challengeId: original.body.challengeId })
      .expect(200);

    advanceTime(config.otpResendCooldownSeconds * 1000);
    const staleAttempt = await request(app)
      .post("/api/auth/resend")
      .send({ challengeId: original.body.challengeId })
      .expect(400);
    expect(staleAttempt.body.error).toBe("INVALID_CHALLENGE");
    expect(latest.body.challengeId).not.toBe(original.body.challengeId);
  });

  it("locks an OTP challenge after repeated incorrect guesses", async () => {
    const { app } = setup({ otpMaxAttempts: 3 });
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
    const locked = await request(app)
      .post("/api/auth/verify")
      .send({ challengeId: signup.body.challengeId, otp: "111111" })
      .expect(429);
    expect(locked.body.error).toBe("OTP_LOCKED");

    await request(app)
      .post("/api/auth/verify")
      .send({ challengeId: signup.body.challengeId, otp: signup.body.developmentOtp })
      .expect(400);
  });
});
