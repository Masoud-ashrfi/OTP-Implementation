import { AppError } from "./errors.js";

export function normalizeAfghanPhoneNumber(input: unknown): string {
  if (typeof input !== "string") {
    throw new AppError(400, "INVALID_PHONE", "Please enter a phone number.");
  }

  const compact = input.trim().replace(/[\s()-]/g, "");
  let international = compact;

  if (/^07\d{8}$/.test(compact)) {
    international = `+93${compact.slice(1)}`;
  } else if (/^937\d{8}$/.test(compact)) {
    international = `+${compact}`;
  } else if (/^00937\d{8}$/.test(compact)) {
    international = `+${compact.slice(2)}`;
  }

  if (!/^\+937\d{8}$/.test(international)) {
    throw new AppError(
      400,
      "INVALID_PHONE",
      "Enter a valid Afghanistan mobile number, for example 0701234567.",
    );
  }

  return international;
}
