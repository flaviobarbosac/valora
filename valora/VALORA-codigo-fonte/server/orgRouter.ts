import { COMPANY_ROLE_LABELS, INVITE_VALID_DAYS, normalizeEmail } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { COMPANY_ROLES, type CompanyMember, type User } from "../drizzle/schema";
import { setUserActive } from "./db";
import { getCompanySettings } from "./featuresDb";
import * as org from "./orgDb";
import * as ws from "./workspaceDb";
import { templateByKey } from "@shared/pipeline";
import { ENV } from "./_core/env";
import { consumeRateLimit } from "./_core/loginRateLimit";
import { isMailConfigured, sendInviteEmail } from "./_core/mailer";
import { protectedProcedure, publicProcedure, router, superAdminProcedure } from "./_core/trpc";

const nameInput = z.string().trim().min(2, "Use pelo menos 2 caracteres.").max(120);
const idInput = z.number().int().positive();
const roleInput = z.enum(COMPANY_ROLES);
const placementInput = z.object({
  role: roleInput,
  agencyId: idInput.nullable(),
  teamId: idInput.nullable(),
});

export const hashInviteToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newInviteToken = () => randomBytes(32).toString("base64url");
const inviteExpiry = () => new Date(Date.now() + INVITE_VALID_DAYS * 24 * 60 * 60 * 1000);
const inviteLink = (token: string) => `${ENV.appUrl}/convite/${token}`;

export const fail = (code: "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "TOO_MANY_REQUESTS", message: string): never => {
  throw new TRPCError({ code, message });
};

export async function requireMembership(user: User) {
  const member = await org.getMembership(user.openId);
  if (!member) fail("FORBIDDEN", "Você não faz parte de uma empresa.");
  return member!;
}

export async function requireCompanyAdmin(user: User) {
  const member = await requireMembership(user);
  if (member.role !== "admin") fail("FORBIDDEN", "Só o administrador da empresa pode fazer isso.");
  return member;
}

/** Turns the requested role/agency/team into a consistent placement inside `companyId`. */
export async function resolvePlacement(companyId: number, input: z.infer<typeof placementInput>): Promise<org.Placement> {
  const { role } = input;
  if (role === "admin") return { role, agencyId: null, teamId: null };
  if (role === "manager") {
    if (!input.agencyId) fail("BAD_REQUEST", "Escolha a agência que o gerente vai cuidar.");
    if (!(await org.getAgency(companyId, input.agencyId!))) fail("BAD_REQUEST", "Agência não encontrada.");
    return { role, agencyId: input.agencyId, teamId: null };
  }
  if (input.teamId) {
    const team = await org.getTeam(companyId, input.teamId);
    if (!team) fail("BAD_REQUEST", "Equipe não encontrada.");
    return { role, agencyId: team!.agencyId, teamId: team!.id };
  }
  if (role === "leader") fail("BAD_REQUEST", "Escolha a equipe que o líder vai cuidar.");
  if (input.agencyId) {
    if (!(await org.getAgency(companyId, input.agencyId))) fail("BAD_REQUEST", "Agência não encontrada.");
    return { role, agencyId: input.agencyId, teamId: null };
  }
  return { role, agencyId: null, teamId: null };
}

async function ensureAnotherAdmin(member: CompanyMember, message: string) {
  if (member.role === "admin" && (await org.countMembers(member.companyId, "admin")) <= 1) fail("BAD_REQUEST", message);
}

function placementLabel(context: { agencyName: string | null; teamName: string | null }) {
  return [context.agencyName && `agência ${context.agencyName}`, context.teamName && `equipe ${context.teamName}`].filter(Boolean).join(", ") || null;
}

async function issueInvite(inviteId: number, invite: { email: string; role: CompanyMember["role"]; companyId: number; agencyId: number | null; teamId: number | null; invitedByOpenId: string }, token: string, expiresAt: Date) {
  const context = await org.getInvitationContext(invite);
  const link = inviteLink(token);
  const emailSent = await sendInviteEmail({
    to: invite.email, link, companyName: context.companyName, inviterName: context.inviterName,
    roleLabel: COMPANY_ROLE_LABELS[invite.role], placement: placementLabel(context), expiresAt,
  });
  return { id: inviteId, link, emailSent, mailConfigured: isMailConfigured() };
}

type InviteCheck =
  | { ok: true; invite: NonNullable<Awaited<ReturnType<typeof org.getInvitationByTokenHash>>> }
  | { ok: false; reason: "invalid" | "used" | "revoked" | "expired" };

export async function checkInviteToken(token: string): Promise<InviteCheck> {
  const invite = await org.getInvitationByTokenHash(hashInviteToken(token));
  if (!invite) return { ok: false, reason: "invalid" };
  if (invite.acceptedAt) return { ok: false, reason: "used" };
  if (invite.revokedAt) return { ok: false, reason: "revoked" };
  if (invite.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, invite };
}

