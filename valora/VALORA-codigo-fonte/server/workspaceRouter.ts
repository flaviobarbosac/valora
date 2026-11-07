import { z } from "zod";
import {
  DEFAULT_TEMPLATE_KEY, PIPELINE_TEMPLATES, cleanCustomValues, parseCustomValues, prefsSchema, productConfigProblem, productConfigSchema,
  templateByKey, type ProductConfig,
} from "@shared/pipeline";
import * as org from "./orgDb";
import * as ws from "./workspaceDb";
import { fail } from "./orgRouter";
import { protectedProcedure, router } from "./_core/trpc";

const idInput = z.number().int().positive();
const colorInput = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB.").nullable();
const productName = z.string().trim().min(2, "Dê um nome ao produto.").max(80);

async function editableWorkspace(openId: string) {
  const space = await ws.workspaceOf(openId);
  if (!ws.canEditWorkspace(space)) fail("FORBIDDEN", "Só a administração da empresa muda os produtos e a personalização.");
  return space;
}

function requireValidConfig(config: ProductConfig) {
  const problem = productConfigProblem(config);
  if (problem) fail("BAD_REQUEST", problem);
}

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform((value) => value || null);

const customerInput = z.object({
  name: z.string().trim().min(1, "Informe o nome do cliente.").max(160),
  document: optionalText(32),
  phone: optionalText(40),
  email: z.string().trim().max(320).nullable().optional().transform((value) => value || null)
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Confira o e-mail."),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().transform((value) => value || null),
  address: optionalText(200),
  district: optionalText(100),
  city: optionalText(100),
  state: optionalText(40),
  zip: optionalText(16),
  notes: optionalText(4000),
  customFields: z.record(z.string().max(40), z.string().max(2000)).optional(),
});

async function customerValues(openId: string, input: z.infer<typeof customerInput>) {
  const prefs = await ws.getPrefs(await ws.workspaceOf(openId));
  const { values, problem } = cleanCustomValues(prefs.customerFields, input.customFields);
  if (problem) fail("BAD_REQUEST", problem);
  const { customFields: _ignored, ...base } = input;
  return { ...base, customFields: JSON.stringify(values) };
}

