import type { SmsMessage, SmsService } from "./SmsService.js";

export interface GsmModemTransport {
  sendTextMessage(phone: string, message: string): Promise<void>;
}

export class UnconfiguredGsmModemTransport implements GsmModemTransport {
  constructor(
    private readonly devicePath: string,
    private readonly baudRate: number,
  ) {}

  async sendTextMessage(): Promise<void> {
    throw new Error(
      `GSM modem transport is not configured for ${this.devicePath} at ${this.baudRate} baud. ` +
        "Confirm modem hardware and Linux serial settings before enabling SMS_DRIVER=gsm.",
    );
  }
}

// Actual modem-specific AT command handling is isolated behind this transport.
export class GsmModemSmsService implements SmsService {
  constructor(private readonly transport: GsmModemTransport) {}

  async send(message: SmsMessage): Promise<void> {
    await this.transport.sendTextMessage(message.to, message.body);
  }
}
