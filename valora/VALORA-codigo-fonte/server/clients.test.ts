import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({
  listClientRecords: vi.fn(),
  getClientRecord: vi.fn(),
  getClientRecordById: vi.fn(),
  createClientRecord: vi.fn(),
  updateClientRecord: vi.fn(),
  deleteClientRecord: vi.fn(),
  getOwnerGoals: vi.fn(),
  saveOwnerGoals: vi.fn(),
}));

vi.mock("./db", () => mocks);

const orgMocks = vi.hoisted(() => ({ visibleOwnerOpenIds: vi.fn(), technicalCaseOwners: vi.fn(async () => new Set<string>()) }));
vi.mock("./orgDb", () => orgMocks);
vi.mock("./featuresDb", () => ({ latestRatings: vi.fn(async () => new Map()), noteCounts: vi.fn(async () => new Map()) }));

import { appRouter } from "./routers";

const user = (openId: string): User => ({
  id: 1,
  openId,
  name: "Atendente",
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
});

const caller = (openId: string | null) => appRouter.createCaller({
  req: {} as never,
  res: { clearCookie: vi.fn() } as never,
  user: openId ? user(openId) : null,
});

const validInput = {
  name: "Cliente Exemplo",
  contact: "11999990000",
  contactDate: "2026-10-07",
  hasCreditLimit: "unknown" as const,
  saleStatus: "pending" as const,
  lastProductSold: null,
  productClass: null,
  isBankCustomer: "unknown" as const,
  objection: null,
  objectionNotes: null,
  interestedWithoutLimit: false,
  stage: "new" as const,
  followUpDate: null,
};

beforeEach(() => vi.clearAllMocks());

