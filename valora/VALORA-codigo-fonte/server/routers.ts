import { COOKIE_NAME, normalizeEmail } from "@shared/const";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { type User } from "../drizzle/schema";
import { cleanCustomValues, parseCustomValues, saleStatusOfKind } from "@shared/pipeline";
import {
  createClientRecord,
  countEmailCodeAttempt,
  createUser,
  deleteClientRecord,
  markEmailVerified,
  setEmailCode,
  deleteUserAndData,
  getClientRecord,
  getClientRecordById,
  getOwnerProfile,
  getOwnerGoals,
  listClientRecords,
  saveOwnerGoals,
  saveOwnerProfile,
  setUserPassword,
  touchUserSignIn,
  updateClientRecord,
} from "./db";
import * as org from "./orgDb";
import { checkInviteToken, joinWithInvite, organizationRouter, superAdminRouter } from "./orgRouter";
import { featuresRouter } from "./featuresRouter";
import * as ws from "./workspaceDb";
import { customersRouter, workspaceRouter } from "./workspaceRouter";
import { latestRatings, noteCounts } from "./featuresDb";
import { getSessionCookieOptions } from "./_core/cookies";
import { EMAIL_CODE_MAX_ATTEMPTS, EMAIL_CODE_VALID_MINUTES, emailCodeExpiry, emailCodeMatches, emailCodeRecentlySent, hashEmailCode, newEmailCode, type EmailCodePurpose } from "./_core/emailCode";
import { isMailConfigured, sendVerificationEmail } from "./_core/mailer";
import { isValidImageDataUrl } from "./_core/images";
import { clearLoginFailures, consumeRateLimit, loginRetryAfterSeconds, recordLoginFailure } from "./_core/loginRateLimit";
import { PASSWORD_MAX_LENGTH, burnPasswordCheck, hashPassword, passwordPolicyError, verifyPassword } from "./_core/password";
import { createSessionToken, sessionMaxAgeMs } from "./_core/session";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import type { TrpcContext } from "./_core/context";

const INVALID_LOGIN_MSG = "E-mail ou senha incorretos.";

const loginInput = z.object({
  email: z.string().max(320),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

const signupInput = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(100),
  email: z.string().trim().max(320).email("Informe um e-mail válido."),
  password: z.string().max(PASSWORD_MAX_LENGTH),
  inviteToken: z.string().min(10).max(100).optional(),
});

const changePasswordInput = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: z.string().max(PASSWORD_MAX_LENGTH),
});

/** What the browser is allowed to know about the signed-in user (never the password hash). */
function publicUser(user: User) {
  return { id: user.id, openId: user.openId, name: user.name, email: user.email, role: user.role, isSuperAdmin: user.role === "super_admin" };
}

async function setSessionCookie(ctx: TrpcContext, user: User) {
  const token = await createSessionToken(user);
  ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: sessionMaxAgeMs() });
}

/**
 * Sends a fresh 6-digit code to the account's e-mail. A sign-up code is not
 * re-sent within a minute (the last one is still valid); password-reset
 * requests are limited per e-mail instead, since the last code may have been
 * a sign-up one.
 */
async function sendEmailCode(user: User, purpose: EmailCodePurpose = "verify") {
  if (purpose === "verify" && emailCodeRecentlySent(user.emailCodeExpiresAt)) return { emailSent: isMailConfigured(), mailConfigured: isMailConfigured() };
  const code = newEmailCode();
  await setEmailCode(user.openId, hashEmailCode(user.openId, code, purpose), emailCodeExpiry());
  const emailSent = await sendVerificationEmail({ to: user.email ?? "", name: user.name ?? "", code, validMinutes: EMAIL_CODE_VALID_MINUTES, purpose });
  return { emailSent, mailConfigured: isMailConfigured() };
}

const WRONG_CODE_MSG = "Código incorreto ou vencido. Confira o e-mail ou peça um novo código.";

/** Checks a pending e-mail code, counting wrong guesses. Throws the same message for every failure. */
async function requireEmailCode(user: User | undefined, code: string, purpose: EmailCodePurpose): Promise<User> {
  const wrong = () => new TRPCError({ code: "BAD_REQUEST", message: WRONG_CODE_MSG });
  if (!user || !user.isActive) throw wrong();
  if (!user.emailCodeExpiresAt || user.emailCodeExpiresAt.getTime() < Date.now()) throw wrong();
  if (user.emailCodeAttempts >= EMAIL_CODE_MAX_ATTEMPTS) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Muitos códigos errados. Peça um novo código." });
  }
  if (!emailCodeMatches(user.openId, code, user.emailCodeHash, purpose)) {
    await countEmailCodeAttempt(user.openId, user.emailCodeAttempts + 1);
    throw wrong();
  }
  return user;
}

