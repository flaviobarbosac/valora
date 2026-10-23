import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyMember, User } from "../drizzle/schema";

const org = vi.hoisted(() => ({
  getMembership: vi.fn(),
  getUserByEmail: vi.fn(),
  getCompanyOverview: vi.fn(),
  listPendingInvitations: vi.fn(),
  createCompanyWithAdmin: vi.fn(),
  renameCompany: vi.fn(),
  deleteCompany: vi.fn(),
  getAgency: vi.fn(),
  getTeam: vi.fn(),
  createAgency: vi.fn(),
  createTeam: vi.fn(),
  deleteAgencyIfEmpty: vi.fn(),
  deleteTeamIfEmpty: vi.fn(),
  updateMember: vi.fn(),
  removeMember: vi.fn(),
  countMembers: vi.fn(),
  createInvitation: vi.fn(),
  getInvitationByTokenHash: vi.fn(),
  getInvitation: vi.fn(),
  replaceInvitationToken: vi.fn(),
  revokeInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
  getInvitationContext: vi.fn(),
  listAllUsersWithPlacement: vi.fn(),
  listCompaniesSummary: vi.fn(),
  visibleOwnerOpenIds: vi.fn(),
  agencyPerformance: vi.fn(),
}));
const db = vi.hoisted(() => ({
  getUserByLogin: vi.fn(),
  createUser: vi.fn(),
  setUserActive: vi.fn(),
  deleteUserAndData: vi.fn(),
  setEmailCode: vi.fn(),
  countEmailCodeAttempt: vi.fn(),
  markEmailVerified: vi.fn(),
  touchUserSignIn: vi.fn(),
  setUserPassword: vi.fn(),
}));
const mail = vi.hoisted(() => ({ isMailConfigured: vi.fn(() => false), sendInviteEmail: vi.fn(async () => false), sendVerificationEmail: vi.fn(async (_message: { code: string }) => true) }));

vi.mock("./orgDb", () => org);
vi.mock("./db", () => db);
vi.mock("./_core/mailer", () => mail);
vi.mock("./featuresDb", () => ({ getCompanySettings: vi.fn(async () => ({ roleLabels: {}, stageLabels: {}, displayName: null })), latestRatings: vi.fn(async () => new Map()), noteCounts: vi.fn(async () => new Map()) }));

import { appRouter } from "./routers";
import { hashInviteToken } from "./orgRouter";
import { resetLoginRateLimit } from "./_core/loginRateLimit";

const user = (overrides: Partial<User> = {}): User => ({
  id: 1, openId: "me", name: "Ana", email: "ana@banco.com", loginMethod: "password", role: "user",
  agencyCode: "001", username: "ana", passwordHash: "scrypt$x", isActive: true,
  emailVerifiedAt: new Date(), emailCodeHash: null, emailCodeExpiresAt: null, emailCodeAttempts: 0,
  createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...overrides,
});
const member = (overrides: Partial<CompanyMember> = {}): CompanyMember => ({
  id: 1, companyId: 10, userOpenId: "me", role: "member", agencyId: null, teamId: null,
  createdAt: new Date(), updatedAt: new Date(), ...overrides,
});
const callerFor = (signedIn: User | null) => appRouter.createCaller({
  req: { ip: "10.0.0.9", secure: false, headers: {} } as never,
  res: { cookie: vi.fn(), clearCookie: vi.fn() } as never,
  user: signedIn,
});
const validInvite = (overrides = {}) => ({
  id: 5, companyId: 10, email: "novo@banco.com", role: "member", agencyId: 2, teamId: 3, tokenHash: "h",
  invitedByOpenId: "me", expiresAt: new Date(Date.now() + 86_400_000), acceptedAt: null, revokedAt: null, createdAt: new Date(), ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("JWT_SECRET", "unit-test-secret-with-at-least-32-characters");
  resetLoginRateLimit();
  org.getInvitationContext.mockResolvedValue({ companyName: "Banco X", agencyName: "Centro", teamName: "Equipe A", inviterName: "Ana", inviterAgencyCode: "001" });
  org.listPendingInvitations.mockResolvedValue([]);
});

