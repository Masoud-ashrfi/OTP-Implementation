import type { SmsMessage, SmsService } from "./SmsService.js";

export class MockSmsService implements SmsService {
  public readonly sentMessages: SmsMessage[] = [];

  async send(message: SmsMessage): Promise<void> {
    this.sentMessages.push(message);
    console.info(`[MockSmsService] SMS to ${message.to}: ${message.body}`);
  }
}
