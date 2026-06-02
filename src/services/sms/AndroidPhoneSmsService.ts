import type { SmsMessage, SmsService } from "./SmsService.js";

export class AndroidPhoneSmsService implements SmsService {
  constructor(
    private readonly gatewayUrl: string,
    private readonly token: string,
  ) {}

  async send(message: SmsMessage): Promise<void> {
    const response = await fetch(this.gatewayUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: message.to,
        body: message.body,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Android SMS gateway failed: ${response.status} ${errorBody}`);
    }
  }
}