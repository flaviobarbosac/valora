import type { CookieOptions, Request } from "express";
import { ENV } from "./env";

function isSecureRequest(req: Request) {
  if (ENV.cookieSecure === "true") return true;
  if (ENV.cookieSecure === "false") return false;
  // `trust proxy` is enabled in index.ts, so req.secure honours X-Forwarded-Proto.
  return Boolean(req.secure);
}

export function getSessionCookieOptions(req: Request): CookieOptions {
  return { httpOnly: true, path: "/", sameSite: "lax", secure: isSecureRequest(req) };
}
