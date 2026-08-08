# SMS OTP Authentication Prototype for Afghanistan

A university research prototype for the monograph **“Analysis of SMS-Based OTP Authentication Practices in Afghanistan and Development of a Cost-Effective Prototype System.”**

The implemented prototype uses a **Windows-hosted Node.js/TypeScript backend** and a **Samsung Galaxy A70 as a local single-SIM Android SMS gateway**. The phone runs a small HTTP gateway in Termux and sends OTP messages through `Termux:API` / `termux-sms-send`.

The project also keeps `mock` and legacy `gsm` SMS adapters so that SMS delivery remains replaceable. The final implemented research path is `SMS_DRIVER=android`.

> This repository is a research prototype, not a carrier-grade SMS platform and not a claim that SMS is suitable for every high-risk authentication scenario.

## Implemented Architecture

```text
User browser
    |
    v
Express / TypeScript backend on Windows
    |
    +--> AuthService
    |      |- OTP generation
    |      |- HMAC-protected OTP verifier
    |      |- expiration / resend controls
    |      |- subscriber-scoped failed-attempt lockout
    |      `- session creation
    |
    +--> SQLite
    |
    `--> SmsService
           |
           `--> AndroidPhoneSmsService
                    |
                    | HTTP POST + Bearer token
                    v
              Termux HTTP gateway
                    |
                    v
              Termux:API
                    |
                    v
              Android SMS / SIM
                    |
                    v
                 Recipient
```

The phone is only the **SMS transport layer**. It does not generate OTPs, verify OTPs, store user accounts, or create sessions.

## Project Structure

```text
android-gateway/             Phone-side Termux SMS gateway
public/                      Signup, login, and OTP verification UI
src/config/                  Environment configuration
src/db/                      SQLite setup and authentication repository
src/domain/                  OTP, phone validation, and application errors
src/middleware/              Request rate limiting
src/routes/                  Authentication API routes
src/services/                Authentication, sessions, and SMS services
tests/                       Unit and API/integration tests
research/                    Reproducible result-collection templates
```

## Requirements

### Windows backend

- Node.js 20 or newer
- npm

### Android gateway

- Android phone with an active SIM card
- Termux
- Termux:API Android add-on
- `nodejs` and `termux-api` packages inside Termux
- SMS permission granted to the Termux:API component
- Phone and Windows computer connected to the same private LAN for the prototype

## Quick Start — Mock Mode

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

In `.env`:

```env
SMS_DRIVER=mock
SHOW_MOCK_OTP=true
```

Open:

```text
http://localhost:3000/signup.html
```

Mock mode is intended only for development and automated testing.

## Android/SIM Gateway Setup

### 1. Install the Termux packages

On the Galaxy A70:

```bash
pkg update
pkg install nodejs termux-api
```

Copy `android-gateway/sms-gateway.js` from this repository to the phone.

### 2. Start the gateway

Use a long random token. The same token must later be configured on Windows.

```bash
cd ~/sms-gateway
SMS_GATEWAY_TOKEN="replace-with-your-long-random-token" node sms-gateway.js
```

Expected startup log:

```json
{"event":"gateway_started","port":8080,"time":"..."}
```

Health check from Windows:

```powershell
Invoke-RestMethod -Uri "http://PHONE_IP:8080/health" -Method Get
```

### 3. Configure the Windows backend

In `.env`:

```env
SMS_DRIVER=android
SHOW_MOCK_OTP=false