describe("clients router access control and business rules", () => {
  it("requires an authenticated user to list client records", async () => {
    await expect(caller(null).clients.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.listClientRecords).not.toHaveBeenCalled();
  });

  it("lists only the owners the viewer may see and flags which records are theirs", async () => {
    orgMocks.visibleOwnerOpenIds.mockResolvedValue(["owner-a", "colleague"]);
    orgMocks.technicalCaseOwners.mockResolvedValue(new Set(["colleague"]));
    mocks.listClientRecords.mockResolvedValue([
      { id: 1, ownerOpenId: "owner-a", ownerName: "Eu", stage: "new" },
      { id: 2, ownerOpenId: "colleague", ownerName: "Colega", stage: "new" },
      { id: 3, ownerOpenId: "colleague", ownerName: "Colega", stage: "technical" },
    ]);
    const result = await caller("owner-a").clients.list();
    expect(orgMocks.visibleOwnerOpenIds).toHaveBeenCalledWith("owner-a");
    expect(mocks.listClientRecords).toHaveBeenCalledWith(["owner-a", "colleague"]);
    expect(result).toEqual([
      { id: 1, ownerName: "Eu", stage: "new", isMine: true, canEdit: true, canReview: false, lastRating: null, noteCount: 0 },
      { id: 2, ownerName: "Colega", stage: "new", isMine: false, canEdit: false, canReview: true, lastRating: null, noteCount: 0 },
      { id: 3, ownerName: "Colega", stage: "technical", isMine: false, canEdit: true, canReview: true, lastRating: null, noteCount: 0 },
    ]);
  });

  it("assigns the authenticated owner when creating a record", async () => {
    mocks.createClientRecord.mockResolvedValue({ success: true });
    await caller("owner-a").clients.create(validInput);
    expect(mocks.createClientRecord).toHaveBeenCalledWith("owner-a", expect.objectContaining({
      name: "Cliente Exemplo",
      reference: expect.stringMatching(/^VLR-/),
    }));
  });

  it("keeps updates and deletes scoped to the authenticated owner", async () => {
    mocks.updateClientRecord.mockResolvedValue({ success: true });
    mocks.deleteClientRecord.mockResolvedValue({ success: true });
    mocks.getClientRecordById.mockResolvedValue({ id: 12, ownerOpenId: "owner-b", stage: "new", saleStatus: "pending" });
    await caller("owner-b").clients.update({ id: 12, ...validInput });
    await caller("owner-b").clients.delete({ id: 12 });
    expect(mocks.updateClientRecord).toHaveBeenCalledWith("owner-b", 12, expect.objectContaining({ name: "Cliente Exemplo" }));
    expect(mocks.deleteClientRecord).toHaveBeenCalledWith("owner-b", 12);
  });

  it("rejects an impossible interested-without-limit combination", async () => {
    await expect(caller("owner-a").clients.create({
      ...validInput,
      hasCreditLimit: "yes",
      interestedWithoutLimit: true,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.createClientRecord).not.toHaveBeenCalled();
  });

  it("requires a sold outcome and product before entering the sold stage", async () => {
    await expect(caller("owner-a").clients.create({
      ...validInput,
      saleStatus: "sold",
      stage: "sold",
      lastProductSold: null,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.createClientRecord).not.toHaveBeenCalled();
  });

  it("requires a product class when registering a sale", async () => {
    await expect(caller("owner-a").clients.create({
      ...validInput,
      saleStatus: "sold",
      stage: "sold",
      lastProductSold: "Crédito consignado",
      productClass: null,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.createClientRecord).not.toHaveBeenCalled();
  });

  it("does not move a non-sale into the sold stage", async () => {
    mocks.getClientRecordById.mockResolvedValue({ id: 12, ownerOpenId: "owner-a", stage: "new", saleStatus: "pending" });
    await expect(caller("owner-a").clients.updateStage({ id: 12, stage: "sold" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.updateClientRecord).not.toHaveBeenCalled();
  });

  it("only open (pending) clients can become a caso técnico", async () => {
    mocks.getClientRecordById.mockResolvedValue({ id: 12, ownerOpenId: "owner-a", stage: "lost", saleStatus: "not_sold" });
    await expect(caller("owner-a").clients.updateStage({ id: 12, stage: "technical" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller("owner-a").clients.create({ ...validInput, saleStatus: "sold", stage: "technical", lastProductSold: "X", productClass: "outros" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    mocks.getClientRecordById.mockResolvedValue({ id: 12, ownerOpenId: "owner-a", stage: "new", saleStatus: "pending" });
    await caller("owner-a").clients.updateStage({ id: 12, stage: "technical" });
    expect(mocks.updateClientRecord).toHaveBeenCalledWith("owner-a", 12, { stage: "technical" });
  });

  it("lets the agency manager work on a caso técnico, keeping the original owner", async () => {
    orgMocks.technicalCaseOwners.mockResolvedValue(new Set(["bob"]));
    mocks.getClientRecordById.mockResolvedValue({ id: 30, ownerOpenId: "bob", stage: "technical", saleStatus: "pending" });
    await caller("manager").clients.updateStage({ id: 30, stage: "negotiation" });
    expect(mocks.updateClientRecord).toHaveBeenCalledWith("bob", 30, { stage: "negotiation" });
    await caller("manager").clients.update({ id: 30, ...validInput, stage: "technical" });
    expect(mocks.updateClientRecord).toHaveBeenLastCalledWith("bob", 30, expect.objectContaining({ name: "Cliente Exemplo" }));
  });

  it("does not let managers touch clients that are not a caso técnico, nor anyone else touch other people's", async () => {
    orgMocks.technicalCaseOwners.mockResolvedValue(new Set(["bob"]));
    mocks.getClientRecordById.mockResolvedValue({ id: 31, ownerOpenId: "bob", stage: "negotiation", saleStatus: "pending" });
    await expect(caller("manager").clients.updateStage({ id: 31, stage: "contacted" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    orgMocks.technicalCaseOwners.mockResolvedValue(new Set());
    mocks.getClientRecordById.mockResolvedValue({ id: 32, ownerOpenId: "bob", stage: "technical", saleStatus: "pending" });
    await expect(caller("leader").clients.update({ id: 32, ...validInput })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.updateClientRecord).not.toHaveBeenCalled();
  });

  it("requires authentication and scopes goal reads and writes to the owner", async () => {
    await expect(caller(null).goals.get()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller(null).goals.save({ monthlyContactTarget: 80, monthlySaleTarget: 15 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    mocks.getOwnerGoals.mockResolvedValue({ monthlyContactTarget: 90, monthlySaleTarget: 18 });
    mocks.saveOwnerGoals.mockResolvedValue({ success: true });
    await expect(caller("owner-a").goals.get()).resolves.toEqual({ monthlyContactTarget: 90, monthlySaleTarget: 18 });
    await caller("owner-b").goals.save({ monthlyContactTarget: 80, monthlySaleTarget: 15 });
    expect(mocks.getOwnerGoals).toHaveBeenCalledWith("owner-a");
    expect(mocks.saveOwnerGoals).toHaveBeenCalledWith("owner-b", { monthlyContactTarget: 80, monthlySaleTarget: 15 });
  });

  it("rejects out-of-range goal targets", async () => {
    await expect(caller("owner-a").goals.save({ monthlyContactTarget: 0, monthlySaleTarget: 15 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.saveOwnerGoals).not.toHaveBeenCalled();
  });
});