const INVITE_PROBLEM: Record<"invalid" | "used" | "revoked" | "expired", string> = {
  invalid: "Este convite não existe. Confira se o link foi copiado inteiro.",
  used: "Este convite já foi usado.",
  revoked: "Este convite foi cancelado pelo administrador.",
  expired: "Este convite venceu. Peça um novo ao administrador.",
};

/** Joins `user` to the company of a valid invitation. Shared by sign-up and the accept screen. */
export async function joinWithInvite(user: Pick<User, "openId" | "email">, token: string) {
  const check = await checkInviteToken(token);
  if (!check.ok) fail("BAD_REQUEST", INVITE_PROBLEM[check.reason]);
  const { invite } = check as Extract<InviteCheck, { ok: true }>;
  if (await org.getMembership(user.openId)) fail("CONFLICT", "Você já faz parte de uma empresa. Saia dela antes de aceitar outro convite.");
  if (user.email && normalizeEmail(user.email) !== invite.email) fail("FORBIDDEN", "Este convite foi enviado para outro e-mail.");
  if (!user.email) {
    const owner = await org.getUserByEmail(invite.email);
    if (owner && owner.openId !== user.openId) fail("CONFLICT", "Este e-mail já pertence a outra conta. Entre com ela para aceitar o convite.");
  }
  try {
    await org.acceptInvitation(invite.id, user.openId, user.email ? null : invite.email);
  } catch {
    fail("CONFLICT", "Este convite já foi usado.");
  }
  return { companyId: invite.companyId };
}

/** Members a person may list: admin → everyone; manager → agency; leader/member → own team. */
function visibleMembers<T extends { openId: string; agencyId: number | null; teamId: number | null }>(me: CompanyMember, members: T[]) {
  if (me.role === "admin") return members;
  if (me.role === "manager") return members.filter((member) => member.agencyId === me.agencyId || member.openId === me.userOpenId);
  return members.filter((member) => (me.teamId !== null && member.teamId === me.teamId) || member.openId === me.userOpenId);
}

/** A product of the admin's company; with none given, the company's first product. */
async function companyProductId(me: CompanyMember, productId: number | null) {
  const space = { kind: "company" as const, companyId: me.companyId, member: me };
  if (productId) {
    if (!(await ws.getWorkspaceProduct(space, productId))) fail("BAD_REQUEST", "Produto não encontrado.");
    return productId;
  }
  const [first] = await ws.listProducts(space);
  return first?.id ?? null;
}