ANDROID_SMS_GATEWAY_URL=http://PHONE_IP:8080/send-sms
ANDROID_SMS_GATEWAY_TOKEN=replace-with-your-long-random-token
ANDROID_SMS_GATEWAY_TIMEOUT_MS=10000
```

Use a strong `OTP_SECRET` of at least 32 characters.

Start the backend:

```powershell
npm run dev
```

The backend will reject `SMS_DRIVER=android` at startup if the gateway URL or token is missing.

## Authentication Flow

1. The user submits a name and Afghan mobile number for signup, or a verified number for login.
2. The backend normalizes the number to `+937xxxxxxxx`.
3. A random six-digit OTP is generated using Node.js cryptographic randomness.
4. Only an HMAC-SHA-256 verifier is stored in SQLite.
5. The backend sends the SMS request through `SmsService`.
6. `AndroidPhoneSmsService` sends an authenticated HTTP request to the Termux gateway.
7. The gateway calls `termux-sms-send`, and Android transmits the message through the SIM.
8. The user enters the OTP.
9. A correct, unexpired, unused OTP is consumed and a server-side session is created.

## API Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/signup` | Register a pending user and send signup OTP |
| `POST` | `/api/auth/login` | Send OTP to a verified user |
| `POST` | `/api/auth/resend` | Replace the latest challenge after cooldown |
| `POST` | `/api/auth/verify` | Validate OTP and establish a session |
| `GET` | `/api/auth/me` | Read authenticated user from session cookie |
| `POST` | `/api/auth/logout` | Destroy the session |

## Security Controls Implemented

- Cryptographically generated six-digit OTP values.
- HMAC-SHA-256 OTP verifier storage rather than plaintext OTP persistence.
- Short OTP expiration.
- Single-use challenges.
- Resend cooldown.
- Per-phone OTP issuance limit in a rolling database-backed time window.
- Per-IP in-memory request throttling for the single-process prototype.
- **Subscriber-scoped consecutive failed-attempt tracking across replacement OTPs.**
- Temporary lockout configured by `OTP_LOCKOUT_SECONDS`.
- Successful authentication resets the subscriber failed-attempt count.
- Afghanistan mobile-number validation and normalization.
- Random session tokens with only their SHA-256 hashes stored in SQLite.
- `HttpOnly` and `SameSite=Strict` session cookie settings.
- Android gateway bearer-token authentication.
- Gateway request timeout on the backend.
- The phone-side gateway does **not** log OTP message bodies.

The subscriber-scoped failed-attempt behavior is intentional: requesting a replacement OTP does not provide a new guessing budget.

## Automated Tests

Run:

```powershell
npm test
```

The expanded suite covers OTP primitives, phone normalization, the full authentication flow, expiration, resend behavior, subscriber-scoped lockout across replacement challenges, rate limiting, SMS failure, replay prevention, logout, session expiration, invalid inputs, duplicate registration, and Android gateway request behavior.

For final monograph evidence, preserve the output:

```powershell
npm test 2>&1 | Tee-Object -FilePath test-results.txt
```

## End-to-End Research Measurements

Use `research/e2e-trials.csv` for the ten repeated real-SMS trials. Keep the test conditions stable and record the sender/recipient operators, location, request and gateway timestamps, recipient-observed arrival time, whether the message arrived before OTP expiry, verification success, latency, and any failure notes.

The Termux gateway prints JSON logs containing a request ID and gateway timestamps, but deliberately excludes the OTP value.

Do not describe ten trials as a national Afghanistan delivery rate. Report them as **observed results under the tested configuration**.

## Legacy GSM Adapter

`GsmModemSmsService` remains in the repository because the project originally planned a dedicated GSM modem and because the monograph compares SMS-delivery architectures. The final prototype did not use this path.

`SMS_DRIVER=gsm` still requires a real modem transport implementation and should not be described as the implemented final delivery method.

## Production Limitations

The Android/SIM route is intentionally a low-cost research prototype. It currently does not provide carrier delivery receipts, message queues, multi-gateway failover, production load testing, nationwide reliability evidence, phishing resistance, or Internet-facing transport hardening.

For an Internet-exposed or higher-scale deployment, use protected transport (HTTPS or VPN), firewall restrictions, monitoring, queueing, retry policy, failover, and a licensed/approved messaging route appropriate to the organization and local regulation.

For higher-risk authentication, stronger phishing-resistant authenticators should be considered instead of relying only on SMS.
