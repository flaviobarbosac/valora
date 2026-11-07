import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyMember, User } from "../drizzle/schema";

const org = vi.hoisted(() => ({
  getMembership: vi.fn(),
  visibleOwnerOpenIds: vi.fn(),
  getCompanyOverview: vi.fn(),
  countMembers: vi.fn(),
  updateMember: vi.fn(),
  getAgency: vi.fn(async () => ({ id: 2 })),
  getTeam: vi.fn(async () => ({ id: 3, agencyId: 2 })),
}));
const features = vi.hoisted(() => ({
  addRecordNote: vi.fn(), listRecordNotes: vi.fn(async () => []), notify: vi.fn(),
  getPosition: vi.fn(), hasOpenPromotion: vi.fn(async () => false), createPromotionRequest: vi.fn(async () => 9),
  getPromotionRequest: vi.fn(), decidePromotion: vi.fn(), applyPromotion: vi.fn(),
  getCompanySettings: vi.fn(async () => ({ roleLabels: {}, stageLabels: {} })),
  createBugReport: vi.fn(async () => 5), setBugStatus: vi.fn(), listBugReports: vi.fn(async () => []),
  saveCompanySettings: vi.fn(), listPositions: vi.fn(async () => []),
  positionInUse: vi.fn(async () => false), updatePosition: vi.fn(),
}));
const db = vi.hoisted(() => ({ getClientRecordById: vi.fn(), getUserByOpenId: vi.fn(async () => undefined), listUsers: vi.fn(async () => [] as User[]) }));
vi.mock("./orgDb", () => org);
vi.mock("./featuresDb", () => features);
vi.mock("./db", () => db);

import { appRouter } from "./routers";
import { resetLoginRateLimit } from "./_core/loginRateLimit";

const user = (openId: string, overrides: Partial<User> = {}): User => ({
  id: 1, openId, name: openId, email: `${openId}@x.com`, loginMethod: "password", role: "user", agencyCode: null, username: null,
  passwordHash: "x", isActive: true, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...overrides,
});
const member = (openId: string, role: CompanyMember["role"], extra: Partial<CompanyMember> = {}): CompanyMember => ({
  id: 1, companyId: 10, userOpenId: openId, role, agencyId: 2, teamId: 3, positionId: null, createdAt: new Date(), updatedAt: new Date(), ...extra,
});
const callerFor = (signedIn: User | null) => appRouter.createCaller({ req: { ip: "1.2.3.4", headers: {} } as never, res: {} as never, user: signedIn, actor: signedIn, viewingAs: false });
const memberships = (map: Record<string, CompanyMember>) => org.getMembership.mockImplementation(async (openId: string) => map[openId]);

beforeEach(() => {
  vi.clearAllMocks();
  resetLoginRateLimit();
  org.getCompanyOverview.mockResolvedValue({ company: { id: 10, name: "Banco" }, agencies: [], teams: [], members: [
    { openId: "admin", role: "admin", agencyId: null }, { openId: "gerente", role: "manager", agencyId: 2 },
    { openId: "lider", role: "leader", agencyId: 2 }, { openId: "bruno", role: "member", agencyId: 2 },
  ] });
});

