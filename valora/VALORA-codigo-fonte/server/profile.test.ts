import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({
  getOwnerProfile: vi.fn(),
  saveOwnerProfile: vi.fn(),
}));

vi.mock("./db", () => mocks);

import { appRouter } from "./routers";

const caller = (openId: string | null) => appRouter.createCaller({
  req: {} as never,
  res: { clearCookie: vi.fn() } as never,
  user: openId ? {
    id: 1,
    openId,
    name: "Nome Cadastrado",
    email: "atendente@example.com",
    loginMethod: "password",
    role: "user",
    agencyCode: "001",
    username: "atendente",
    passwordHash: "scrypt$hash",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } satisfies User : null,
});

beforeEach(() => vi.clearAllMocks());

describe("profile router access control", () => {
  it("requires authentication and returns the registered name as the initial profile", async () => {
    await expect(caller(null).profile.get()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    mocks.getOwnerProfile.mockResolvedValue(null);
    await expect(caller("owner-a").profile.get()).resolves.toEqual({
      displayName: "Nome Cadastrado",
      jobTitle: "",
      avatarDataUrl: null,
    });
    expect(mocks.getOwnerProfile).toHaveBeenCalledWith("owner-a");
  });

  it("saves profile data only for the authenticated owner", async () => {
    mocks.saveOwnerProfile.mockResolvedValue({ success: true });
    const profile = { displayName: "Ana Valora", jobTitle: "Consultora de crédito", avatarDataUrl: null };
    await expect(caller("owner-b").profile.save(profile)).resolves.toEqual({ success: true });
    expect(mocks.saveOwnerProfile).toHaveBeenCalledWith("owner-b", profile);
  });

  it("rejects SVG and oversized profile photos", async () => {
    const base = { displayName: "Ana", jobTitle: "Consultora" };
    await expect(caller("owner-a").profile.save({ ...base, avatarDataUrl: "data:image/svg+xml;base64,PHN2Zy8+" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller("owner-a").profile.save({ ...base, avatarDataUrl: `data:image/jpeg;base64,${"A".repeat(400_000)}` })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.saveOwnerProfile).not.toHaveBeenCalled();
  });
});
