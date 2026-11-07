import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";
import { templateByKey } from "@shared/pipeline";

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

// The "Crédito bancário" pipeline: stages new…lost, a caso técnico, required-free fields and loss reasons.
const credit = { id: 5, name: "Crédito", template: "credito", config: structuredClone(templateByKey("credito").config) };
const wsMocks = vi.hoisted(() => ({
  productForUser: vi.fn(),
  workspaceOf: vi.fn(),
  getWorkspaceProduct: vi.fn(),
  getProductsByIds: vi.fn(),
  getCustomer: vi.fn(),
}));
vi.mock("./workspaceDb", () => wsMocks);

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
  emailVerifiedAt: new Date(),
  emailCodeHash: null,
  emailCodeExpiresAt: null,
  emailCodeAttempts: 0,
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
  lastProductSold: null,
  objection: null,
  objectionNotes: null,
  stage: "new",
  followUpDate: null,
  customerId: null,
  customFields: {} as Record<string, string>,
};

beforeEach(() => {
  vi.clearAllMocks();
  wsMocks.productForUser.mockResolvedValue(credit);
  wsMocks.workspaceOf.mockResolvedValue({ kind: "company", companyId: 1, member: { role: "member" } });
  wsMocks.getProductsByIds.mockResolvedValue([credit]);
  wsMocks.getCustomer.mockResolvedValue(undefined);
});

