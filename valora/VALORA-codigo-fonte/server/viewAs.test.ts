import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";

const db = vi.hoisted(() => ({ getUserByOpenId: vi.fn(), createClientRecord: vi.fn(), listClientRecords: vi.fn(async () => []) }));
const session = vi.hoisted(() => ({ authenticateRequest: vi.fn() }));
const org = vi.hoisted(() => ({ visibleOwnerOpenIds: vi.fn(async (openId: string) => [openId]), technicalCaseOwners: vi.fn(async () => new Set<string>()), getMembership: vi.fn() }));
vi.mock("./db", () => db);
vi.mock("./_core/session", () => session);
vi.mock("./orgDb", () => org);

import { VIEW_AS_HEADER, createContext } from "./_core/context";
import { appRouter } from "./routers";

const person = (openId: string, role: User["role"] = "user"): User => ({
  id: 1, openId, name: openId, email: `${openId}@x.com`, loginMethod: "password", role,
  agencyCode: null, username: null, passwordHash: "scrypt$x", isActive: true,
  createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
});
const contextFor = (headers: Record<string, string>) => createContext({ req: { headers } as never, res: {} as never, info: {} as never });

beforeEach(() => vi.clearAllMocks());

describe("Ver como (super administrator)", () => {
  it("lets a super administrator see the app as another person", async () => {
    session.authenticateRequest.mockResolvedValue(person("chefe", "super_admin"));
    db.getUserByOpenId.mockResolvedValue(person("ana"));
    const ctx = await contextFor({ [VIEW_AS_HEADER]: "ana" });
    expect(ctx).toMatchObject({ viewingAs: true, user: { openId: "ana" }, actor: { openId: "chefe" } });
    const me = await appRouter.createCaller(ctx).auth.me();
    expect(me).toMatchObject({ openId: "ana", viewedBy: { name: "chefe" } });
  });

  it("ignores the header for everyone else", async () => {
    session.authenticateRequest.mockResolvedValue(person("bob"));
    const ctx = await contextFor({ [VIEW_AS_HEADER]: "ana" });
    expect(ctx).toMatchObject({ viewingAs: false, user: { openId: "bob" } });
    expect(db.getUserByOpenId).not.toHaveBeenCalled();
  });

  it("is read-only: queries work, any change is refused", async () => {
    const ctx = { req: { headers: {} } as never, res: {} as never, user: person("ana"), actor: person("chefe", "super_admin"), viewingAs: true };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.clients.list()).resolves.toEqual([]);
    expect(org.visibleOwnerOpenIds).toHaveBeenCalledWith("ana");
    await expect(caller.clients.create({
      name: "X", contact: null, contactDate: "2026-10-16", hasCreditLimit: "unknown", saleStatus: "pending",
      lastProductSold: null, productClass: null, isBankCustomer: "unknown", objection: null, objectionNotes: null,
      interestedWithoutLimit: false, stage: "new", followUpDate: null,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.organization.createCompany({ name: "Empresa" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.createClientRecord).not.toHaveBeenCalled();
  });
});
