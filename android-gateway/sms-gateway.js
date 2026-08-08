const http = require("http");
const { execFile } = require("child_process");
const { randomUUID, timingSafeEqual } = require("crypto");

const PORT = Number(process.env.SMS_GATEWAY_PORT || 8080);
const TOKEN = process.env.SMS_GATEWAY_TOKEN || "";

if (TOKEN.length < 16) {
  console.error(
    "SMS_GATEWAY_TOKEN is required and must be at least 16 characters long.",
  );
  process.exit(1);
}

function sendJson(response, status, data) {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function safeTokenMatch(received, expected) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function maskPhone(phone) {
  if (phone.length < 7) {
    return "***";
  }
  return `${phone.slice(0, 5)}***${phone.slice(-3)}`;
}

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "android-sms-gateway",
      time: new Date().toISOString(),
    });
    return;
  }

  if (request.method !== "POST" || request.url !== "/send-sms") {
    sendJson(response, 404, { error: "NOT_FOUND" });
    return;
  }

  const authorization = request.headers.authorization || "";
  const expectedAuthorization = `Bearer ${TOKEN}`;
  if (!safeTokenMatch(authorization, expectedAuthorization)) {
    sendJson(response, 401, { error: "UNAUTHORIZED" });
    return;
  }

  const requestId =
    typeof request.headers["x-request-id"] === "string" &&
    request.headers["x-request-id"].trim()
      ? request.headers["x-request-id"].trim()
      : randomUUID();

  const gatewayReceivedAt = new Date().toISOString();
  const startedAt = Date.now();
  let rawBody = "";
  let bodyTooLarge = false;

  request.on("data", (chunk) => {
    if (bodyTooLarge) {
      return;
    }

    rawBody += chunk;
    if (Buffer.byteLength(rawBody, "utf8") > 5000) {
      bodyTooLarge = true;
    }
  });

  request.on("end", () => {
    if (bodyTooLarge) {
      sendJson(response, 413, {
        error: "PAYLOAD_TOO_LARGE",
        requestId,
      });
      return;
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      sendJson(response, 400, {
        error: "INVALID_JSON",
        requestId,
      });
      return;
    }

    const to = String(body.to || "").trim();
    const message = String(body.body || "").trim();

    if (!/^\+937\d{8}$/.test(to)) {
      sendJson(response, 400, {
        error: "INVALID_PHONE",
        requestId,
      });
      return;
    }

    if (!message || message.length > 160) {
      sendJson(response, 400, {
        error: "INVALID_MESSAGE",
        requestId,
      });
      return;
    }

    execFile(
      "termux-sms-send",
      ["-n", to, message],
      { timeout: 30000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        const gatewayCompletedAt = new Date().toISOString();
        const gatewayProcessingMs = Date.now() - startedAt;

        if (error) {
          console.error(
            JSON.stringify({
              event: "sms_command_failed",
              requestId,
              to: maskPhone(to),
              gatewayReceivedAt,
              gatewayCompletedAt,
              gatewayProcessingMs,
              error: String(stderr || error.message).trim().slice(0, 300),
            }),
          );
          sendJson(response, 500, {
            error: "SMS_FAILED",
            requestId,
            gatewayReceivedAt,
            gatewayCompletedAt,
            gatewayProcessingMs,
          });
          return;
        }

        console.log(
          JSON.stringify({
            event: "sms_command_completed",
            requestId,
            to: maskPhone(to),
            gatewayReceivedAt,
            gatewayCompletedAt,
            gatewayProcessingMs,
          }),
        );

        sendJson(response, 200, {
          ok: true,
          requestId,
          gatewayReceivedAt,
          gatewayCompletedAt,
          gatewayProcessingMs,
        });
      },
    );
  });
});

server.requestTimeout = 35000;
server.headersTimeout = 10000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      event: "gateway_started",
      port: PORT,
      time: new Date().toISOString(),
    }),
  );
});