describe("clients router access control and business rules", () => {
  it("requires an authenticated user to list client records", async () => {
    await expect(caller(null).clients.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.listClientRecords).not.toHaveBeenCalled();
  });

  it("lists only the owners the viewer may see and flags which records are theirs", async () => {
    orgMocks.visibleOwnerOpenIds.mockResolvedValue(["owner-a", "colleague"]);
    orgMocks.technicalCaseOwners.mockResolvedValue(new Set(["colleague"]));
    mocks.listClientRecords.mockResolvedValue([
      { id: 1, ownerOpenId: "owner-a", ownerName: "Eu", stage: "new", customFields: '{"limite":"Sim, tem limite"}' },
      { id: 2, ownerOpenId: "colleague", ownerName: "Colega", stage: "new", customFields: null },
      { id: 3, ownerOpenId: "colleague", ownerName: "Colega", stage: "technical", customFields: "não é json" },
    ]);
    const result = await caller("owner-a").clients.list();
    expect(orgMocks.visibleOwnerOpenIds).toHaveBeenCalledWith("owner-a");
    expect(mocks.listClientRecords).toHaveBeenCalledWith(["owner-a", "colleague"]);
    expect(result).toEqual([
      { id: 1, ownerName: "Eu", stage: "new", customFields: { limite: "Sim, tem limite" }, isMine: true, canEdit: true, canReview: false, lastRating: null, noteCount: 0 },
      { id: 2, ownerName: "Colega", stage: "new", customFields: {}, isMine: false, canEdit: false, canReview: true, lastRating: null, noteCount: 0 },
      { id: 3, ownerName: "Colega", stage: "technical", customFields: {}, isMine: false, canEdit: true, canReview: true, lastRating: null, noteCount: 0 },
    ]);
  });

  it("creates records in the owner's product, keeping only that product's fields", async () => {
    mocks.createClientRecord.mockResolvedValue(77);
    await expect(caller("owner-a").clients.create({ ...validInput, customFields: { limite: "Não tem limite", inventado: "x", classe: "Classe que não existe" } })).resolves.toEqual({ success: true, id: 77 });
    expect(wsMocks.productForUser).toHaveBeenCalledWith("owner-a", true);
    expect(mocks.createClientRecord).toHaveBeenCalledWith("owner-a", expect.objectContaining({
      name: "Cliente Exemplo",
      reference: expect.stringMatching(/^VLR-/),
      productId: 5,
      saleStatus: "pending",
      customFields: JSON.stringify({ limite: "Não tem limite" }),
    }));
  });

  it("keeps updates and deletes scoped to the authenticated owner", async () => {
    mocks.updateClientRecord.mockResolvedValue({ success: true });
    mocks.deleteClientRecord.mockResolvedValue({ success: true });
    mocks.getClientRecordById.mockResolvedValue({ id: 12, ownerOpenId: "owner-b", stage: "new", saleStatus: "pending", productId: 5 });
    await caller("owner-b").clients.update({ id: 12, ...validInput });
    await caller("owner-b").clients.delete({ id: 12 });
    expect(mocks.updateClientRecord).toHaveBeenCalledWith("owner-b", 12, expect.objectContaining({ name: "Cliente Exemplo" }));
    expect(mocks.deleteClientRecord).toHaveBeenCalledWith("owner-b", 12);
  });

  it("only accepts stages of the record's pipeline and derives the result from the stage", async () => {
    await expect(caller("owner-a").clients.create({ ...validInput, stage: "visit" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    mocks.createClientRecord.mockResolvedValue(1);
    await caller("owner-a").clients.create({ ...validInput, stage: "sold", lastProductSold: "Consignado INSS" });
    expect(mocks.createClientRecord).toHaveBeenLastCalledWith("owner-a", expect.objectContaining({ stage: "sold", saleStatus: "sold", lastProductSold: "Consignado INSS" }));
  });

  it("asks why a lost atendimento did not close, using the product's reasons", async () => {
    await expect(caller("owner-a").clients.create({ ...validInput, stage: "lost" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller("owner-a").clients.create({ ...validInput, stage: "lost", objection: "preco_inventado" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    mocks.createClientRecord.mockResolvedValue(1);
    await caller("owner-a").clients.create({ ...validInput, stage: "lost", objection: "rate" });
    expect(mocks.createClientRecord).toHaveBeenCalledWith("owner-a", expect.objectContaining({ saleStatus: "not_sold", objection: "rate" }));
  });

  it("lets only independents choose the product of a new atendimento", async () => {
    mocks.createClientRecord.mockResolvedValue(1);
    // In a company the agency's product wins, whatever the browser sends.
    await caller("owner-a").clients.create({ ...validInput, productId: 99 });
    expect(mocks.createClientRecord).toHaveBeenLastCalledWith("owner-a", expect.objectContaining({ productId: 5 }));
    wsMocks.workspaceOf.mockResolvedValue({ kind: "personal", ownerOpenId: "owner-a" });
    wsMocks.getWorkspaceProduct.mockResolvedValue(undefined);
    await expect(caller("owner-a").clients.create({ ...validInput, productId: 99 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const homes = { id: 8, name: "Imóveis", template: "imoveis", config: structuredClone(templateByKey("imoveis").config) };
    wsMocks.getWorkspaceProduct.mockResolvedValue(homes);
    await caller("owner-a").clients.create({ ...validInput, stage: "visit", productId: 8 });
    expect(mocks.createClientRecord).toHaveBeenLastCalledWith("owner-a", expect.objectContaining({ productId: 8, stage: "visit" }));
  });

  it("enforces required extra fields", async () => {
    const strict = { ...credit, config: { ...credit.config, fields: [{ key: "renda", label: "Renda", type: "money" as const, required: true }] } };
    wsMocks.productForUser.mockResolvedValue(strict);
    await expect(caller("owner-a").clients.create(validInput)).rejects.toMatchObject({ code: "BAD_REQUEST", message: 'Preencha "Renda".' });
    mocks.createClientRecord.mockResolvedValue(1);
    await caller("owner-a").clients.create({ ...validInput, customFields: { renda: "3.500,50" } });
    expect(mocks.createClientRecord).toHaveBeenCalledWith("owner-a", expect.objectContaining({ customFields: JSON.stringify({ renda: "3500.5" }) }));
  });

  it("moves cards between stages, asking the reason for a lost one", async () => {
    mocks.getClientRecordById.mockResolvedValue({ id: 12, ownerOpenId: "owner-a", stage: "new", saleStatus: "pending", productId: 5, objection: null });
    await expect(caller("owner-a").clients.updateStage({ id: 12, stage: "lost" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await caller("owner-a").clients.updateStage({ id: 12, stage: "lost", objection: "thinking" });
    expect(mocks.updateClientRecord).toHaveBeenLastCalledWith("owner-a", 12, { stage: "lost", saleStatus: "not_sold", productId: 5, objection: "thinking" });
    await caller("owner-a").clients.updateStage({ id: 12, stage: "sold" });
    expect(mocks.updateClientRecord).toHaveBeenLastCalledWith("owner-a", 12, { stage: "sold", saleStatus: "sold", productId: 5 });
    await expect(caller("owner-a").clients.updateStage({ id: 12, stage: "nao_existe" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("lets the agency manager work on a caso técnico, keeping the original owner", async () => {
    orgMocks.technicalCaseOwners.mockResolvedValue(new Set(["bob"]));
    mocks.getClientRecordById.mockResolvedValue({ id: 30, ownerOpenId: "bob", stage: "technical", saleStatus: "pending", productId: 5 });
    await caller("manager").clients.updateStage({ id: 30, stage: "negotiation" });
    expect(mocks.updateClientRecord).toHaveBeenCalledWith("bob", 30, { stage: "negotiation", saleStatus: "pending", productId: 5 });
    await caller("manager").clients.update({ id: 30, ...validInput, stage: "technical" });
    expect(mocks.updateClientRecord).toHaveBeenLastCalledWith("bob", 30, expect.objectContaining({ name: "Cliente Exemplo" }));
  });

  it("does not let managers touch clients that are not a caso técnico, nor anyone else touch other people's", async () => {
    orgMocks.technicalCaseOwners.mockResolvedValue(new Set(["bob"]));
    mocks.getClientRecordById.mockResolvedValue({ id: 31, ownerOpenId: "bob", stage: "negotiation", saleStatus: "pending", productId: 5 });
    await expect(caller("manager").clients.updateStage({ id: 31, stage: "contacted" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    orgMocks.technicalCaseOwners.mockResolvedValue(new Set());
    mocks.getClientRecordById.mockResolvedValue({ id: 32, ownerOpenId: "bob", stage: "technical", saleStatus: "pending", productId: 5 });
    await expect(caller("leader").clients.update({ id: 32, ...validInput })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.updateClientRecord).not.toHaveBeenCalled();
  });

  it("links only customers registered by the record's owner", async () => {
    mocks.getClientRecordById.mockResolvedValue({ id: 40, ownerOpenId: "owner-a", stage: "new", saleStatus: "pending", productId: 5 });
    wsMocks.getCustomer.mockResolvedValue({ id: 9, ownerOpenId: "someone-else" });
    await expect(caller("owner-a").clients.setCustomer({ id: 40, customerId: 9 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller("owner-a").clients.create({ ...validInput, customerId: 9 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    wsMocks.getCustomer.mockResolvedValue({ id: 9, ownerOpenId: "owner-a" });
    await caller("owner-a").clients.setCustomer({ id: 40, customerId: 9 });
    expect(mocks.updateClientRecord).toHaveBeenCalledWith("owner-a", 40, { customerId: 9 });
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
