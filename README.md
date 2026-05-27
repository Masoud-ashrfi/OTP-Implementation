# SMS OTP Authentication Prototype for Afghanistan

A low-cost university monograph prototype for passwordless authentication using Afghanistan mobile numbers and a locally attached GSM modem boundary. It does not use a cloud SMS gateway or third-party SMS API.

## Architecture

- `Express` and `TypeScript` expose a small JSON API and serve the responsive browser UI.
- `better-sqlite3` persists users, OTP challenges, and login sessions in one local SQLite file.
- OTPs are cryptographically generated and stored only as HMAC-SHA256 hashes, with expiration, cooldown, attempt locking, and per-phone send limits.
- A random session token is returned only in an `HttpOnly`, `SameSite=Strict` cookie after successful OTP verification; only its hash is stored.
- `SmsService` keeps delivery independent from authentication. `MockSmsService` supports the demonstration, while `GsmModemSmsService` is the local modem boundary.

## Project Structure

```text
public/                     Responsive signup, login, and OTP verification pages
src/config/                 Environment configuration
src/db/                     SQLite setup and authentication repository
src/domain/                 OTP, phone validation, and application errors
src/middleware/             Request rate limiting
src/routes/                 Authentication API routes
src/services/               Authentication, sessions, and SMS services
tests/                      OTP unit tests and API flow tests
```

## Quick Start

Requirements: Node.js 20 or newer and npm.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:3000/signup.html`. With `SMS_DRIVER=mock` and `SHOW_MOCK_OTP=true`, the generated OTP is shown on the verification screen for demonstration purposes and logged by the mock SMS service.

For a production-like build:

```powershell
npm run build
npm start
```

Before any deployment, replace `OTP_SECRET`, set `SHOW_MOCK_OTP=false`, serve over HTTPS, and configure a real local modem transport. Startup rejects `SMS_DRIVER=mock` when `NODE_ENV=production`.

## Authentication Flow

1. A user submits a name and Afghan mobile number on signup, or a registered phone number on login.
2. The backend normalizes the number to `+937xxxxxxxx`, creates a random 6-digit OTP, stores its HMAC hash and expiry in SQLite, and calls `SmsService`.
3. The user enters the OTP on the verification page.
4. A correct, unexpired, unused OTP marks a signup account as verified or completes login, then creates a hashed server-side session.

### API Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/signup` | Register a pending user and send signup OTP |
| `POST` | `/api/auth/login` | Send OTP to a verified user |
| `POST` | `/api/auth/resend` | Replace the latest challenge after cooldown |
| `POST` | `/api/auth/verify` | Validate OTP and establish a session |
| `GET` | `/api/auth/me` | Read authenticated user from session cookie |
| `POST` | `/api/auth/logout` | Destroy the session |

## Security Controls

- OTP expiration configured by `OTP_EXPIRY_SECONDS`.
- Resend cooldown configured by `OTP_RESEND_COOLDOWN_SECONDS`.
- Per-phone OTP send cap in a rolling database-backed time window.
- Per-IP in-memory endpoint request limit suitable for this single-process prototype.
- Brute-force lock after `OTP_MAX_ATTEMPTS` incorrect codes.
- Afghanistan mobile number and OTP format validation.
- Generic internal errors and clear recoverable user-facing messages.

For a larger deployment with multiple server processes, move IP rate-limit state to shared storage such as Redis.

## Local GSM Modem Integration

There are no cloud SMS dependencies. The integration boundary is:

- [`src/services/sms/SmsService.ts`](src/services/sms/SmsService.ts): delivery contract.
- [`src/services/sms/MockSmsService.ts`](src/services/sms/MockSmsService.ts): runnable demonstration sender.
- [`src/services/sms/GsmModemSmsService.ts`](src/services/sms/GsmModemSmsService.ts): adapter that delegates to a Linux/GSM modem transport.

`GsmModemSmsService` is deliberately wired to an unconfigured transport when `SMS_DRIVER=gsm`. Implementing the serial/AT-command transport correctly requires the selected modem model, Linux device path (for example `/dev/ttyUSB0`), baud rate, PIN requirements, SMS text/PDU mode support, and the serial library or system tool approved for the demonstration machine.

Once those hardware details are available, implement `GsmModemTransport.sendTextMessage()` in the SMS folder. A typical modem-specific implementation would open the Linux serial port, configure SMS text mode with AT commands, send to the normalized `+93` number, wait for modem acknowledgement, and report failures to the existing authentication flow.

## Tests

```powershell
npm test
```

The tests cover OTP generation and hash verification, signup/login completion, session creation, OTP expiration, resend cooldown/stale challenges, and brute-force lockout.
