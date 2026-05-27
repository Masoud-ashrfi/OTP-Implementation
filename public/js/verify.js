import {
  api,
  clearChallenge,
  clearMessage,
  readChallenge,
  saveChallenge,
  setBusy,
  showMessage,
} from "./common.js";

const challenge = readChallenge();
const form = document.querySelector("#verify-form");
const successPanel = document.querySelector("#authenticated");
const message = document.querySelector("#message");
const phoneText = document.querySelector("#phone-text");
const demoCode = document.querySelector("#demo-code");
const verifyButton = form.querySelector("button[type=submit]");
const resendButton = document.querySelector("#resend");
const countdown = document.querySelector("#countdown");
let activeChallenge = challenge;
let timer;

if (!challenge) {
  window.location.replace("/login.html");
} else {
  phoneText.textContent = challenge.phone;
  displayDevelopmentOtp(challenge.developmentOtp);
  updateCountdown();
  timer = window.setInterval(updateCountdown, 1000);
}

function displayDevelopmentOtp(otp) {
  if (otp) {
    demoCode.innerHTML = `Demo mode OTP: <strong>${otp}</strong>`;
    demoCode.classList.add("visible");
  } else {
    demoCode.classList.remove("visible");
  }
}

function updateCountdown() {
  const now = Date.now();
  const resendWait = Math.max(0, Math.ceil((activeChallenge.resendAvailableAt - now) / 1000));
  resendButton.disabled = resendWait > 0;
  resendButton.textContent = resendWait > 0 ? `Resend in ${resendWait}s` : "Resend OTP";

  const expiryWait = Math.max(0, Math.ceil((activeChallenge.expiresAt - now) / 1000));
  countdown.textContent = expiryWait > 0 ? `Expires in ${expiryWait}s` : "OTP expired";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(message);
  setBusy(verifyButton, true, "Verifying...");

  try {
    const otp = new FormData(form).get("otp").toString();
    const result = await api("/api/auth/verify", {
      method: "POST",
      body: { challengeId: activeChallenge.challengeId, otp },
    });
    clearChallenge();
    window.clearInterval(timer);
    form.classList.add("hidden");
    document.querySelector("#verification-copy").classList.add("hidden");
    successPanel.classList.add("visible");
    document.querySelector("#welcome-name").textContent = result.user.fullName;
  } catch (error) {
    showMessage(message, error.message);
    setBusy(verifyButton, false);
  }
});

resendButton.addEventListener("click", async () => {
  clearMessage(message);
  resendButton.disabled = true;
  try {
    const result = await api("/api/auth/resend", {
      method: "POST",
      body: { challengeId: activeChallenge.challengeId },
    });
    activeChallenge = { ...activeChallenge, ...result };
    saveChallenge(result, activeChallenge.phone);
    displayDevelopmentOtp(result.developmentOtp);
    showMessage(message, "A new OTP has been sent.", "success");
    updateCountdown();
  } catch (error) {
    showMessage(message, error.message);
    updateCountdown();
  }
});

document.querySelector("#logout").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  window.location.assign("/login.html");
});
