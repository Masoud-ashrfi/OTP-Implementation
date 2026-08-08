import { randomUUID } from "node:crypto";
import type { SmsMessage, SmsService } from "./SmsService.js";

export class AndroidPhoneSmsService implements SmsService {
  constructor(
    private readonly gatewayUrl: string,
    private readonly token: string,
    private readonly timeoutMs = 10000,
  ) {}

  async send(message: SmsMessage): Promise<void> {
    const requestId = randomUUID();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.gatewayUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          "X-Request-Id": requestId,
        },
        body: JSON.stringify({
          to: message.to,
          body: message.body,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = (await response.text()).slice(0, 500);
        throw new Error(
          `Android SMS gateway failed for request ${requestId}: ${response.status} ${errorBody}`,
        );
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `Android SMS gateway timed out after ${this.timeoutMs} ms for request ${requestId}.`,
        );
      }

      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Android SMS gateway failed for request ${requestId}.`);
    } finally {
      clearTimeout(timeout);
    }
  }
}