export const organizationRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const member = await org.getMembership(ctx.user.openId);
    if (!member) return { membership: null, mailConfigured: isMailConfigured() };
    const overview = await org.getCompanyOverview(member.companyId);
    if (!overview) return { membership: null, mailConfigured: isMailConfigured() };
    const isAdmin = member.role === "admin";
    const members = visibleMembers(member, overview.members).map((row) =>
      isAdmin ? row : { ...row, email: null, agencyCode: null, username: null },
    );
    return {
      membership: { role: member.role, agencyId: member.agencyId, teamId: member.teamId },
      company: { id: overview.company.id, name: overview.company.name },
      agencies: overview.agencies.map(({ id, name, productId }) => ({ id, name, productId })),
      teams: overview.teams.map(({ id, name, agencyId }) => ({ id, name, agencyId })),
      members,
      invitations: isAdmin ? await org.listPendingInvitations(member.companyId) : [],
      mailConfigured: isMailConfigured(),
    };
  }),

  // Painel de agências: numbers only (goals, clients served, sales, technical cases), no client data.
  performance: protectedProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }))
    .query(async ({ ctx, input }) => {
      const me = await requireMembership(ctx.user);
      if (me.role === "member") fail("FORBIDDEN", "Só administradores, gerentes e líderes veem o painel de desempenho.");
      if (me.role === "manager" && !me.agencyId) fail("BAD_REQUEST", "Você ainda não foi colocado em uma agência.");
      if (me.role === "leader" && !me.teamId) fail("BAD_REQUEST", "Você ainda não foi colocado em uma equipe.");
      const data = await org.agencyPerformance(me.companyId, input.month, me.role === "admin" ? null : me.agencyId, me.role === "leader" ? me.teamId : null);
      if (!data) fail("NOT_FOUND", "Empresa não encontrada.");
      const scope = me.role === "admin" ? ("company" as const) : me.role === "manager" ? ("agency" as const) : ("team" as const);
      return { ...data!, scope };
    }),

  // The company starts with one product, from the template of what it sells.
  createCompany: protectedProcedure.input(z.object({ name: nameInput, template: z.string().max(30).optional(), productName: z.string().trim().min(2).max(80).optional() })).mutation(async ({ ctx, input }) => {
    if (await org.getMembership(ctx.user.openId)) fail("CONFLICT", "Você já faz parte de uma empresa.");
    const companyId = await org.createCompanyWithAdmin(ctx.user.openId, input.name);
    const template = templateByKey(input.template);
    const member = (await org.getMembership(ctx.user.openId))!;
    await ws.createProduct({ kind: "company", companyId, member }, { name: input.productName || template.name, template: template.key, color: template.color });
    return { companyId };
  }),

  renameCompany: protectedProcedure.input(z.object({ name: nameInput })).mutation(async ({ ctx, input }) => {
    const me = await requireCompanyAdmin(ctx.user);
    await org.renameCompany(me.companyId, input.name);
    return { success: true } as const;
  }),

  leave: protectedProcedure.mutation(async ({ ctx }) => {
    const me = await requireMembership(ctx.user);
    if (me.role === "admin" && (await org.countMembers(me.companyId, "admin")) <= 1) {
      if ((await org.countMembers(me.companyId)) > 1) {
        fail("BAD_REQUEST", "Você é o único administrador. Promova outra pessoa a administrador antes de sair.");
      }
      await org.deleteCompany(me.companyId);
      return { companyDeleted: true };
    }
    await org.removeMember(me.companyId, ctx.user.openId);
    return { companyDeleted: false };
  }),

  // Each agency sells one product: its people work with that product's pipeline.
  createAgency: protectedProcedure.input(z.object({ name: nameInput, productId: idInput.nullable().optional() })).mutation(async ({ ctx, input }) => {
    const me = await requireCompanyAdmin(ctx.user);
    const productId = await companyProductId(me, input.productId ?? null);
    await org.createAgency(me.companyId, input.name, productId);
    return { success: true } as const;
  }),

  setAgencyProduct: protectedProcedure.input(z.object({ id: idInput, productId: idInput })).mutation(async ({ ctx, input }) => {
    const me = await requireCompanyAdmin(ctx.user);
    if (!(await org.getAgency(me.companyId, input.id))) fail("NOT_FOUND", "Agência não encontrada.");
    await org.setAgencyProduct(me.companyId, input.id, await companyProductId(me, input.productId));
    return { success: true } as const;
  }),

  renameAgency: protectedProcedure.input(z.object({ id: idInput, name: nameInput })).mutation(async ({ ctx, input }) => {
    const me = await requireCompanyAdmin(ctx.user);
    if (!(await org.getAgency(me.companyId, input.id))) fail("NOT_FOUND", "Agência não encontrada.");
    await org.renameAgency(me.companyId, input.id, input.name);
    return { success: true } as const;
  }),

  deleteAgency: protectedProcedure.input(z.object({ id: idInput })).mutation(async ({ ctx, input }) => {
    const me = await requireCompanyAdmin(ctx.user);
    if (!(await org.getAgency(me.companyId, input.id))) fail("NOT_FOUND", "Agência não encontrada.");
    if (!(await org.deleteAgencyIfEmpty(me.companyId, input.id))) fail("BAD_REQUEST", "Mova ou remova as equipes e as pessoas da agência antes de excluí-la.");
    return { success: true } as const;
  }),

  createTeam: protectedProcedure.input(z.object({ agencyId: idInput, name: nameInput })).mutation(async ({ ctx, input }) => {
    const me = await requireCompanyAdmin(ctx.user);
    if (!(await org.getAgency(me.companyId, input.agencyId))) fail("BAD_REQUEST", "Agência não encontrada.");
    await org.createTeam(me.companyId, input.agencyId, input.name);
    return { success: true } as const;
  }),

  renameTeam: protectedProcedure.input(z.object({ id: idInput, name: nameInput })).mutation(async ({ ctx, input }) => {
    const me = await requireCompanyAdmin(ctx.user);
    if (!(await org.getTeam(me.companyId, input.id))) fail("NOT_FOUND", "Equipe não encontrada.");
    await org.renameTeam(me.companyId, input.id, input.name);
    return { success: true } as const;
  }),

  deleteTeam: protectedProcedure.input(z.object({ id: idInput })).mutation(async ({ ctx, input }) => {
    const me = await requireCompanyAdmin(ctx.user);
    if (!(await org.getTeam(me.companyId, input.id))) fail("NOT_FOUND", "Equipe não encontrada.");
    if (!(await org.deleteTeamIfEmpty(me.companyId, input.id))) fail("BAD_REQUEST", "Mova ou remova as pessoas da equipe antes de excluí-la.");
    return { success: true } as const;
  }),

  updateMember: protectedProcedure.input(placementInput.extend({ openId: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
    const me = await requireCompanyAdmin(ctx.user);
    const target = await org.getMembership(input.openId);
    if (!target || target.companyId !== me.companyId) fail("NOT_FOUND", "Pessoa não encontrada na empresa.");
    if (input.role !== "admin") await ensureAnotherAdmin(target!, "A empresa precisa de pelo menos um administrador.");
    const placement = await resolvePlacement(me.companyId, input);
    await org.updateMember(me.companyId, input.openId, placement);
    return { success: true } as const;
  }),

  removeMember: protectedProcedure.input(z.object({ openId: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
    const me = await requireCompanyAdmin(ctx.user);
    if (input.openId === ctx.user.openId) fail("BAD_REQUEST", "Para sair da empresa, use a opção Sair da empresa.");
    const target = await org.getMembership(input.openId);
    if (!target || target.companyId !== me.companyId) fail("NOT_FOUND", "Pessoa não encontrada na empresa.");
    await org.removeMember(me.companyId, input.openId);
    return { success: true } as const;
  }),

  invite: protectedProcedure
    .input(placementInput.extend({ email: z.string().trim().max(320).email("Informe um e-mail válido.") }))
    .mutation(async ({ ctx, input }) => {
      const me = await requireCompanyAdmin(ctx.user);
      if (!consumeRateLimit(`invite:${me.companyId}`, 60, 60 * 60 * 1000)) fail("TOO_MANY_REQUESTS", "Muitos convites em pouco tempo. Tente de novo em alguns minutos.");
      const email = normalizeEmail(input.email);
      const existing = await org.getUserByEmail(email);
      if (existing) {
        const membership = await org.getMembership(existing.openId);
        if (membership?.companyId === me.companyId) fail("CONFLICT", "Essa pessoa já faz parte da empresa.");
        if (membership) fail("CONFLICT", "Essa pessoa já faz parte de outra empresa.");
      }
      const placement = await resolvePlacement(me.companyId, input);
      const token = newInviteToken();
      const expiresAt = inviteExpiry();
      const invite = { email, companyId: me.companyId, invitedByOpenId: ctx.user.openId, ...placement };
      const id = await org.createInvitation({ companyId: me.companyId, email, placement, tokenHash: hashInviteToken(token), invitedByOpenId: ctx.user.openId, expiresAt });
      return issueInvite(id, invite, token, expiresAt);
    }),

  resendInvite: protectedProcedure.input(z.object({ id: idInput })).mutation(async ({ ctx, input }) => {
    const me = await requireCompanyAdmin(ctx.user);
    const invite = await org.getInvitation(me.companyId, input.id);
    if (!invite || invite.acceptedAt || invite.revokedAt) fail("NOT_FOUND", "Convite não encontrado.");
    // Only the hash is stored, so a fresh link replaces the old one.
    const token = newInviteToken();
    const expiresAt = inviteExpiry();
    await org.replaceInvitationToken(invite!.id, hashInviteToken(token), expiresAt);
    return issueInvite(invite!.id, invite!, token, expiresAt);
  }),

  revokeInvite: protectedProcedure.input(z.object({ id: idInput })).mutation(async ({ ctx, input }) => {
    const me = await requireCompanyAdmin(ctx.user);
    await org.revokeInvitation(me.companyId, input.id);
    return { success: true } as const;
  }),

  previewInvite: publicProcedure.input(z.object({ token: z.string().min(10).max(100) })).query(async ({ input }) => {
    const check = await checkInviteToken(input.token);
    if (!check.ok) return { valid: false as const, problem: INVITE_PROBLEM[check.reason] };
    const context = await org.getInvitationContext(check.invite);
    const settings = await getCompanySettings(check.invite.companyId);
    return {
      valid: true as const,
      roleLabel: settings.roleLabels[check.invite.role] || COMPANY_ROLE_LABELS[check.invite.role],
      companyDisplayName: settings.displayName,
      email: check.invite.email,
      role: check.invite.role,
      expiresAt: check.invite.expiresAt,
      ...context,
    };
  }),

  acceptInvite: protectedProcedure.input(z.object({ token: z.string().min(10).max(100) })).mutation(({ ctx, input }) =>
    joinWithInvite(ctx.user, input.token),
  ),
});

export const superAdminRouter = router({
  users: superAdminProcedure.query(() => org.listAllUsersWithPlacement()),
  companies: superAdminProcedure.query(() => org.listCompaniesSummary()),
  setUserActive: superAdminProcedure.input(z.object({ openId: z.string().min(1).max(64), active: z.boolean() })).mutation(async ({ ctx, input }) => {
    if (input.openId === ctx.user.openId) fail("BAD_REQUEST", "Você não pode desativar a própria conta.");
    await setUserActive(input.openId, input.active);
    return { success: true } as const;
  }),
});
