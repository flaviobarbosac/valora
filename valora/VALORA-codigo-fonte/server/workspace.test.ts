import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";
import { DEFAULT_PREFS, productConfigProblem, templateByKey, type ProductConfig } from "@shared/pipeline";

const org = vi.hoisted(() => ({ visibleOwnerOpenIds: vi.fn(async (openId: string) => [openId]), getCompanyOverview: vi.fn(async () => ({ agencies: [] })) }));
vi.mock("./orgDb", () => org);
vi.mock("./db", () => ({}));
vi.mock("./featuresDb", () => ({}));

type Space = { kind: "company"; companyId: number; member: { role: string } } | { kind: "personal"; ownerOpenId: string };
const ws = vi.hoisted(() => ({
  workspaceOf: vi.fn(),
  canEditWorkspace: (space: Space) => space.kind === "personal" || space.member.role === "admin",
  listProducts: vi.fn(),
  getProductsByIds: vi.fn(async () => []),
  productIdsOfOwners: vi.fn(async () => []),
  productForUser: vi.fn(async () => undefined),
  getWorkspaceProduct: vi.fn(),
  createProduct: vi.fn(async () => 50),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  stageUsage: vi.fn(async () => new Map()),
  productUsage: vi.fn(async () => ({ records: 0, agencies: 0 })),
  getPrefs: vi.fn(async () => DEFAULT_PREFS),
  savePrefs: vi.fn(),
  listCustomers: vi.fn(),
  getCustomer: vi.fn(),
  createCustomer: vi.fn(async () => 3),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
}));
vi.mock("./workspaceDb", () => ws);

import { appRouter } from "./routers";

const user = (openId: string): User => ({
  id: 1, openId, name: "Pessoa", email: `${openId}@x.com`, loginMethod: "password", role: "user", agencyCode: null, username: null,
  passwordHash: "x", isActive: true, emailVerifiedAt: new Date(), emailCodeHash: null, emailCodeExpiresAt: null, emailCodeAttempts: 0,
  createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
});
const caller = (openId: string) => appRouter.createCaller({ req: {} as never, res: { clearCookie: vi.fn() } as never, user: user(openId) });
const company = (role: string): Space => ({ kind: "company", companyId: 10, member: { role } });
const generic = (): ProductConfig => structuredClone(templateByKey("generico").config);
const product = (id: number, config = generic()) => ({ id, name: "Vendas", template: "generico", color: null, config });

beforeEach(() => {
  vi.clearAllMocks();
  ws.listProducts.mockResolvedValue([product(1)]);
  ws.getWorkspaceProduct.mockResolvedValue(product(1));
});

describe("modelos de pipeline", () => {
  it("every template is a valid pipeline", () => {
    for (const key of ["generico", "credito", "imoveis", "seguros", "veiculos", "servicos", "educacao"]) {
      expect(productConfigProblem(templateByKey(key).config)).toBeNull();
    }
  });

  it("explains broken pipelines in plain words", () => {
    const config = generic();
    expect(productConfigProblem({ ...config, stages: config.stages.filter((stage) => stage.kind !== "won") })).toMatch(/venda fechada/);
    expect(productConfigProblem({ ...config, stages: [...config.stages].reverse() })).toMatch(/primeira etapa/);
    expect(productConfigProblem({ ...config, stages: [...config.stages, { key: "suporte", label: "Suporte", color: "orange", kind: "handoff" }] })).toMatch(/technical/);
    expect(productConfigProblem({ ...config, fields: [{ key: "tipo", label: "Tipo", type: "select", options: [] }] })).toMatch(/opção/);
  });
});

