import { loadConfig } from "./config/env.js";
import { AuthRepository } from "./db/AuthRepository.js";
import { createDatabase } from "./db/database.js";
import { createApp } from "./app.js";
import {
  GsmModemSmsService,
  UnconfiguredGsmModemTransport,
} from "./services/sms/GsmModemSmsService.js";
import { MockSmsService } from "./services/sms/MockSmsService.js";
import type { SmsService } from "./services/sms/SmsService.js";

const config = loadConfig();
const database = createDatabase(config.databasePath);
const repository = new AuthRepository(database);

let smsService: SmsService;
let exposeMockOtp = false;
if (config.smsDriver === "mock") {
  smsService = new MockSmsService();
  exposeMockOtp = config.showMockOtp && config.nodeEnv !== "production";
} else {
  smsService = new GsmModemSmsService(
    new UnconfiguredGsmModemTransport(config.gsmDevicePath, config.gsmBaudRate),
  );
}

const app = createApp({ config, repository, smsService, exposeMockOtp });
app.listen(config.port, () => {
  console.info(`OTP prototype listening on http://localhost:${config.port}`);
  console.info(`SMS driver: ${config.smsDriver}`);
});