const codeInput = z.string().trim().regex(/^\d{6}$/, "Digite os 6 números do código.");

const verificationNeeded = (email: string, delivery: { emailSent: boolean; mailConfigured: boolean }) =>
  ({ status: "verify_email" as const, email, ...delivery });

const idInput = z.object({ id: z.number().int().positive() });
const stageKey = z.string().regex(/^[a-z0-9_]{1,40}$/, "Etapa inválida.");
const clientFields = z.object({
  name: z.string().trim().min(1, "Informe o nome do cliente").max(160),
  contact: z.string().trim().max(100).nullable(),
  contactDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  lastProductSold: z.string().trim().max(160).nullable(),
  /** Loss reason key, from the product's reasons. */
  objection: z.string().max(40).nullable(),
  objectionNotes: z.string().trim().max(2000).nullable(),
  stage: stageKey,
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  customerId: z.number().int().positive().nullable(),
  customFields: z.record(z.string().max(40), z.string().max(2000)),
});
type ClientFields = z.infer<typeof clientFields>;

/** The product (pipeline) of a record; older records fall back to the owner's current product. */
async function productOfRecord(record: { productId: number | null; ownerOpenId: string }) {
  const [saved] = record.productId ? await ws.getProductsByIds([record.productId]) : [];
  return saved ?? (await ws.productForUser(record.ownerOpenId, true))!;
}

/** A customer can be linked only by whoever registered them. */
async function requireOwnCustomer(ownerOpenId: string, customerId: number | null) {
  if (!customerId) return;
  const customer = await ws.getCustomer(customerId);
  if (!customer || customer.ownerOpenId !== ownerOpenId) throw new TRPCError({ code: "BAD_REQUEST", message: "Cliente cadastrado não encontrado." });
}

function stageOf(product: ws.Product, key: string) {
  const stage = product.config.stages.find((item) => item.key === key);
  if (!stage) throw new TRPCError({ code: "BAD_REQUEST", message: "Essa etapa não existe no pipeline deste produto." });
  return stage;
}

/** Checks a record against its product's pipeline and turns it into database values. */
async function recordValues(ownerOpenId: string, product: ws.Product, input: ClientFields) {
  const stage = stageOf(product, input.stage);
  const reasons = product.config.reasons;
  const objection = input.objection && reasons.some((reason) => reason.key === input.objection) ? input.objection : null;
  if (stage.kind === "lost" && reasons.length && !objection) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe por que não fechou." });
  const custom = cleanCustomValues(product.config.fields, input.customFields);
  if (custom.problem) throw new TRPCError({ code: "BAD_REQUEST", message: custom.problem });
  await requireOwnCustomer(ownerOpenId, input.customerId);
  const { customFields: _raw, ...base } = input;
  return { ...base, objection, saleStatus: saleStatusOfKind(stage.kind), customFields: JSON.stringify(custom.values), productId: product.id };
}

const isValidAvatarDataUrl = (value: string | null) => isValidImageDataUrl(value);


const profileInput = z.object({
  displayName: z.string().trim().min(1, "Informe seu nome de exibição.").max(100),
  jobTitle: z.string().trim().max(100),
  avatarDataUrl: z.string().max(400_000).nullable(),
}).superRefine((data, context) => {
  if (!isValidAvatarDataUrl(data.avatarDataUrl)) {
    context.addIssue({ code: "custom", path: ["avatarDataUrl"], message: "A foto deve ser JPG, PNG ou WebP válida e ter até 300 KB após a compressão." });
  }
});

/**
 * The owner can always edit. A "caso técnico" can also be edited by the managers
 * of the owner's agency, who become responsible for it.
 */
async function requireEditableRecord(viewerOpenId: string, id: number) {
  const record = await getClientRecordById(id);
  if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Atendimento não encontrado." });
  if (record.ownerOpenId === viewerOpenId) return record;
  if (record.stage === "technical" && (await org.technicalCaseOwners(viewerOpenId)).has(record.ownerOpenId)) return record;
  // Same answer as a missing record, so nobody can probe other people's ids.
  throw new TRPCError({ code: "NOT_FOUND", message: "Atendimento não encontrado." });
}

function makeReference() {
  const date = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `VLR-${date}-${suffix}`;
}

