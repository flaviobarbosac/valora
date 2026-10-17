import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";
import { COOKIE_NAME } from "../shared/const";

const mocks = vi.hoisted(() => ({
  getUserByOpenId: vi.fn(),
  touchUserSignIn: vi.fn(),
  setUserPassword: vi.fn(),
  deleteUserAndData: vi.fn(),
  setEmailCode: vi.fn(),
}));

vi.mock("./db", () => mocks);

const orgMocks = vi.hoisted(() => ({ getMembership: vi.fn(async () => undefined), countMembers: vi.fn(), deleteCompany: vi.fn(), getUserByEmail: vi.fn() }));
vi.mock("./orgDb", () => orgMocks);

import { appRouter } from "./routers";
import { hashPassword, passwordPolicyError, verifyPassword } from "./_core/password";
import { authenticateRequest, createSessionToken } from "./_core/session";
import { resetLoginRateLimit } from "./_core/loginRateLimit";

const SECRET = "unit-test-secret-with-at-least-32-characters";
let storedHash = "";

const user = (overrides: Partial<User> = {}): User => ({
  id: 7,
  openId: "user-7",
  name: "Maria Silva",
  email: "maria@banco.com",
  loginMethod: "password",
  role: "user",
  agencyCode: null,
  username: null,
  passwordHash: storedHash,
  isActive: true,
  emailVerifiedAt: new Date(),
  emailCodeHash: null,
  emailCodeExpiresAt: null,
  emailCodeAttempts: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
  ...overrides,
});

function context(ip = "10.0.0.1") {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  return {
    cookies,
    ctx: {
      req: { ip, secure: false, headers: {} } as never,
      res: { cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push({ name, value, options }), clearCookie: vi.fn() } as never,
      user: null,
    },
  };
}

beforeAll(async () => { storedHash = await hashPassword("Senha1234"); });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("JWT_SECRET", SECRET);
  resetLoginRateLimit();
});
afterEach(() => vi.unstubAllEnvs());

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    expect(storedHash.startsWith("scrypt$")).toBe(true);
    await expect(verifyPassword("Senha1234", storedHash)).resolves.toBe(true);
    await expect(verifyPassword("senha1234", storedHash)).resolves.toBe(false);
    await expect(verifyPassword("Senha1234", null)).resolves.toBe(false);
    await expect(verifyPassword("Senha1234", "garbage")).resolves.toBe(false);
  });

  it("enforces the password policy", () => {
    expect(passwordPolicyError("curta1")).not.toBeNull();
    expect(passwordPolicyError("somenteletras")).not.toBeNull();
    expect(passwordPolicyError("Senha1234")).toBeNull();
  });
});

