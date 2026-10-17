import { COOKIE_NAME } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import { createHash } from "node:crypto";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV, MIN_SESSION_SECRET_LENGTH } from "./env";

const ISSUER = "valora";

export type SessionPayload = { openId: string; sv: string };

function getSessionSecret() {
  const secret = ENV.sessionSecret;
  if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must have at least ${MIN_SESSION_SECRET_LENGTH} characters`);
  }
  return new TextEncoder().encode(secret);
}

/**
 * Fingerprint of the current password hash. Changing the password changes it,
 * which invalidates every session issued before the change.
 */
export function sessionVersion(passwordHash: string | null | undefined) {
  return createHash("sha256").update(passwordHash ?? "").digest("base64url").slice(0, 16);
}

export function sessionMaxAgeMs() {
  return ENV.sessionHours * 60 * 60 * 1000;
}

export async function createSessionToken(user: Pick<User, "openId" | "passwordHash">): Promise<string> {
  return new SignJWT({ sv: sessionVersion(user.passwordHash) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.openId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + sessionMaxAgeMs()) / 1000))
    .sign(getSessionSecret());
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), { algorithms: ["HS256"], issuer: ISSUER });
    if (typeof payload.sub !== "string" || !payload.sub || typeof payload.sv !== "string") return null;
    return { openId: payload.sub, sv: payload.sv };
  } catch {
    return null;
  }
}

export async function authenticateRequest(req: Request): Promise<User> {
  const token = parseCookieHeader(req.headers.cookie ?? "")[COOKIE_NAME];
  const session = await verifySessionToken(token);
  if (!session) throw ForbiddenError("Invalid session");

  const user = await db.getUserByOpenId(session.openId);
  if (!user || !user.isActive || !user.passwordHash || !user.emailVerifiedAt) throw ForbiddenError("User not available");
  if (sessionVersion(user.passwordHash) !== session.sv) throw ForbiddenError("Session revoked");
  return user;
}