describe("company administration permissions", () => {
  it("lets someone without a company create one and become its admin", async () => {
    org.getMembership.mockResolvedValue(undefined);
    org.createCompanyWithAdmin.mockResolvedValue(10);
    await expect(callerFor(user()).organization.createCompany({ name: "Banco X" })).resolves.toEqual({ companyId: 10 });
    expect(org.createCompanyWithAdmin).toHaveBeenCalledWith("me", "Banco X");
  });

  it("refuses a second company for someone already in one", async () => {
    org.getMembership.mockResolvedValue(member());
    await expect(callerFor(user()).organization.createCompany({ name: "Outra" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it.each(["manager", "leader", "member"] as const)("blocks a %s from managing the company", async (role) => {
    org.getMembership.mockResolvedValue(member({ role }));
    const caller = callerFor(user());
    await expect(caller.organization.createAgency({ name: "Nova" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.organization.invite({ email: "x@y.com", role: "member", agencyId: null, teamId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(org.createAgency).not.toHaveBeenCalled();
    expect(org.createInvitation).not.toHaveBeenCalled();
  });

  it("requires an agency for managers and a team for leaders", async () => {
    org.getMembership.mockImplementation(async (openId: string) => openId === "me" ? member({ role: "admin" }) : member({ userOpenId: openId }));
    const caller = callerFor(user());
    await expect(caller.organization.updateMember({ openId: "bob", role: "manager", agencyId: null, teamId: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.organization.updateMember({ openId: "bob", role: "leader", agencyId: 2, teamId: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    org.getTeam.mockResolvedValue({ id: 3, agencyId: 2, companyId: 10, name: "A" });
    await caller.organization.updateMember({ openId: "bob", role: "leader", agencyId: null, teamId: 3 });
    expect(org.updateMember).toHaveBeenCalledWith(10, "bob", { role: "leader", agencyId: 2, teamId: 3 });
  });

  it("keeps at least one administrator", async () => {
    org.getMembership.mockResolvedValue(member({ role: "admin" }));
    org.countMembers.mockResolvedValue(1);
    await expect(callerFor(user()).organization.updateMember({ openId: "me", role: "member", agencyId: null, teamId: null }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(org.updateMember).not.toHaveBeenCalled();
  });

  it("cannot touch people from another company", async () => {
    org.getMembership.mockImplementation(async (openId: string) => openId === "me" ? member({ role: "admin" }) : member({ userOpenId: openId, companyId: 99 }));
    await expect(callerFor(user()).organization.removeMember({ openId: "stranger" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(org.removeMember).not.toHaveBeenCalled();
  });

  it("hides contact details of colleagues from non-admins", async () => {
    org.getMembership.mockResolvedValue(member({ role: "leader", teamId: 3, agencyId: 2 }));
    org.getCompanyOverview.mockResolvedValue({
      company: { id: 10, name: "Banco X" }, agencies: [], teams: [],
      members: [
        { openId: "me", role: "leader", agencyId: 2, teamId: 3, name: "Ana", email: "ana@banco.com", agencyCode: "001", username: "ana" },
        { openId: "bob", role: "member", agencyId: 2, teamId: 3, name: "Bob", email: "bob@banco.com", agencyCode: "001", username: "bob" },
        { openId: "eve", role: "member", agencyId: 2, teamId: 4, name: "Eve", email: "eve@banco.com", agencyCode: "001", username: "eve" },
      ],
    });
    const result = await callerFor(user()).organization.me();
    expect(result.members?.map((row) => row.openId)).toEqual(["me", "bob"]);
    expect(result.members?.[1]).toMatchObject({ email: null, username: null });
    expect(result.invitations).toEqual([]);
  });
});

describe("painel de agências", () => {
  const sample = { company: { id: 10, name: "Banco X" }, agencies: [], teams: [], people: [] };

  it("admins see the company, managers their agency, leaders their team, users nothing", async () => {
    org.agencyPerformance.mockResolvedValue(sample);
    org.getMembership.mockResolvedValueOnce(member({ role: "member" }));
    await expect(callerFor(user()).organization.performance({ month: "2026-10" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    org.getMembership.mockResolvedValueOnce(member({ role: "leader", agencyId: 2, teamId: 3 }));
    await expect(callerFor(user()).organization.performance({ month: "2026-10" })).resolves.toMatchObject({ scope: "team" });
    expect(org.agencyPerformance).toHaveBeenLastCalledWith(10, "2026-10", 2, 3);

    org.getMembership.mockResolvedValueOnce(member({ role: "manager", agencyId: 2 }));
    await expect(callerFor(user()).organization.performance({ month: "2026-10" })).resolves.toMatchObject({ scope: "agency" });
    expect(org.agencyPerformance).toHaveBeenLastCalledWith(10, "2026-10", 2, null);

    org.getMembership.mockResolvedValueOnce(member({ role: "admin" }));
    await expect(callerFor(user()).organization.performance({ month: "2026-10" })).resolves.toMatchObject({ scope: "company" });
    expect(org.agencyPerformance).toHaveBeenLastCalledWith(10, "2026-10", null, null);
  });
});

describe("invitations", () => {
  it("creates an invite, stores only the token hash and returns a copyable link", async () => {
    org.getMembership.mockResolvedValue(member({ role: "admin" }));
    org.getUserByEmail.mockResolvedValue(undefined);
    org.getTeam.mockResolvedValue({ id: 3, agencyId: 2, companyId: 10, name: "A" });
    org.createInvitation.mockResolvedValue(5);
    const result = await callerFor(user()).organization.invite({ email: " Novo@Banco.com ", role: "member", agencyId: null, teamId: 3 });
    const token = result.link.split("/convite/")[1];
    expect(result).toMatchObject({ id: 5, emailSent: false, mailConfigured: false });
    expect(org.createInvitation).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 10, email: "novo@banco.com", tokenHash: hashInviteToken(token), placement: { role: "member", agencyId: 2, teamId: 3 },
    }));
    expect(JSON.stringify(org.createInvitation.mock.calls[0])).not.toContain(token);
  });

  it("does not invite someone who is already in a company", async () => {
    org.getMembership.mockImplementation(async (openId: string) => openId === "me" ? member({ role: "admin" }) : member({ userOpenId: openId, companyId: 77 }));
    org.getUserByEmail.mockResolvedValue(user({ openId: "taken", email: "taken@b.com" }));
    await expect(callerFor(user()).organization.invite({ email: "taken@b.com", role: "member", agencyId: null, teamId: null })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("previews valid invites and explains invalid ones", async () => {
    org.getInvitationByTokenHash.mockResolvedValueOnce(validInvite());
    await expect(callerFor(null).organization.previewInvite({ token: "token-valido-123" })).resolves.toMatchObject({ valid: true, companyName: "Banco X", email: "novo@banco.com" });
    org.getInvitationByTokenHash.mockResolvedValueOnce(validInvite({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(callerFor(null).organization.previewInvite({ token: "token-vencido-123" })).resolves.toMatchObject({ valid: false });
  });

  it("only lets the invited e-mail accept", async () => {
    org.getInvitationByTokenHash.mockResolvedValue(validInvite());
    org.getMembership.mockResolvedValue(undefined);
    await expect(callerFor(user({ email: "outra@pessoa.com" })).organization.acceptInvite({ token: "token-valido-123" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(user({ email: "novo@banco.com" })).organization.acceptInvite({ token: "token-valido-123" })).resolves.toEqual({ companyId: 10 });
    expect(org.acceptInvitation).toHaveBeenCalledWith(5, "me", null);
  });

  it("refuses used and revoked invites", async () => {
    org.getMembership.mockResolvedValue(undefined);
    org.getInvitationByTokenHash.mockResolvedValueOnce(validInvite({ acceptedAt: new Date() }));
    await expect(callerFor(user({ email: "novo@banco.com" })).organization.acceptInvite({ token: "token-usado-1234" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    org.getInvitationByTokenHash.mockResolvedValueOnce(validInvite({ revokedAt: new Date() }));
    await expect(callerFor(user({ email: "novo@banco.com" })).organization.acceptInvite({ token: "token-cancelado" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(org.acceptInvitation).not.toHaveBeenCalled();
  });
});

describe("sign-up", () => {
  const form = { name: "Novo Usuário", email: "novo@banco.com", password: "Senha1234" };

  const pending = (overrides: Partial<User> = {}) => user({ openId: "new", email: "novo@banco.com", emailVerifiedAt: null, ...overrides });
  const signedInCaller = () => {
    const cookie = vi.fn();
    return { cookie, caller: appRouter.createCaller({ req: { ip: "10.0.0.9", secure: false, headers: {} } as never, res: { cookie, clearCookie: vi.fn() } as never, user: null }) };
  };

  it("creates an unconfirmed account and e-mails a code instead of signing in", async () => {
    org.getUserByEmail.mockResolvedValueOnce(undefined).mockResolvedValueOnce(pending());
    const { caller, cookie } = signedInCaller();
    const result = await caller.auth.signup(form);
    expect(result).toEqual({ status: "verify_email", email: "novo@banco.com", emailSent: true, mailConfigured: false });
    expect(db.createUser).toHaveBeenCalledWith(expect.objectContaining({ agencyCode: null, username: null, email: "novo@banco.com", role: "user", emailVerified: false }));
    expect(db.setEmailCode).toHaveBeenCalledWith("new", expect.stringMatching(/^[0-9a-f]{64}$/), expect.any(Date));
    expect(mail.sendVerificationEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "novo@banco.com", code: expect.stringMatching(/^\d{6}$/) }));
    expect(cookie).not.toHaveBeenCalled();
    expect(org.acceptInvitation).not.toHaveBeenCalled();
  });

  it("signs in only with the right code, and locks the code after too many wrong guesses", async () => {
    org.getUserByEmail.mockResolvedValueOnce(undefined).mockResolvedValueOnce(pending());
    await callerFor(null).auth.signup(form);
    const code = mail.sendVerificationEmail.mock.calls[0][0].code;
    const [, codeHash, expiresAt] = db.setEmailCode.mock.calls[0];
    const stored = pending({ emailCodeHash: codeHash, emailCodeExpiresAt: expiresAt });

    const wrongCode = code === "000000" ? "111111" : "000000";
    org.getUserByEmail.mockResolvedValueOnce(stored);
    await expect(callerFor(null).auth.verifyEmail({ email: "novo@banco.com", code: wrongCode })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.countEmailCodeAttempt).toHaveBeenCalledWith("new", 1);

    org.getUserByEmail.mockResolvedValueOnce({ ...stored, emailCodeAttempts: 5 });
    await expect(callerFor(null).auth.verifyEmail({ email: "novo@banco.com", code })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    org.getUserByEmail.mockResolvedValueOnce({ ...stored, emailCodeExpiresAt: new Date(Date.now() - 1000) });
    await expect(callerFor(null).auth.verifyEmail({ email: "novo@banco.com", code })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.markEmailVerified).not.toHaveBeenCalled();

    org.getUserByEmail.mockResolvedValueOnce(stored);
    const { caller, cookie } = signedInCaller();
    await expect(caller.auth.verifyEmail({ email: " Novo@Banco.com ", code })).resolves.toMatchObject({ email: "novo@banco.com" });
    expect(db.markEmailVerified).toHaveBeenCalledWith("new");
    expect(cookie).toHaveBeenCalledTimes(1);
  });

  it("an unconfirmed sign-up does not block the real owner of the e-mail", async () => {
    org.getUserByEmail.mockResolvedValueOnce(pending({ openId: "squatter" })).mockResolvedValueOnce(pending());
    await callerFor(null).auth.signup(form);
    expect(db.deleteUserAndData).toHaveBeenCalledWith("squatter");
    expect(db.createUser).toHaveBeenCalled();
  });

  it("resending a code gives the same answer for unknown e-mails", async () => {
    org.getUserByEmail.mockResolvedValueOnce(undefined);
    await expect(callerFor(null).auth.resendEmailCode({ email: "ninguem@x.com" })).resolves.toEqual({ mailConfigured: false });
    org.getUserByEmail.mockResolvedValueOnce(pending());
    await expect(callerFor(null).auth.resendEmailCode({ email: "novo@banco.com" })).resolves.toEqual({ mailConfigured: false });
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate e-mails and weak passwords", async () => {
    org.getUserByEmail.mockResolvedValueOnce(user());
    await expect(callerFor(null).auth.signup(form)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(callerFor(null).auth.signup({ ...form, password: "fraca" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.createUser).not.toHaveBeenCalled();
  });

  it("joins the company when signing up from an invite with the same e-mail", async () => {
    org.getInvitationByTokenHash.mockResolvedValue(validInvite());
    org.getUserByEmail.mockResolvedValueOnce(undefined).mockResolvedValueOnce(user({ openId: "new", email: "novo@banco.com" })).mockResolvedValue(undefined);
    org.getMembership.mockResolvedValue(undefined);
    // The invitation link reached this e-mail, so no extra code is needed.
    const result = await callerFor(null).auth.signup({ ...form, inviteToken: "token-valido-123" });
    expect(result).toMatchObject({ status: "signed_in", user: { email: "novo@banco.com" } });
    expect(db.createUser).toHaveBeenCalledWith(expect.objectContaining({ emailVerified: true }));
    expect(mail.sendVerificationEmail).not.toHaveBeenCalled();
    expect(org.acceptInvitation).toHaveBeenCalledWith(5, "new", null);
  });

  it("refuses an invite sign-up with a different e-mail before creating the account", async () => {
    org.getInvitationByTokenHash.mockResolvedValue(validInvite());
    await expect(callerFor(null).auth.signup({ ...form, email: "outro@x.com", inviteToken: "token-valido-123" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.createUser).not.toHaveBeenCalled();
  });
});

describe("esqueci minha senha", () => {
  const account = (overrides: Partial<User> = {}) => user({ openId: "ana-1", email: "ana@banco.com", ...overrides });
  const codeSent = () => {
    const [, codeHash, expiresAt] = db.setEmailCode.mock.calls.at(-1)!;
    return { code: mail.sendVerificationEmail.mock.calls.at(-1)![0].code, stored: account({ emailCodeHash: codeHash, emailCodeExpiresAt: expiresAt }) };
  };

  it("e-mails a reset code, with the same answer for unknown e-mails", async () => {
    org.getUserByEmail.mockResolvedValueOnce(undefined);
    await expect(callerFor(null).auth.requestPasswordReset({ email: "ninguem@x.com" })).resolves.toEqual({ mailConfigured: false });
    expect(mail.sendVerificationEmail).not.toHaveBeenCalled();

    org.getUserByEmail.mockResolvedValueOnce(account());
    await expect(callerFor(null).auth.requestPasswordReset({ email: " Ana@Banco.com " })).resolves.toEqual({ mailConfigured: false });
    expect(mail.sendVerificationEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@banco.com", purpose: "reset", code: expect.stringMatching(/^\d{6}$/) }));
  });

  it("changes the password and signs in only with the right reset code", async () => {
    org.getUserByEmail.mockResolvedValueOnce(account());
    await callerFor(null).auth.requestPasswordReset({ email: "ana@banco.com" });
    const { code, stored } = codeSent();

    org.getUserByEmail.mockResolvedValueOnce(stored);
    await expect(callerFor(null).auth.resetPassword({ email: "ana@banco.com", code: code === "000000" ? "111111" : "000000", newPassword: "NovaSenha123" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.countEmailCodeAttempt).toHaveBeenCalledWith("ana-1", 1);
    await expect(callerFor(null).auth.resetPassword({ email: "ana@banco.com", code, newPassword: "fraca" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.setUserPassword).not.toHaveBeenCalled();

    org.getUserByEmail.mockResolvedValueOnce(stored);
    const cookie = vi.fn();
    const caller = appRouter.createCaller({ req: { ip: "10.0.0.9", secure: false, headers: {} } as never, res: { cookie, clearCookie: vi.fn() } as never, user: null });
    await expect(caller.auth.resetPassword({ email: "ana@banco.com", code, newPassword: "NovaSenha123" })).resolves.toMatchObject({ email: "ana@banco.com" });
    expect(db.setUserPassword).toHaveBeenCalledWith("ana-1", expect.stringMatching(/^scrypt\$/));
    expect(db.markEmailVerified).toHaveBeenCalledWith("ana-1");
    expect(cookie).toHaveBeenCalledTimes(1);
  });

  it("a sign-up code cannot be used to reset the password", async () => {
    org.getUserByEmail.mockResolvedValueOnce(undefined).mockResolvedValueOnce(account({ emailVerifiedAt: null }));
    await callerFor(null).auth.signup({ name: "Ana", email: "ana@banco.com", password: "Senha1234" });
    const { code, stored } = codeSent();
    org.getUserByEmail.mockResolvedValueOnce(stored);
    await expect(callerFor(null).auth.resetPassword({ email: "ana@banco.com", code, newPassword: "NovaSenha123" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.setUserPassword).not.toHaveBeenCalled();
  });
});

describe("super administrator", () => {
  it("is the only one who can list every user", async () => {
    await expect(callerFor(user()).superAdmin.users()).rejects.toMatchObject({ code: "FORBIDDEN" });
    org.listAllUsersWithPlacement.mockResolvedValue([{ openId: "x" }]);
    await expect(callerFor(user({ role: "super_admin" })).superAdmin.users()).resolves.toEqual([{ openId: "x" }]);
  });

  it("cannot deactivate their own account", async () => {
    await expect(callerFor(user({ role: "super_admin" })).superAdmin.setUserActive({ openId: "me", active: false })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.setUserActive).not.toHaveBeenCalled();
  });
});