describe("produtos e pipelines", () => {
  it("only the company admin (or an independent person) changes pipelines", async () => {
    ws.workspaceOf.mockResolvedValue(company("manager"));
    await expect(caller("gerente").workspace.saveProduct({ id: 1, name: "Vendas", color: null, config: generic() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("gerente").workspace.createProduct({ name: "Seguros", template: "seguros" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    ws.workspaceOf.mockResolvedValue(company("admin"));
    await caller("admin").workspace.createProduct({ name: "Seguros", template: "seguros" });
    expect(ws.createProduct).toHaveBeenCalledWith(company("admin"), expect.objectContaining({ name: "Seguros", template: "seguros" }));
    ws.workspaceOf.mockResolvedValue({ kind: "personal", ownerOpenId: "solo" });
    await caller("solo").workspace.saveProduct({ id: 1, name: "Minhas vendas", color: "#123456", config: generic() });
    expect(ws.updateProduct).toHaveBeenCalled();
  });

  it("refuses to drop or change the kind of a stage that has atendimentos", async () => {
    ws.workspaceOf.mockResolvedValue(company("admin"));
    ws.stageUsage.mockResolvedValue(new Map([["proposal", 4]]));
    const withoutProposal = generic();
    withoutProposal.stages = withoutProposal.stages.filter((stage) => stage.key !== "proposal");
    await expect(caller("admin").workspace.saveProduct({ id: 1, name: "Vendas", color: null, config: withoutProposal })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/4 atendimentos/) });
    const proposalLost = generic();
    proposalLost.stages = proposalLost.stages.map((stage) => (stage.key === "proposal" ? { ...stage, kind: "lost" as const } : stage));
    await expect(caller("admin").workspace.saveProduct({ id: 1, name: "Vendas", color: null, config: proposalLost })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const renamed = generic();
    renamed.stages = renamed.stages.map((stage) => (stage.key === "proposal" ? { ...stage, label: "Orçamento" } : stage));
    await caller("admin").workspace.saveProduct({ id: 1, name: "Vendas", color: null, config: renamed });
    expect(ws.updateProduct).toHaveBeenCalledTimes(1);
  });

  it("keeps at least one product and never deletes one in use", async () => {
    ws.workspaceOf.mockResolvedValue(company("admin"));
    await expect(caller("admin").workspace.deleteProduct({ id: 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    ws.listProducts.mockResolvedValue([product(1), product(2)]);
    ws.productUsage.mockResolvedValue({ records: 0, agencies: 1 });
    await expect(caller("admin").workspace.deleteProduct({ id: 2 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    ws.productUsage.mockResolvedValue({ records: 0, agencies: 0 });
    await caller("admin").workspace.deleteProduct({ id: 2 });
    expect(ws.deleteProduct).toHaveBeenCalledWith(company("admin"), 2);
  });

  it("gives an independent person with no pipeline the basic template", async () => {
    ws.workspaceOf.mockResolvedValue({ kind: "personal", ownerOpenId: "solo" });
    ws.listProducts.mockResolvedValue([]);
    const data = await caller("solo").workspace.get();
    expect(data).toMatchObject({ scope: "personal", canEdit: true, myProductId: 0, products: [{ id: 0, template: "generico" }] });
  });
});

describe("clientes cadastrados", () => {
  it("registers customers for the signed-in person and only the owner edits them", async () => {
    ws.workspaceOf.mockResolvedValue({ kind: "personal", ownerOpenId: "ana" });
    await caller("ana").customers.create({ name: "Maria Souza", email: "", phone: "(11) 90000-0000", city: "Recife" });
    expect(ws.createCustomer).toHaveBeenCalledWith("ana", expect.objectContaining({ name: "Maria Souza", email: null, phone: "(11) 90000-0000", city: "Recife", customFields: "{}" }));
    await expect(caller("ana").customers.create({ name: "X", email: "não-é-email" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    ws.getCustomer.mockResolvedValue({ id: 3, ownerOpenId: "bia" });
    await expect(caller("ana").customers.update({ id: 3, name: "Outro" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller("ana").customers.delete({ id: 3 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(ws.updateCustomer).not.toHaveBeenCalled();
  });

  it("lists the customers of the people below the viewer, flagging their own", async () => {
    org.visibleOwnerOpenIds.mockResolvedValue(["lider", "membro"]);
    ws.listCustomers.mockResolvedValue([
      { id: 1, ownerOpenId: "lider", name: "A", customFields: '{"renda":"3000"}', ownerName: "Líder", dealCount: 2 },
      { id: 2, ownerOpenId: "membro", name: "B", customFields: null, ownerName: "Membro", dealCount: 0 },
    ]);
    const result = await caller("lider").customers.list();
    expect(ws.listCustomers).toHaveBeenCalledWith(["lider", "membro"]);
    expect(result).toEqual([
      { id: 1, name: "A", customFields: { renda: "3000" }, ownerName: "Líder", dealCount: 2, isMine: true },
      { id: 2, name: "B", customFields: {}, ownerName: "Membro", dealCount: 0, isMine: false },
    ]);
  });
});