describe("auth.login", () => {
  it("signs in with e-mail and password, normalizing the e-mail", async () => {
    orgMocks.getUserByEmail.mockResolvedValue(user());
    const { ctx, cookies } = context();
    const result = await appRouter.createCaller(ctx).auth.login({ email: " Maria@Banco.com ", password: "Senha1234" });

    expect(orgMocks.getUserByEmail).toHaveBeenCalledWith("maria@banco.com");
    expect(result).toMatchObject({ email: "maria@banco.com", name: "Maria Silva", viewedBy: null });
    expect(result).not.toHaveProperty("passwordHash");
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({ name: COOKIE_NAME, options: { httpOnly: true, sameSite: "lax", path: "/" } });
    expect(mocks.touchUserSignIn).toHaveBeenCalledWith("user-7");
  });

  it("gives the same answer for an unknown e-mail and a wrong password", async () => {
    const { ctx } = context();
    orgMocks.getUserByEmail.mockResolvedValueOnce(undefined);
    const unknown = appRouter.createCaller(ctx).auth.login({ email: "ninguem@banco.com", password: "Senha1234" });
    await expect(unknown).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    orgMocks.getUserByEmail.mockResolvedValueOnce(user());
    const wrong = appRouter.createCaller(ctx).auth.login({ email: "maria@banco.com", password: "errada123" });
    await expect(wrong).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const [a, b] = await Promise.allSettled([unknown, wrong]);
    expect((a as PromiseRejectedResult).reason.message).toBe((b as PromiseRejectedResult).reason.message);
  });

  it("asks for the e-mail code instead of signing in an unconfirmed account", async () => {
    orgMocks.getUserByEmail.mockResolvedValue(user({ emailVerifiedAt: null }));
    const { ctx, cookies } = context();
    await expect(appRouter.createCaller(ctx).auth.login({ email: "maria@banco.com", password: "Senha1234" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mocks.setEmailCode).toHaveBeenCalledWith("user-7", expect.any(String), expect.any(Date));
    expect(cookies).toHaveLength(0);
    // A wrong password never reveals that the account is unconfirmed.
    await expect(appRouter.createCaller(ctx).auth.login({ email: "maria@banco.com", password: "errada123" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("refuses deactivated users", async () => {
    orgMocks.getUserByEmail.mockResolvedValue(user({ isActive: false }));
    await expect(appRouter.createCaller(context().ctx).auth.login({ email: "maria@banco.com", password: "Senha1234" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("blocks an account after repeated failures", async () => {
    orgMocks.getUserByEmail.mockResolvedValue(user());
    const caller = appRouter.createCaller(context().ctx);
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(caller.auth.login({ email: "maria@banco.com", password: "errada123" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    await expect(caller.auth.login({ email: "maria@banco.com", password: "Senha1234" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});

describe("sessions", () => {
  const requestWith = (token: string) => ({ headers: { cookie: `${COOKIE_NAME}=${token}` } }) as never;

  it("accepts a valid session and rejects it after the password changes", async () => {
    const token = await createSessionToken(user());
    mocks.getUserByOpenId.mockResolvedValueOnce(user());
    await expect(authenticateRequest(requestWith(token))).resolves.toMatchObject({ openId: "user-7" });

    mocks.getUserByOpenId.mockResolvedValueOnce(user({ passwordHash: await hashPassword("Outra5678") }));
    await expect(authenticateRequest(requestWith(token))).rejects.toThrow();
  });

  it("rejects sessions of deactivated users and tokens signed with another secret", async () => {
    const token = await createSessionToken(user());
    mocks.getUserByOpenId.mockResolvedValueOnce(user({ isActive: false }));
    await expect(authenticateRequest(requestWith(token))).rejects.toThrow();
    mocks.getUserByOpenId.mockResolvedValueOnce(user({ emailVerifiedAt: null }));
    await expect(authenticateRequest(requestWith(token))).rejects.toThrow();

    vi.stubEnv("JWT_SECRET", "another-secret-that-is-also-32-characters-long");
    mocks.getUserByOpenId.mockResolvedValueOnce(user());
    await expect(authenticateRequest(requestWith(token))).rejects.toThrow();
  });
});

describe("auth.changePassword", () => {
  const signedIn = () => {
    const { ctx, cookies } = context();
    return { cookies, caller: appRouter.createCaller({ ...ctx, user: user() }) };
  };

  it("requires the current password", async () => {
    await expect(signedIn().caller.auth.changePassword({ currentPassword: "errada123", newPassword: "Nova12345" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.setUserPassword).not.toHaveBeenCalled();
  });

  it("stores a new hash and renews the session cookie", async () => {
    const { caller, cookies } = signedIn();
    await expect(caller.auth.changePassword({ currentPassword: "Senha1234", newPassword: "Nova12345" })).resolves.toEqual({ success: true });
    const [openId, newHash] = mocks.setUserPassword.mock.calls[0];
    expect(openId).toBe("user-7");
    await expect(verifyPassword("Nova12345", newHash)).resolves.toBe(true);
    expect(cookies).toHaveLength(1);
  });
});

describe("auth.deleteAccount", () => {
  const signedIn = () => {
    const clearCookie = vi.fn();
    const ctx = { req: { ip: "10.0.0.1", secure: false, headers: {} } as never, res: { cookie: vi.fn(), clearCookie } as never, user: user() };
    return { clearCookie, caller: appRouter.createCaller(ctx) };
  };

  it("keeps the account when the password is wrong", async () => {
    await expect(signedIn().caller.auth.deleteAccount({ password: "errada123" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.deleteUserAndData).not.toHaveBeenCalled();
  });

  it("deletes only the signed-in user's data and ends the session", async () => {
    const { caller, clearCookie } = signedIn();
    await expect(caller.auth.deleteAccount({ password: "Senha1234" })).resolves.toEqual({ success: true });
    expect(mocks.deleteUserAndData).toHaveBeenCalledWith("user-7");
    expect(clearCookie).toHaveBeenCalledWith(COOKIE_NAME, expect.objectContaining({ maxAge: -1 }));
  });

  it("requires a signed-in user", async () => {
    const anonymous = appRouter.createCaller(context().ctx);
    await expect(anonymous.auth.deleteAccount({ password: "Senha1234" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
describe("auth.deleteAccount and companies", () => {
  const caller = () => appRouter.createCaller({ req: { ip: "1.1.1.1", secure: false, headers: {} } as never, res: { cookie: vi.fn(), clearCookie: vi.fn() } as never, user: user() });

  it("blocks the only admin of a company with other people", async () => {
    orgMocks.getMembership.mockResolvedValueOnce({ companyId: 10, role: "admin" } as never);
    orgMocks.countMembers.mockResolvedValueOnce(1).mockResolvedValueOnce(4);
    await expect(caller().auth.deleteAccount({ password: "Senha1234" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.deleteUserAndData).not.toHaveBeenCalled();
  });

  it("removes a company that only had this admin", async () => {
    orgMocks.getMembership.mockResolvedValueOnce({ companyId: 10, role: "admin" } as never);
    orgMocks.countMembers.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    await caller().auth.deleteAccount({ password: "Senha1234" });
    expect(orgMocks.deleteCompany).toHaveBeenCalledWith(10);
    expect(mocks.deleteUserAndData).toHaveBeenCalledWith("user-7");
  });
});
