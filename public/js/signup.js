import { api, clearMessage, saveChallenge, setBusy, showMessage } from "./common.js";

const form = document.querySelector("#signup-form");
const button = form.querySelector("button[type=submit]");
const message = document.querySelector("#message");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(message);
  setBusy(button, true, "Sending OTP...");

  const values = new FormData(form);
  const phone = values.get("phone").toString();
  try {
    const result = await api("/api/auth/signup", {
      method: "POST",
      body: { fullName: values.get("fullName"), phone },
    });
    saveChallenge(result, phone);
    window.location.assign("/verify.html");
  } catch (error) {
    showMessage(message, error.message);
    setBusy(button, false);
  }
});
