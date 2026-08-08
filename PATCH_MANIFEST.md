# Patch Manifest

Prepared replacements/additions for the OTP prototype:

- README.md — describes the actual Android/SIM gateway architecture.
- .env.example — includes Android gateway, lockout, and timeout settings.
- src/config/env.ts — validates Android configuration and adds lockout/timeout settings.
- src/db/database.ts — migrates existing databases with subscriber OTP-failure fields.
- src/db/AuthRepository.ts — subscriber-level failure tracking.
- src/services/AuthService.ts — lockout persists across replacement OTPs.
- src/services/sms/AndroidPhoneSmsService.ts — request IDs and network timeout.
- src/server.ts — passes the configured Android gateway timeout to the adapter.
- src/services/sms/MockSmsService.ts — no plaintext OTP terminal logging.
- android-gateway/sms-gateway.js — reproducible Termux gateway with safe timestamps.
- public/*.html — updated Android/SIM branding.
- tests/*.test.ts — expanded automated coverage.
- .github/workflows/test.yml — repeatable CI build/test check.
- research/e2e-trials.csv, E2E_TEST_PROTOCOL.md, and cost-comparison-template.csv — result evidence collection.
- package.json — current project description.

Apply these files over the corresponding repository paths, run `npm run build`, then run `npm test`.