export const appRouter = router({
  system: systemRouter,
  organization: organizationRouter,
  features: featuresRouter,
  superAdmin: superAdminRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => {
      if (!ctx.user) return null;
      const viewedBy = ctx.viewingAs && ctx.actor ? { name: ctx.actor.name, email: ctx.actor.email } : null;
      return { ...publicUser(ctx.user), viewedBy };
    }),
    login: publicProcedure.input(loginInput).mutation(async ({ ctx, input }) => {
      const ip = ctx.req.ip ?? "unknown";
      const email = normalizeEmail(input.email);
      const account = email;

      const retryAfter = loginRetryAfterSeconds(ip, account);
      if (retryAfter > 0) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Muitas tentativas. Aguarde ${Math.ceil(retryAfter / 60)} min e tente novamente.` });
      }

      const user = email ? await org.getUserByEmail(email) : undefined;
      let valid = false;
      if (user) valid = await verifyPassword(input.password, user.passwordHash);
      else await burnPasswordCheck(input.password);
      if (!user || !valid || !user.isActive) {
        recordLoginFailure(ip, account);
        throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_LOGIN_MSG });
      }

      clearLoginFailures(ip, account);
      if (!user.emailVerifiedAt) {
        // The password was right, so it is safe to say what is missing.
        await sendEmailCode(user);
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Confirme seu e-mail para entrar. Enviamos um código de 6 dígitos para ele." });
      }
      await touchUserSignIn(user.openId);
      await setSessionCookie(ctx, user);
      return { ...publicUser(user), viewedBy: null };
    }),
    signup: publicProcedure.input(signupInput).mutation(async ({ ctx, input }) => {
      const ip = ctx.req.ip ?? "unknown";
      if (!consumeRateLimit(`signup:${ip}`, 10, 60 * 60 * 1000)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitos cadastros feitos a partir desta rede. Tente de novo mais tarde." });
      }
      const email = normalizeEmail(input.email);
      const policyError = passwordPolicyError(input.password);
      if (policyError) throw new TRPCError({ code: "BAD_REQUEST", message: policyError });
      if (input.inviteToken) {
        const check = await checkInviteToken(input.inviteToken);
        if (!check.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "Este convite não é mais válido. Peça um novo ao administrador." });
        if (check.invite.email !== email) throw new TRPCError({ code: "BAD_REQUEST", message: "Use o mesmo e-mail que recebeu o convite." });
      }
      const existing = await org.getUserByEmail(email);
      if (existing?.emailVerifiedAt) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma conta com esse e-mail. Entre com ela ou use outro e-mail." });
      // Nobody ever confirmed this address (and such an account cannot sign in or own data),
      // so it cannot block the real owner: start over with the new details.
      if (existing) await deleteUserAndData(existing.openId);

      const openId = nanoid();
      // An invitation link was delivered to this address, so it already proves the e-mail.
      const emailVerified = Boolean(input.inviteToken);
      await createUser({ openId, agencyCode: null, username: null, email, name: input.name, role: "user", passwordHash: await hashPassword(input.password), emailVerified });
      const user = await org.getUserByEmail(email);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar a conta." });
      if (!emailVerified) return verificationNeeded(email, await sendEmailCode(user));
      if (input.inviteToken) await joinWithInvite(user, input.inviteToken);
      await setSessionCookie(ctx, user);
      return { status: "signed_in" as const, user: { ...publicUser(user), viewedBy: null } };
    }),
    // Step two of a sign-up: the 6-digit code from the e-mail. Success signs the person in.
    verifyEmail: publicProcedure.input(z.object({ email: z.string().max(320), code: codeInput })).mutation(async ({ ctx, input }) => {
      const ip = ctx.req.ip ?? "unknown";
      if (!consumeRateLimit(`verify:${ip}`, 30, 15 * 60 * 1000)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
      }
      const found = await org.getUserByEmail(normalizeEmail(input.email));
      if (found?.isActive && found.emailVerifiedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Este e-mail já foi confirmado. Entre com sua senha." });
      const user = await requireEmailCode(found, input.code, "verify");
      await markEmailVerified(user.openId);
      await touchUserSignIn(user.openId);
      await setSessionCookie(ctx, user);
      return { ...publicUser(user), viewedBy: null };
    }),
    // Same answer whether or not the account exists, so this cannot be used to look up e-mails.
    resendEmailCode: publicProcedure.input(z.object({ email: z.string().max(320) })).mutation(async ({ ctx, input }) => {
      const email = normalizeEmail(input.email);
      if (!consumeRateLimit(`resend:${ctx.req.ip ?? "unknown"}`, 10, 15 * 60 * 1000) || !consumeRateLimit(`resend:${email}`, 5, 60 * 60 * 1000)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitos códigos pedidos. Aguarde alguns minutos." });
      }
      const user = email ? await org.getUserByEmail(email) : undefined;
      if (user && user.isActive && !user.emailVerifiedAt) await sendEmailCode(user);
      return { mailConfigured: isMailConfigured() };
    }),
    // "Esqueci minha senha", step one: a 6-digit code goes to the e-mail. Same answer whether or not the account exists.
    requestPasswordReset: publicProcedure.input(z.object({ email: z.string().max(320) })).mutation(async ({ ctx, input }) => {
      const email = normalizeEmail(input.email);
      if (!consumeRateLimit(`reset:${ctx.req.ip ?? "unknown"}`, 10, 15 * 60 * 1000) || !consumeRateLimit(`reset:${email}`, 5, 60 * 60 * 1000)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitos códigos pedidos. Aguarde alguns minutos." });
      }
      const user = email ? await org.getUserByEmail(email) : undefined;
      if (user && user.isActive && user.passwordHash) await sendEmailCode(user, "reset");
      return { mailConfigured: isMailConfigured() };
    }),
    // Step two: the code proves the e-mail, so it also confirms it. Other sessions end (the password hash changes).
    resetPassword: publicProcedure.input(z.object({ email: z.string().max(320), code: codeInput, newPassword: z.string().max(PASSWORD_MAX_LENGTH) })).mutation(async ({ ctx, input }) => {
      const ip = ctx.req.ip ?? "unknown";
      if (!consumeRateLimit(`reset-code:${ip}`, 30, 15 * 60 * 1000)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
      }
      const policyError = passwordPolicyError(input.newPassword);
      if (policyError) throw new TRPCError({ code: "BAD_REQUEST", message: policyError });
      const email = normalizeEmail(input.email);
      const user = await requireEmailCode(await org.getUserByEmail(email), input.code, "reset");
      const passwordHash = await hashPassword(input.newPassword);
      await setUserPassword(user.openId, passwordHash);
      await markEmailVerified(user.openId);
      clearLoginFailures(ip, email);
      await touchUserSignIn(user.openId);
      await setSessionCookie(ctx, { ...user, passwordHash });
      return { ...publicUser(user), viewedBy: null };
    }),
    changePassword: protectedProcedure.input(changePasswordInput).mutation(async ({ ctx, input }) => {
      if (!(await verifyPassword(input.currentPassword, ctx.user.passwordHash))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A senha atual está incorreta." });
      }
      const policyError = passwordPolicyError(input.newPassword);
      if (policyError) throw new TRPCError({ code: "BAD_REQUEST", message: policyError });
      if (input.newPassword === input.currentPassword) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A nova senha deve ser diferente da atual." });
      }
      const passwordHash = await hashPassword(input.newPassword);
      await setUserPassword(ctx.user.openId, passwordHash);
      // The old session is now revoked; keep this browser signed in with a fresh one.
      await setSessionCookie(ctx, { ...ctx.user, passwordHash });
      return { success: true } as const;
    }),
    deleteAccount: protectedProcedure.input(z.object({ password: z.string().min(1).max(PASSWORD_MAX_LENGTH) })).mutation(async ({ ctx, input }) => {
      if (!(await verifyPassword(input.password, ctx.user.passwordHash))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Senha incorreta. A conta não foi excluída." });
      }
      const membership = await org.getMembership(ctx.user.openId);
      if (membership?.role === "admin" && (await org.countMembers(membership.companyId, "admin")) <= 1) {
        if ((await org.countMembers(membership.companyId)) > 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Você é o único administrador da empresa. Promova outra pessoa a administrador antes de excluir sua conta." });
        }
        await org.deleteCompany(membership.companyId);
      }
      await deleteUserAndData(ctx.user.openId);
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  clients: router({
    // Own records plus those of the people below the viewer (leader → team, manager → agency).
    // Admins only get numbers (organization.performance), never other people's clients.
    list: protectedProcedure.query(async ({ ctx }) => {
      const [visible, managed] = await Promise.all([org.visibleOwnerOpenIds(ctx.user.openId), org.technicalCaseOwners(ctx.user.openId)]);
      const records = await listClientRecords(visible);
      const ids = records.map((record) => record.id);
      const [ratings, notes] = await Promise.all([latestRatings(ids), noteCounts(ids)]);
      return records.map(({ ownerOpenId, customFields, ...record }) => {
        const isMine = ownerOpenId === ctx.user.openId;
        return {
          ...record, customFields: parseCustomValues(customFields), isMine,
          canEdit: isMine || (record.stage === "technical" && managed.has(ownerOpenId)),
          // Leaders and managers can charge/evaluate the people below them.
          canReview: !isMine,
          lastRating: ratings.get(record.id) ?? null, noteCount: notes.get(record.id) ?? 0,
        };
      });
    }),
    // New atendimentos follow the pipeline of the person's agency. People who work
    // on their own may pick any of their products.
    create: protectedProcedure.input(clientFields.extend({ productId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const { productId, ...fields } = input;
      const space = await ws.workspaceOf(ctx.user.openId);
      const chosen = productId && space.kind === "personal" ? await ws.getWorkspaceProduct(space, productId) : undefined;
      if (productId && space.kind === "personal" && !chosen) throw new TRPCError({ code: "BAD_REQUEST", message: "Produto não encontrado." });
      const product = chosen ?? (await ws.productForUser(ctx.user.openId, true))!;
      const id = await createClientRecord(ctx.user.openId, { ...(await recordValues(ctx.user.openId, product, fields)), reference: makeReference() });
      return { success: true, id } as const;
    }),
    update: protectedProcedure
      .input(idInput.extend(clientFields.shape))
      .mutation(async ({ ctx, input }) => {
        const { id, ...values } = input;
        const record = await requireEditableRecord(ctx.user.openId, id);
        const product = await productOfRecord(record);
        return updateClientRecord(record.ownerOpenId, id, await recordValues(record.ownerOpenId, product, values));
      }),
    // Drag and drop on the pipeline. Moving to a "não fechou" stage needs the reason.
    updateStage: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), stage: stageKey, objection: z.string().max(40).nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        const current = await requireEditableRecord(ctx.user.openId, input.id);
        const product = await productOfRecord(current);
        const stage = stageOf(product, input.stage);
        const reasons = product.config.reasons;
        const objection = input.objection !== undefined ? input.objection : current.objection;
        const validObjection = objection && reasons.some((reason) => reason.key === objection) ? objection : null;
        if (stage.kind === "lost" && reasons.length && !validObjection) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe por que não fechou." });
        }
        return updateClientRecord(current.ownerOpenId, input.id, {
          stage: stage.key, saleStatus: saleStatusOfKind(stage.kind), productId: product.id,
          ...(input.objection !== undefined ? { objection: validObjection } : {}),
        });
      }),
    /** Links (or unlinks) a registered customer, e.g. right after "Cadastrar cliente" on the postcard. */
    setCustomer: protectedProcedure
      .input(idInput.extend({ customerId: z.number().int().positive().nullable() }))
      .mutation(async ({ ctx, input }) => {
        const record = await requireEditableRecord(ctx.user.openId, input.id);
        await requireOwnCustomer(record.ownerOpenId, input.customerId);
        return updateClientRecord(record.ownerOpenId, input.id, { customerId: input.customerId });
      }),
    delete: protectedProcedure.input(idInput).mutation(({ ctx, input }) =>
      deleteClientRecord(ctx.user.openId, input.id),
    ),
    // "Lembrar depois" on the call reminder: quiet for a few more days.
    snoozeReminder: protectedProcedure
      .input(idInput.extend({ until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .mutation(async ({ ctx, input }) => {
        if (!(await getClientRecord(ctx.user.openId, input.id))) throw new TRPCError({ code: "NOT_FOUND", message: "Atendimento não encontrado." });
        return updateClientRecord(ctx.user.openId, input.id, { remindAfter: input.until });
      }),
  }),
  workspace: workspaceRouter,
  customers: customersRouter,
  goals: router({
    get: protectedProcedure.query(({ ctx }) => getOwnerGoals(ctx.user.openId)),
    save: protectedProcedure.input(z.object({
      monthlyContactTarget: z.number().int().min(1).max(100000),
      monthlySaleTarget: z.number().int().min(1).max(100000),
    })).mutation(({ ctx, input }) => saveOwnerGoals(ctx.user.openId, input)),
  }),
  profile: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getOwnerProfile(ctx.user.openId);
      return {
        displayName: profile?.displayName || ctx.user.name?.trim() || "",
        jobTitle: profile?.jobTitle ?? "",
        avatarDataUrl: profile?.avatarDataUrl ?? null,
      };
    }),
    save: protectedProcedure.input(profileInput).mutation(({ ctx, input }) =>
      saveOwnerProfile(ctx.user.openId, input),
    ),
  }),
});

export type AppRouter = typeof appRouter;
