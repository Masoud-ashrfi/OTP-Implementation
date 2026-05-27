const CHALLENGE_KEY = "otp_auth_challenge";

export async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(result.message ?? "Request failed. Please try again.");
    error.details = result.details;
    throw error;
  }

  return result;
}

export function saveChallenge(data, phone) {
  sessionStorage.setItem(
    CHALLENGE_KEY,
    JSON.stringify({
      challengeId: data.challengeId,
      phone,
      expiresAt: data.expiresAt,
      resendAvailableAt: data.resendAvailableAt,
      developmentOtp: data.developmentOtp,
    }),
  );
}

export function readChallenge() {
  const raw = sessionStorage.getItem(CHALLENGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearChallenge() {
  sessionStorage.removeItem(CHALLENGE_KEY);
}

export function showMessage(element, text, kind = "error") {
  element.textContent = text;
  element.className = `message visible ${kind}`;
}

export function clearMessage(element) {
  element.textContent = "";
  element.className = "message";
}

export function setBusy(button, busy, busyText) {
  if (!button.dataset.label) {
    button.dataset.label = button.textContent;
  }
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.label;
}
