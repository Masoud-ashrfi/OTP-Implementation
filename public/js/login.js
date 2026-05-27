import { api, clearMessage, saveChallenge, setBusy, showMessage } from "./common.js";

const form = document.querySelector("#login-form");
const button = form.querySelector("button[type=submit]");
const message = document.querySelector("#message");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(message);
  setBusy(button, true, "Sending OTP...");

  const phone = new FormData(form).get("phone").toString();
  try {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: { phone },
    });
    saveChallenge(result, phone);
    window.location.assign("/verify.html");
  } catch (error) {
    showMessage(message, error.message);
    setBusy(button, false);
  }
});
