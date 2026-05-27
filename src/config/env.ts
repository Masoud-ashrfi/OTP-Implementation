import dotenv from "dotenv";

dotenv.config();

export type SmsDriver = "mock" | "gsm";

export interface AppConfig {
  port: number;
  nodeEnv: string;
  databasePath: string;
  otpSecret: string;
  otpExpirySeconds: number;
  otpResendCooldownSeconds: number;
  otpMaxAttempts: number;
  otpMaxSendsPerWindow: number;
  otpRateWindowMinutes: number;
  sessionExpiryHours: number;
  smsDriver: SmsDriver;
  showMockOtp: boolean;
  gsmDevicePath: string;
  gsmBaudRate: number;
}

function readInteger(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }
  return rawValue.toLowerCase() === "true";
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const otpSecret =
    process.env.OTP_SECRET ?? "development-only-secret-change-before-deployment";
  const smsDriverValue = process.env.SMS_DRIVER ?? "mock";

  if (smsDriverValue !== "mock" && smsDriverValue !== "gsm") {
    throw new Error("SMS_DRIVER must be either mock or gsm.");
  }
  const config: AppConfig = {
    port: readInteger("PORT", 3000),
    nodeEnv,
    databasePath: process.env.DATABASE_PATH ?? "./data/otp-auth.db",
    otpSecret,
    otpExpirySeconds: readInteger("OTP_EXPIRY_SECONDS", 300),
    otpResendCooldownSeconds: readInteger("OTP_RESEND_COOLDOWN_SECONDS", 60),
    otpMaxAttempts: readInteger("OTP_MAX_ATTEMPTS", 5),
    otpMaxSendsPerWindow: readInteger("OTP_MAX_SENDS_PER_WINDOW", 5),
    otpRateWindowMinutes: readInteger("OTP_RATE_WINDOW_MINUTES", 15),
    sessionExpiryHours: readInteger("SESSION_EXPIRY_HOURS", 12),
    smsDriver: smsDriverValue,
    showMockOtp: readBoolean("SHOW_MOCK_OTP", true),
    gsmDevicePath: process.env.GSM_DEVICE_PATH ?? "/dev/ttyUSB0",
    gsmBaudRate: readInteger("GSM_BAUD_RATE", 115200),
    ...overrides,
  };

  if (config.nodeEnv === "production" && config.otpSecret.includes("development-only")) {
    throw new Error("OTP_SECRET must be configured in production.");
  }
  if (config.nodeEnv === "production" && config.smsDriver === "mock") {
    throw new Error("SMS_DRIVER=mock is not permitted in production.");
  }

  return config;
}