export const workspaceRouter = router({
  /**
   * Everything the app needs to draw pipelines and forms: the workspace's
   * products, the product of the signed-in person, wording and preferences.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const space = await ws.workspaceOf(ctx.user.openId);
    const [products, prefs, mine, visible] = await Promise.all([
      ws.listProducts(space), ws.getPrefs(space), ws.productForUser(ctx.user.openId), org.visibleOwnerOpenIds(ctx.user.openId),
    ]);
    const overview = space.kind === "company" ? await org.getCompanyOverview(space.companyId) : null;
    // Older records (e.g. from before joining the company) may use a product from elsewhere.
    const known = new Set(products.map((product) => product.id));
    const extra = await ws.getProductsByIds((await ws.productIdsOfOwners(visible)).filter((id) => !known.has(id)));
    const shape = (product: ws.Product, inWorkspace: boolean) => ({
      id: product.id, name: product.name, template: product.template, color: product.color, config: product.config, inWorkspace,
      agencyIds: (overview?.agencies ?? []).filter((agency) => agency.productId === product.id).map((agency) => agency.id),
    });
    const list = [...products.map((product) => shape(product, true)), ...extra.map((product) => shape(product, false))];
    // An independent person who never saved a pipeline works with the basic template until they do.
    if (!products.length) {
      const template = templateByKey(DEFAULT_TEMPLATE_KEY);
      list.unshift({ id: 0, name: template.name, template: template.key, color: template.color, config: template.config, inWorkspace: true, agencyIds: [] });
    }
    return {
      scope: space.kind,
      canEdit: ws.canEditWorkspace(space),
      /** Independents choose the product of each new atendimento; company people use their agency's. */
      canChooseProduct: space.kind === "personal",
      products: list,
      myProductId: mine?.id ?? 0,
      prefs,
      templates: PIPELINE_TEMPLATES.map(({ key, name, description, color }) => ({ key, name, description, color })),
    };
  }),

  createProduct: protectedProcedure.input(z.object({ name: productName, template: z.string().max(30) })).mutation(async ({ ctx, input }) => {
    const space = await editableWorkspace(ctx.user.openId);
    const template = templateByKey(input.template);
    if ((await ws.listProducts(space)).length >= 30) fail("BAD_REQUEST", "Limite de 30 produtos atingido.");
    return { id: await ws.createProduct(space, { name: input.name, template: template.key, color: template.color }) };
  }),

  saveProduct: protectedProcedure.input(z.object({ id: z.number().int().min(0), name: productName, color: colorInput, config: productConfigSchema })).mutation(async ({ ctx, input }) => {
    const space = await editableWorkspace(ctx.user.openId);
    requireValidConfig(input.config);
    if (input.id === 0) {
      // The unsaved basic pipeline of an independent person.
      if ((await ws.listProducts(space)).length) fail("BAD_REQUEST", "Recarregue a página e tente de novo.");
      return { id: await ws.createProduct(space, { name: input.name, template: DEFAULT_TEMPLATE_KEY, color: input.color, config: input.config }) };
    }
    const current = await ws.getWorkspaceProduct(space, input.id);
    if (!current) fail("NOT_FOUND", "Produto não encontrado.");
    const usage = await ws.stageUsage(input.id);
    for (const stage of current!.config.stages) {
      const count = usage.get(stage.key) ?? 0;
      if (!count) continue;
      const next = input.config.stages.find((item) => item.key === stage.key);
      if (!next) fail("BAD_REQUEST", `A etapa "${stage.label}" tem ${count} ${count === 1 ? "atendimento" : "atendimentos"}. Mova-os para outra etapa antes de excluí-la.`);
      if (next!.kind !== stage.kind) fail("BAD_REQUEST", `A etapa "${stage.label}" tem atendimentos, então o tipo dela não pode mudar. Crie uma etapa nova.`);
    }
    await ws.updateProduct(space, input.id, { name: input.name, color: input.color, config: input.config });
    return { id: input.id };
  }),

  deleteProduct: protectedProcedure.input(z.object({ id: idInput })).mutation(async ({ ctx, input }) => {
    const space = await editableWorkspace(ctx.user.openId);
    const products = await ws.listProducts(space);
    if (!products.some((product) => product.id === input.id)) fail("NOT_FOUND", "Produto não encontrado.");
    if (products.length === 1) fail("BAD_REQUEST", "É preciso ter pelo menos um produto.");
    const usage = await ws.productUsage(input.id);
    if (usage.agencies) fail("BAD_REQUEST", "Há agências vendendo este produto. Troque o produto delas antes de excluir.");
    if (usage.records) fail("BAD_REQUEST", `Este produto tem ${usage.records} ${usage.records === 1 ? "atendimento" : "atendimentos"} e não pode ser excluído.`);
    await ws.deleteProduct(space, input.id);
    return { success: true } as const;
  }),

  savePrefs: protectedProcedure.input(prefsSchema).mutation(async ({ ctx, input }) => {
    const space = await editableWorkspace(ctx.user.openId);
    if (new Set(input.customerFields.map((field) => field.key)).size !== input.customerFields.length) fail("BAD_REQUEST", "Há dois campos com a mesma chave.");
    const emptySelect = input.customerFields.find((field) => field.type === "select" && !field.options?.length);
    if (emptySelect) fail("BAD_REQUEST", `O campo "${emptySelect.label}" é uma lista: inclua pelo menos uma opção.`);
    await ws.savePrefs(space, input);
    return { success: true } as const;
  }),
});

export const customersRouter = router({
  // Own customers plus those of the people below the viewer, like the atendimentos.
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ws.listCustomers(await org.visibleOwnerOpenIds(ctx.user.openId));
    return rows.map(({ ownerOpenId, customFields, ...row }) => ({ ...row, customFields: parseCustomValues(customFields), isMine: ownerOpenId === ctx.user.openId }));
  }),

  create: protectedProcedure.input(customerInput).mutation(async ({ ctx, input }) => {
    return { id: await ws.createCustomer(ctx.user.openId, await customerValues(ctx.user.openId, input)) };
  }),

  update: protectedProcedure.input(customerInput.extend({ id: idInput })).mutation(async ({ ctx, input }) => {
    const { id, ...rest } = input;
    const current = await ws.getCustomer(id);
    if (!current || current.ownerOpenId !== ctx.user.openId) fail("NOT_FOUND", "Cliente não encontrado.");
    await ws.updateCustomer(ctx.user.openId, id, await customerValues(ctx.user.openId, rest));
    return { success: true } as const;
  }),

  delete: protectedProcedure.input(z.object({ id: idInput })).mutation(async ({ ctx, input }) => {
    const current = await ws.getCustomer(input.id);
    if (!current || current.ownerOpenId !== ctx.user.openId) fail("NOT_FOUND", "Cliente não encontrado.");
    await ws.deleteCustomer(ctx.user.openId, input.id);
    return { success: true } as const;
  }),
});
