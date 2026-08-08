import { afterEach, describe, expect, it, vi } from "vitest";
import { AndroidPhoneSmsService } from "../src/services/sms/AndroidPhoneSmsService.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AndroidPhoneSmsService", () => {
  it("sends an authenticated JSON request to the configured Android gateway", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = new AndroidPhoneSmsService(
      "http://192.168.1.25:8080/send-sms",
      "test-gateway-token-that-is-long-enough",
      5000,
    );

    await service.send({
      to: "+93701234567",
      body: "Your Monograph OTP is 123456. It expires in 5 minutes.",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("http://192.168.1.25:8080/send-sms");
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      Authorization: "Bearer test-gateway-token-that-is-long-enough",
      "Content-Type": "application/json",
    });

    const parsedBody = JSON.parse(String(options.body));
    expect(parsedBody).toEqual({
      to: "+93701234567",
      body: "Your Monograph OTP is 123456. It expires in 5 minutes.",
    });
  });

  it("treats a non-success gateway response as SMS delivery failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "SMS_FAILED" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = new AndroidPhoneSmsService(
      "http://192.168.1.25:8080/send-sms",
      "test-gateway-token-that-is-long-enough",
      5000,
    );

    await expect(
      service.send({
        to: "+93701234567",
        body: "Your Monograph OTP is 123456. It expires in 5 minutes.",
      }),
    ).rejects.toThrow(/Android SMS gateway failed/);
  });
});