describe("cobrar e avaliar atendimentos", () => {
  const record = { id: 40, ownerOpenId: "bruno", name: "Cliente X" };

  it("lets a leader charge and evaluate someone below, notifying the owner", async () => {
    db.getClientRecordById.mockResolvedValue(record);
    org.visibleOwnerOpenIds.mockResolvedValue(["lider", "bruno"]);
    await callerFor(user("lider")).features.addNote({ recordId: 40, kind: "cobranca", rating: null, body: "Ligou para o cliente?" });
    expect(features.addRecordNote).toHaveBeenCalledWith(expect.objectContaining({ recordId: 40, authorOpenId: "lider", kind: "cobranca" }));
    expect(features.notify).toHaveBeenCalledWith(["bruno"], expect.objectContaining({ link: "/?atendimento=40" }));
    await callerFor(user("lider")).features.addNote({ recordId: 40, kind: "avaliacao", rating: 4, body: "Bom atendimento" });
    expect(features.addRecordNote).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "avaliacao", rating: 4 }));
  });

  it("requires a rating for evaluations and blocks people who cannot see the client", async () => {
    db.getClientRecordById.mockResolvedValue(record);
    org.visibleOwnerOpenIds.mockResolvedValue(["lider", "bruno"]);
    await expect(callerFor(user("lider")).features.addNote({ recordId: 40, kind: "avaliacao", rating: null, body: "Sem nota" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    org.visibleOwnerOpenIds.mockResolvedValue(["outro"]);
    await expect(callerFor(user("outro")).features.addNote({ recordId: 40, kind: "cobranca", rating: null, body: "Oi" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(callerFor(user("outro")).features.notes({ recordId: 40 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("the owner can only reply, not charge or evaluate themselves", async () => {
    db.getClientRecordById.mockResolvedValue(record);
    org.visibleOwnerOpenIds.mockResolvedValue(["bruno"]);
    await expect(callerFor(user("bruno")).features.addNote({ recordId: 40, kind: "avaliacao", rating: 5, body: "Me dou 5" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await callerFor(user("bruno")).features.addNote({ recordId: 40, kind: "comentario", rating: null, body: "Já liguei, volta amanhã" });
    expect(features.addRecordNote).toHaveBeenCalledWith(expect.objectContaining({ kind: "comentario" }));
  });
});

describe("promoção: líder pede → gerente aprova → administração aprova", () => {
  const position = { id: 7, companyId: 10, name: "Consultor Sênior", level: "member" as const };

  it("a leader's request goes to the agency manager", async () => {
    memberships({ lider: member("lider", "leader"), bruno: member("bruno", "member") });
    org.visibleOwnerOpenIds.mockResolvedValue(["lider", "bruno"]);
    features.getPosition.mockResolvedValue(position);
    const result = await callerFor(user("lider")).features.requestPromotion({ targetOpenId: "bruno", toPositionId: 7, reason: "Bateu as metas três meses seguidos", raiseNote: "10%" });
    expect(result).toEqual({ id: 9, status: "pending_manager" });
    expect(features.notify).toHaveBeenCalledWith(["gerente"], expect.objectContaining({ link: "/?tela=promocoes" }));
  });

  it("users cannot ask, and leaders cannot ask for people outside their team", async () => {
    memberships({ bruno: member("bruno", "member"), lider: member("lider", "leader"), eva: member("eva", "member", { teamId: 4 }) });
    await expect(callerFor(user("bruno")).features.requestPromotion({ targetOpenId: "lider", toPositionId: 7, reason: "Quero promover meu líder", raiseNote: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    org.visibleOwnerOpenIds.mockResolvedValue(["lider", "bruno"]);
    await expect(callerFor(user("lider")).features.requestPromotion({ targetOpenId: "eva", toPositionId: 7, reason: "Pessoa de outra equipe", raiseNote: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("the manager approves and the admin applies the new cargo", async () => {
    memberships({ gerente: member("gerente", "manager", { teamId: null }), admin: member("admin", "admin", { agencyId: null, teamId: null }), bruno: member("bruno", "member") });
    features.getPosition.mockResolvedValue({ ...position, level: "leader" });
    features.getPromotionRequest.mockResolvedValueOnce({ id: 9, status: "pending_manager", targetOpenId: "bruno", toPositionId: 7, requestedByOpenId: "lider", managerOpenId: null, raiseNote: null });
    await expect(callerFor(user("gerente")).features.decidePromotion({ id: 9, approve: true, note: null })).resolves.toEqual({ status: "pending_admin" });
    expect(features.decidePromotion).toHaveBeenCalledWith(9, "manager", expect.objectContaining({ status: "pending_admin" }));

    features.getPromotionRequest.mockResolvedValueOnce({ id: 9, status: "pending_admin", targetOpenId: "bruno", toPositionId: 7, requestedByOpenId: "lider", managerOpenId: "gerente", raiseNote: null });
    await expect(callerFor(user("admin")).features.decidePromotion({ id: 9, approve: true, note: "Parabéns" })).resolves.toEqual({ status: "approved" });
    expect(features.applyPromotion).toHaveBeenCalledWith(9, 10, "bruno", { role: "leader", agencyId: 2, teamId: 3, positionId: 7 }, expect.anything());
  });

  it("only the right person decides each step", async () => {
    memberships({ gerente: member("gerente", "manager", { agencyId: 99 }), admin: member("admin", "admin"), bruno: member("bruno", "member") });
    features.getPromotionRequest.mockResolvedValue({ id: 9, status: "pending_manager", targetOpenId: "bruno", toPositionId: 7, requestedByOpenId: "lider", managerOpenId: null });
    await expect(callerFor(user("admin")).features.decidePromotion({ id: 9, approve: true, note: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(user("gerente")).features.decidePromotion({ id: 9, approve: true, note: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(features.decidePromotion).not.toHaveBeenCalled();
  });
});

describe("cargos", () => {
  it("a cargo in use keeps its permission level, but can be renamed", async () => {
    memberships({ admin: member("admin", "admin") });
    features.getPosition.mockResolvedValue({ id: 7, companyId: 10, name: "Atendente", level: "member" });
    features.positionInUse.mockResolvedValue(true);
    await expect(callerFor(user("admin")).features.updatePosition({ id: 7, name: "Atendente", level: "leader" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(features.updatePosition).not.toHaveBeenCalled();
    await callerFor(user("admin")).features.updatePosition({ id: 7, name: "Atendente Pleno", level: "member" });
    expect(features.updatePosition).toHaveBeenCalledWith(10, 7, { name: "Atendente Pleno", level: "member" });
  });
});

describe("personalização e relatos de erro", () => {
  it("only the company admin customizes, and colors must be valid", async () => {
    memberships({ lider: member("lider", "leader"), admin: member("admin", "admin") });
    const input = { displayName: "Banco X", primaryColor: "#b3121f", darkColor: "#5c0a10", accentColor: "#ffb4b9", logoDataUrl: null, roleLabels: { leader: "Supervisor", hacker: "x" } };
    await expect(callerFor(user("lider")).features.saveBranding(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await callerFor(user("admin")).features.saveBranding(input);
    expect(features.saveCompanySettings).toHaveBeenCalledWith(10, expect.objectContaining({ roleLabels: { leader: "Supervisor" } }));
    await expect(callerFor(user("admin")).features.saveBranding({ ...input, primaryColor: "red" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(callerFor(user("admin")).features.saveBranding({ ...input, logoDataUrl: "data:image/svg+xml;base64,PHN2Zy8+" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("anyone can report a bug (even signed out) and super admins are notified", async () => {
    db.listUsers.mockResolvedValue([user("sa", { role: "super_admin" }), user("comum")]);
    const result = await callerFor(null).features.reportBug({ category: "erro", description: "O botão de salvar não responde", email: "pessoa@x.com", pageUrl: "/", userAgent: "test", technicalLog: null });
    expect(result).toEqual({ id: 5 });
    expect(features.notify).toHaveBeenCalledWith(["sa"], expect.objectContaining({ link: "/?tela=relatos" }));
    await expect(callerFor(user("comum")).features.bugReports()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
