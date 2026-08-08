# Ten-Trial End-to-End OTP Measurement Protocol

Use this protocol only with phone numbers you control or have permission to test.

## Keep these conditions fixed

Record the following once before starting:

- Windows machine and Node.js version
- Galaxy A70 Android version
- sender SIM operator
- recipient SIM/operator
- physical test location
- Windows-to-phone network
- `OTP_EXPIRY_SECONDS`
- `OTP_RESEND_COOLDOWN_SECONDS`
- test date/time window
- phone battery level before test
- SIM balance before test, if you want a direct cost measurement

## For each of the 10 trials

1. Confirm the Termux gateway is running.
2. Confirm `GET /health` succeeds from Windows.
3. Record the local time immediately before clicking **Send OTP**.
4. Start the signup or login OTP request.
5. Copy the matching Termux JSON success log into your notes. It contains `requestId`, `gatewayReceivedAt`, `gatewayCompletedAt`, and `gatewayProcessingMs`.
6. Observe the authorized recipient phone.
7. Record the arrival time when the SMS becomes visible.
8. Enter the OTP in the web interface.
9. Record whether verification succeeded.
10. Record any delay, resend, error, or unusual network behavior.
11. Wait long enough to avoid unintentionally triggering configured resend/issuance controls.

## Derived values

For every trial:

- Gateway processing time: use `gatewayProcessingMs`.
- Observed delivery latency: recipient arrival time minus backend request time.
- Delivery success: `Yes` only if the SMS was received before the configured OTP expiry.
- Verification success: `Yes` only if the received OTP was accepted by the backend.

After ten trials:

- Observed delivery success rate = received-before-expiry trials / 10 × 100
- Verification success rate = successful verifications / 10 × 100
- Mean latency = sum of successful-trial latencies / number of successful deliveries
- Median latency = middle latency after sorting successful values
- Report minimum and maximum latency as well.

Do not call these values "Afghanistan's delivery rate." Call them "observed results under the tested configuration."

## Cost measurement

If the mobile operator provides reliable balance information and no bundle complicates the result:

1. Record SIM balance immediately before the 10 trials.
2. Ensure the SIM is not used for calls/data/other SMS during the experiment.
3. Record balance immediately afterward.
4. `Observed test cost = starting balance - ending balance`.
5. `Observed cost per SMS = observed test cost / messages actually sent`.

If a package/bundle or tax makes the balance difference unreliable, use the operator's documented tariff instead and state the source/date.

## Screenshots to preserve

- final `npm test` summary;
- Termux gateway with one successful JSON log;
- one received OTP SMS;
- frontend "Authenticated" state;
- optional SIM balance before/after if used for cost measurement.

Never publish the gateway token, `OTP_SECRET`, session cookie, or a still-valid OTP.
