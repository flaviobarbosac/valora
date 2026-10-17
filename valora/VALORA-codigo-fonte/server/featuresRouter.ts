import { z } from "zod";
import { CLIENT_STAGES, COMPANY_ROLES, type CompanyMember, type User } from "../drizzle/schema";
import { COMPANY_ROLE_LABELS } from "@shared/const";
import { getClientRecordById, getUserByOpenId, listUsers } from "./db";
import * as features from "./featuresDb";
import * as org from "./orgDb";
import { fail, requireCompanyAdmin, requireMembership, resolvePlacement } from "./orgRouter";
import { isValidImageDataUrl } from "./_core/images";
import { consumeRateLimit } from "./_core/loginRateLimit";
import { protectedProcedure, publicProcedure, router, superAdminProcedure } from "./_core/trpc";

const idInput = z.number().int().positive();
const colorInput = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB.").nullable();
const labelMap = (keys: readonly string[]) => z.record(z.string(), z.string().trim().max(40)).transform((value) =>
  Object.fromEntries(Object.entries(value).filter(([key, label]) => keys.includes(key) && label.length > 0)));

async function personName(openId: string) {
  const user = await getUserByOpenId(openId);
  return user?.name || user?.email || "Alguém";
}

async function roleLabelFor(companyId: number, role: CompanyMember["role"]) {
  const settings = await features.getCompanySettings(companyId);
  return settings.roleLabels[role] || COMPANY_ROLE_LABELS[role];
}

/** People with a given level in an area of the company (to notify approvers). */
async function peopleWithRole(companyId: number, role: CompanyMember["role"], agencyId?: number | null) {
  const overview = await org.getCompanyOverview(companyId);
  return (overview?.members ?? []).filter((member) => member.role === role && (agencyId === undefined || member.agencyId === agencyId)).map((member) => member.openId);
}

/** The record, if `viewer` may see it (owner or someone above them in their area). */
async function visibleRecord(viewer: User, recordId: number) {
  const record = await getClientRecordById(recordId);
  if (!record) fail("NOT_FOUND", "Atendimento não encontrado.");
  const visible = await org.visibleOwnerOpenIds(viewer.openId);
  if (!visible.includes(record!.ownerOpenId)) fail("NOT_FOUND", "Atendimento não encontrado.");
  return record!;
}

