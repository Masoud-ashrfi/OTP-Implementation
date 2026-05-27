export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsService {
  send(message: SmsMessage): Promise<void>;
}
