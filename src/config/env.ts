import dotenv from "dotenv";

dotenv.config();

export type SmsDriver = "mock" | "gsm" | "android";

export interface AppConfig {
  port: number;
  nodeEnv: string;
  databasePath: string;
  otpSecret: string;
  otpExpirySeconds: number;
  otpResendCooldownSeconds: number;
  otpMaxAttempts: number;
  otpLockoutSeconds: number;
  otpMaxSendsPerWindow: number;
  otpRateWindowMinutes: number;
  sessionExpiryHours: number;
  smsDriver: SmsDriver;
  showMockOtp: boolean;
  gsmDevicePath: string;
  gsmBaudRate: number;
  androidSmsGatewayUrl: string;
  androidSmsGatewayToken: string;
  androidSmsGatewayTimeoutMs: number;
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

function validateGatewayUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("ANDROID_SMS_GATEWAY_URL must be a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("ANDROID_SMS_GATEWAY_URL must use http:// or https://.");
  }
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const otpSecret =
    process.env.OTP_SECRET ?? "development-only-secret-change-before-deployment";
  const smsDriverValue = process.env.SMS_DRIVER ?? "mock";

  if (smsDriverValue !== "mock" && smsDriverValue !== "gsm" && smsDriverValue !== "android") {
    throw new Error("SMS_DRIVER must be either mock, gsm, or android.");
  }

  const config: AppConfig = {
    port: readInteger("PORT", 3000),
    nodeEnv,
    databasePath: process.env.DATABASE_PATH ?? "./data/otp-auth.db",
    otpSecret,
    otpExpirySeconds: readInteger("OTP_EXPIRY_SECONDS", 300),
    otpResendCooldownSeconds: readInteger("OTP_RESEND_COOLDOWN_SECONDS", 60),
    otpMaxAttempts: readInteger("OTP_MAX_ATTEMPTS", 5),
    otpLockoutSeconds: readInteger("OTP_LOCKOUT_SECONDS", 300),
    otpMaxSendsPerWindow: readInteger("OTP_MAX_SENDS_PER_WINDOW", 5),
    otpRateWindowMinutes: readInteger("OTP_RATE_WINDOW_MINUTES", 15),
    sessionExpiryHours: readInteger("SESSION_EXPIRY_HOURS", 12),
    smsDriver: smsDriverValue,
    showMockOtp: readBoolean("SHOW_MOCK_OTP", true),
    gsmDevicePath: process.env.GSM_DEVICE_PATH ?? "/dev/ttyUSB0",
    gsmBaudRate: readInteger("GSM_BAUD_RATE", 115200),
    androidSmsGatewayUrl: process.env.ANDROID_SMS_GATEWAY_URL ?? "",
    androidSmsGatewayToken: process.env.ANDROID_SMS_GATEWAY_TOKEN ?? "",
    androidSmsGatewayTimeoutMs: readInteger("ANDROID_SMS_GATEWAY_TIMEOUT_MS", 10000),
    ...overrides,
  };

  if (config.otpSecret.length < 32) {
    throw new Error("OTP_SECRET must be at least 32 characters long.");
  }

  if (config.nodeEnv === "production" && config.otpSecret.includes("development-only")) {
    throw new Error("OTP_SECRET must be configured in production.");
  }

  if (config.nodeEnv === "production" && config.smsDriver === "mock") {
    throw new Error("SMS_DRIVER=mock is not permitted in production.");
  }

  if (config.smsDriver === "android") {
    if (!config.androidSmsGatewayUrl.trim()) {
      throw new Error("ANDROID_SMS_GATEWAY_URL is required when SMS_DRIVER=android.");
    }
    validateGatewayUrl(config.androidSmsGatewayUrl);

    if (config.androidSmsGatewayToken.trim().length < 16) {
      throw new Error(
        "ANDROID_SMS_GATEWAY_TOKEN must be configured with at least 16 characters when SMS_DRIVER=android.",
      );
    }
  }

  return config;
}