export const featuresRouter = router({
  // ---------- Personalização (dono/administrador da empresa) ----------
  branding: protectedProcedure.query(async ({ ctx }) => {
    const member = await org.getMembership(ctx.user.openId);
    if (!member) return null;
    const [settings, positions, overview] = await Promise.all([features.getCompanySettings(member.companyId), features.listPositions(member.companyId), org.getCompanyOverview(member.companyId)]);
    return { ...settings, companyName: overview?.company.name ?? "", positions: positions.map(({ id, name, level }) => ({ id, name, level })), myPositionId: member.positionId };
  }),

  saveBranding: protectedProcedure.input(z.object({
    displayName: z.string().trim().max(120).nullable(),
    primaryColor: colorInput, darkColor: colorInput, accentColor: colorInput,
    logoDataUrl: z.string().max(400_000).nullable(),
    roleLabels: labelMap(COMPANY_ROLES),
    stageLabels: labelMap(CLIENT_STAGES),
  })).mutation(async ({ ctx, input }) => {
    const me = await requireCompanyAdmin(ctx.user);
    if (!isValidImageDataUrl(input.logoDataUrl)) fail("BAD_REQUEST", "A logo deve ser JPG, PNG ou WebP com até 300 KB.");
    await features.saveCompanySettings(me.companyId, { ...input, displayName: input.displayName || null });
    return { success: true } as const;
  }),

  createPosition: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(80), level: z.enum(COMPANY_ROLES) })).mutation(async ({ ctx, input }) => {
    const me = await requireCompanyAdmin(ctx.user);
    return { id: await features.createPosition(me.companyId, input.name, input.level) };
  }),

  updatePosition: protectedProcedure.input(z.object({ id: idInput, name: z.string().trim().min(2).max(80), level: z.enum(COMPANY_ROLES) })).mutation(async ({ ctx, input }) => {
    const me = await requireCompanyAdmin(ctx.user);
    const position = await features.getPosition(me.companyId, input.id);
    if (!position) fail("NOT_FOUND", "Cargo não encontrado.");
    // People keep their permission level, so a cargo in use cannot silently change level.
    if (position!.level !== input.level && (await features.positionInUse(me.companyId, input.id))) {
      fail("BAD_REQUEST", "Há pessoas com este cargo ou pedidos de promoção para ele. Para mudar o nível, crie um cargo novo e passe as pessoas para ele.");
    }
    await features.updatePosition(me.companyId, input.id, { name: input.name, level: input.level });
    return { success: true } as const;
  }),

  deletePosition: protectedProcedure.input(z.object({ id: idInput })).mutation(async ({ ctx, input }) => {
    const me = await requireCompanyAdmin(ctx.user);
    if (!(await features.deletePositionIfUnused(me.companyId, input.id))) fail("BAD_REQUEST", "Há pessoas com este cargo ou pedidos de promoção para ele. Mude-os antes de excluir.");
    return { success: true } as const;
  }),

  /** Admin sets someone's cargo directly; the permission level follows the cargo. */
  setMemberPosition: protectedProcedure.input(z.object({ openId: z.string().min(1).max(64), positionId: idInput.nullable() })).mutation(async ({ ctx, input }) => {
    const me = await requireCompanyAdmin(ctx.user);
    const target = await org.getMembership(input.openId);
    if (!target || target.companyId !== me.companyId) fail("NOT_FOUND", "Pessoa não encontrada na empresa.");
    if (input.positionId === null) { await features.setMemberPosition(me.companyId, input.openId, null); return { success: true } as const; }
    const position = await features.getPosition(me.companyId, input.positionId);
    if (!position) fail("NOT_FOUND", "Cargo não encontrado.");
    if (position!.level !== target!.role) {
      if (target!.role === "admin" && (await org.countMembers(me.companyId, "admin")) <= 1) fail("BAD_REQUEST", "A empresa precisa de pelo menos um administrador.");
      const placement = await resolvePlacement(me.companyId, { role: position!.level, agencyId: target!.agencyId, teamId: position!.level === "manager" ? null : target!.teamId });
      await org.updateMember(me.companyId, input.openId, placement);
    }
    await features.setMemberPosition(me.companyId, input.openId, position!.id);
    return { success: true } as const;
  }),

  // ---------- Avaliar e cobrar atendimentos ----------
  notes: protectedProcedure.input(z.object({ recordId: idInput })).query(async ({ ctx, input }) => {
    await visibleRecord(ctx.user, input.recordId);
    return features.listRecordNotes(input.recordId);
  }),

  addNote: protectedProcedure.input(z.object({
    recordId: idInput,
    kind: z.enum(["cobranca", "avaliacao", "comentario"]),
    rating: z.number().int().min(1).max(5).nullable(),
    body: z.string().trim().min(2, "Escreva uma mensagem.").max(1000),
  })).mutation(async ({ ctx, input }) => {
    const record = await visibleRecord(ctx.user, input.recordId);
    const isOwner = record.ownerOpenId === ctx.user.openId;
    if (isOwner && input.kind !== "comentario") fail("FORBIDDEN", "Só líderes e gerentes cobram ou avaliam atendimentos da equipe.");
    if (input.kind === "avaliacao" && !input.rating) fail("BAD_REQUEST", "Dê uma nota de 1 a 5.");
    await features.addRecordNote({ recordId: record.id, authorOpenId: ctx.user.openId, kind: input.kind, rating: input.kind === "avaliacao" ? input.rating : null, body: input.body });
    const author = ctx.user.name || ctx.user.email || "Alguém";
    const link = `/?atendimento=${record.id}`;
    if (!isOwner) {
      const title = input.kind === "cobranca" ? `${author} cobrou o atendimento de ${record.name}`
        : input.kind === "avaliacao" ? `${author} avaliou o atendimento de ${record.name}: ${"★".repeat(input.rating ?? 0)}`
        : `${author} comentou o atendimento de ${record.name}`;
      await features.notify([record.ownerOpenId], { title, body: input.body, link });
    } else {
      const others = (await features.listRecordNotes(record.id)).map((note) => note.authorOpenId).filter((openId) => openId !== ctx.user.openId);
      await features.notify(others, { title: `${author} respondeu sobre ${record.name}`, body: input.body, link });
    }
    return { success: true } as const;
  }),

  // ---------- Avisos ----------
  notifications: protectedProcedure.query(({ ctx }) => features.listNotifications(ctx.user.openId)),
  markNotificationsRead: protectedProcedure.input(z.object({ ids: z.array(idInput).max(100).nullable() })).mutation(async ({ ctx, input }) => {
    await features.markNotificationsRead(ctx.user.openId, input.ids ?? "all");
    return { success: true } as const;
  }),

  // ---------- Promoções: líder pede → gerente aprova → administrador aprova ----------
  promotions: protectedProcedure.query(async ({ ctx }) => {
    const me = await requireMembership(ctx.user);
    const [requests, positions, overview] = await Promise.all([features.listPromotionRequests(me.companyId), features.listPositions(me.companyId), org.getCompanyOverview(me.companyId)]);
    const members = overview?.members ?? [];
    const nameOf = (openId: string | null) => (openId ? members.find((member) => member.openId === openId)?.name ?? "Ex-membro" : null);
    const target = (openId: string) => members.find((member) => member.openId === openId);
    const visible = requests.filter((request) => {
      if (me.role === "admin") return true;
      const person = target(request.targetOpenId);
      if (me.role === "manager") return request.requestedByOpenId === ctx.user.openId || (person && person.agencyId === me.agencyId);
      return request.requestedByOpenId === ctx.user.openId || request.targetOpenId === ctx.user.openId;
    });
    return visible.map((request) => {
      const person = target(request.targetOpenId);
      return {
        ...request,
        targetName: nameOf(request.targetOpenId), requestedByName: nameOf(request.requestedByOpenId),
        managerName: nameOf(request.managerOpenId), adminName: nameOf(request.adminOpenId),
        currentRole: person?.role ?? null,
        currentPositionName: positions.find((position) => position.id === person?.positionId)?.name ?? null,
        toPositionName: positions.find((position) => position.id === request.toPositionId)?.name ?? "Cargo removido",
        toLevel: positions.find((position) => position.id === request.toPositionId)?.level ?? null,
        agencyName: overview?.agencies.find((agency) => agency.id === person?.agencyId)?.name ?? null,
        teamName: overview?.teams.find((team) => team.id === person?.teamId)?.name ?? null,
        canDecide: (me.role === "manager" && request.status === "pending_manager" && person?.agencyId === me.agencyId) || (me.role === "admin" && request.status === "pending_admin"),
        canCancel: request.requestedByOpenId === ctx.user.openId && (request.status === "pending_manager" || request.status === "pending_admin"),
      };
    });
  }),

  requestPromotion: protectedProcedure.input(z.object({
    targetOpenId: z.string().min(1).max(64), toPositionId: idInput,
    reason: z.string().trim().min(10, "Explique o motivo (pelo menos 10 caracteres).").max(1000),
    raiseNote: z.string().trim().max(200).nullable(),
  })).mutation(async ({ ctx, input }) => {
    const me = await requireMembership(ctx.user);
    if (me.role === "member") fail("FORBIDDEN", "Só líderes, gerentes e administradores pedem promoções.");
    const target = await org.getMembership(input.targetOpenId);
    if (!target || target.companyId !== me.companyId || input.targetOpenId === ctx.user.openId) fail("NOT_FOUND", "Pessoa não encontrada.");
    if (me.role !== "admin" && !(await org.visibleOwnerOpenIds(ctx.user.openId)).includes(input.targetOpenId)) fail("FORBIDDEN", "Você só pode pedir promoção para pessoas da sua área.");
    const position = await features.getPosition(me.companyId, input.toPositionId);
    if (!position) fail("NOT_FOUND", "Cargo não encontrado.");
    if (target!.positionId === position!.id) fail("BAD_REQUEST", "A pessoa já tem esse cargo.");
    if (await features.hasOpenPromotion(me.companyId, input.targetOpenId)) fail("CONFLICT", "Já existe um pedido de promoção em andamento para essa pessoa.");

    const managers = await peopleWithRole(me.companyId, "manager", target!.agencyId);
    const status = me.role === "leader" && managers.length ? "pending_manager" as const : "pending_admin" as const;
    const id = await features.createPromotionRequest({ companyId: me.companyId, targetOpenId: input.targetOpenId, requestedByOpenId: ctx.user.openId, toPositionId: position!.id, reason: input.reason, raiseNote: input.raiseNote || null, status });
    const targetName = await personName(input.targetOpenId);
    const next = status === "pending_manager" ? managers : await peopleWithRole(me.companyId, "admin");
    await features.notify(next, { title: `Pedido de promoção: ${targetName} para ${position!.name}`, body: input.reason, link: "/?tela=promocoes" });
    return { id, status };
  }),

  decidePromotion: protectedProcedure.input(z.object({ id: idInput, approve: z.boolean(), note: z.string().trim().max(500).nullable() })).mutation(async ({ ctx, input }) => {
    const me = await requireMembership(ctx.user);
    const request = await features.getPromotionRequest(me.companyId, input.id);
    if (!request) fail("NOT_FOUND", "Pedido não encontrado.");
    const target = await org.getMembership(request!.targetOpenId);
    const position = await features.getPosition(me.companyId, request!.toPositionId);
    const targetName = await personName(request!.targetOpenId);
    const note = input.note || null;

    if (request!.status === "pending_manager") {
      if (me.role !== "manager" || !target || target.agencyId !== me.agencyId) fail("FORBIDDEN", "Este pedido está com o gerente da agência.");
      await features.decidePromotion(request!.id, "manager", { status: input.approve ? "pending_admin" : "rejected", deciderOpenId: ctx.user.openId, note });
      if (input.approve) await features.notify(await peopleWithRole(me.companyId, "admin"), { title: `Promoção aprovada pela gerência: ${targetName} para ${position?.name ?? "novo cargo"}`, body: "Aguardando a aprovação final da administração.", link: "/?tela=promocoes" });
      else await features.notify([request!.requestedByOpenId], { title: `A gerência recusou a promoção de ${targetName}`, body: note, link: "/?tela=promocoes" });
      return { status: input.approve ? "pending_admin" : "rejected" };
    }

    if (request!.status === "pending_admin") {
      if (me.role !== "admin") fail("FORBIDDEN", "Este pedido está com a administração.");
      const involved = [request!.requestedByOpenId, request!.managerOpenId ?? ""];
      if (!input.approve) {
        await features.decidePromotion(request!.id, "admin", { status: "rejected", deciderOpenId: ctx.user.openId, note });
        await features.notify(involved, { title: `A administração recusou a promoção de ${targetName}`, body: note, link: "/?tela=promocoes" });
        return { status: "rejected" };
      }
      if (!target || target.companyId !== me.companyId) fail("BAD_REQUEST", "Essa pessoa não está mais na empresa.");
      if (!position) fail("BAD_REQUEST", "O cargo do pedido foi excluído. Recuse o pedido e crie outro.");
      if (target!.role === "admin" && position!.level !== "admin" && (await org.countMembers(me.companyId, "admin")) <= 1) fail("BAD_REQUEST", "A empresa precisa de pelo menos um administrador.");
      const placement = await resolvePlacement(me.companyId, { role: position!.level, agencyId: target!.agencyId, teamId: position!.level === "manager" ? null : target!.teamId });
      await features.applyPromotion(request!.id, me.companyId, request!.targetOpenId, { ...placement, positionId: position!.id }, { openId: ctx.user.openId, note });
      await features.notify([request!.targetOpenId], { title: `Parabéns! Você foi promovido a ${position!.name}`, body: request!.raiseNote ? `Observação: ${request!.raiseNote}` : null, link: "/" });
      await features.notify(involved, { title: `Promoção aprovada: ${targetName} agora é ${position!.name} (${await roleLabelFor(me.companyId, position!.level)})`, body: note, link: "/?tela=promocoes" });
      return { status: "approved" };
    }
    return fail("BAD_REQUEST", "Este pedido já foi decidido.");
  }),

  cancelPromotion: protectedProcedure.input(z.object({ id: idInput })).mutation(async ({ ctx, input }) => {
    const me = await requireMembership(ctx.user);
    const request = await features.getPromotionRequest(me.companyId, input.id);
    if (!request || request.requestedByOpenId !== ctx.user.openId) fail("NOT_FOUND", "Pedido não encontrado.");
    if (request!.status !== "pending_manager" && request!.status !== "pending_admin") fail("BAD_REQUEST", "Este pedido já foi decidido.");
    await features.decidePromotion(request!.id, request!.status === "pending_manager" ? "manager" : "admin", { status: "cancelled", deciderOpenId: ctx.user.openId, note: "Cancelado por quem pediu." });
    return { success: true } as const;
  }),

  // ---------- Relatar erro ----------
  reportBug: publicProcedure.input(z.object({
    category: z.enum(["erro", "lentidao", "visual", "sugestao", "outro"]),
    description: z.string().trim().min(10, "Descreva o problema com pelo menos 10 caracteres.").max(5000),
    email: z.string().trim().max(320).email().nullable(),
    pageUrl: z.string().max(300).nullable(),
    userAgent: z.string().max(300).nullable(),
    technicalLog: z.string().max(50_000).nullable(),
  })).mutation(async ({ ctx, input }) => {
    if (!consumeRateLimit(`bug:${ctx.req.ip ?? "unknown"}`, 20, 60 * 60 * 1000)) fail("TOO_MANY_REQUESTS", "Muitos relatos em pouco tempo. Tente de novo mais tarde.");
    const reporter = ctx.actor ?? ctx.user;
    const id = await features.createBugReport({ ...input, reporterOpenId: reporter?.openId ?? null, email: reporter?.email ?? input.email });
    const superAdmins = (await listUsers()).filter((user) => user.role === "super_admin" && user.isActive).map((user) => user.openId);
    await features.notify(superAdmins, { title: `Novo relato de erro #${id}`, body: input.description.slice(0, 300), link: "/?tela=relatos" });
    return { id };
  }),

  bugReports: superAdminProcedure.query(() => features.listBugReports()),
  setBugStatus: superAdminProcedure.input(z.object({ id: idInput, status: z.enum(["new", "in_progress", "resolved"]) })).mutation(async ({ input }) => {
    await features.setBugStatus(input.id, input.status);
    return { success: true } as const;
  }),
});

