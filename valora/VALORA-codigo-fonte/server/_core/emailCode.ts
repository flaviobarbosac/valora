import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { ENV } from "./env";

/** How long a sign-up code stays valid. */
export const EMAIL_CODE_VALID_MINUTES = 15;
/** Wrong guesses allowed per code before a new one is needed. */
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
/** Minimum time between two codes for the same account. */
export const EMAIL_CODE_RESEND_SECONDS = 60;

export const newEmailCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** Keyed hash, so a leaked database row does not reveal a usable code. */
export function hashEmailCode(openId: string, code: string) {
  return createHmac("sha256", ENV.sessionSecret || "valora-email-code").update(`${openId}:${code}`).digest("hex");
}

export function emailCodeMatches(openId: string, code: string, storedHash: string | null) {
  if (!storedHash) return false;
  const given = Buffer.from(hashEmailCode(openId, code), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return given.length === stored.length && timingSafeEqual(given, stored);
}

export const emailCodeExpiry = () => new Date(Date.now() + EMAIL_CODE_VALID_MINUTES * 60 * 1000);

/** True while the last code is too recent to send another one. */
export function emailCodeRecentlySent(expiresAt: Date | null) {
  if (!expiresAt) return false;
  const sentAt = expiresAt.getTime() - EMAIL_CODE_VALID_MINUTES * 60 * 1000;
  return Date.now() - sentAt < EMAIL_CODE_RESEND_SECONDS * 1000;
}
