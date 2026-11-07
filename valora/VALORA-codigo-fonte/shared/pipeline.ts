import { z } from "zod";

/**
 * Pipelines are configured per product ("o que a empresa vende"): the stages,
 * the extra fields of each atendimento, the reasons a sale is lost and the
 * catalog of items sold. Companies pick a template and change anything.
 */

export const STAGE_COLORS = ["slate", "blue", "cyan", "teal", "violet", "pink", "amber", "orange", "emerald", "rose"] as const;
export type StageColor = (typeof STAGE_COLORS)[number];

/** open = em andamento, won = venda fechada, lost = não fechou, handoff = caso técnico (a gerência assume). */
export const STAGE_KINDS = ["open", "won", "lost", "handoff"] as const;
export type StageKind = (typeof STAGE_KINDS)[number];
export const STAGE_KIND_LABELS: Record<StageKind, string> = {
  open: "Em andamento",
  won: "Fechou (venda)",
  lost: "Não fechou",
  handoff: "Caso técnico (gerência assume)",
};
/** The handoff stage keeps this key: permissions and agency numbers look for it. */
export const HANDOFF_STAGE_KEY = "technical";

export const FIELD_TYPES = ["text", "textarea", "number", "money", "date", "select", "yesno", "phone"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Texto curto",
  textarea: "Texto longo",
  number: "Número",
  money: "Valor (R$)",
  date: "Data",
  select: "Lista de opções",
  yesno: "Sim / Não",
  phone: "Telefone",
};

const keyInput = z.string().regex(/^[a-z0-9_]{1,40}$/, "Chave inválida.");
const labelInput = z.string().trim().min(1, "Dê um nome.").max(60);

export const stageSchema = z.object({ key: keyInput, label: labelInput, color: z.enum(STAGE_COLORS), kind: z.enum(STAGE_KINDS) });
export const fieldSchema = z.object({
  key: keyInput,
  label: labelInput,
  type: z.enum(FIELD_TYPES),
  options: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  required: z.boolean().optional(),
  showOnCard: z.boolean().optional(),
});
export const reasonSchema = z.object({ key: keyInput, label: labelInput, callback: z.boolean().optional() });
export const productConfigSchema = z.object({
  stages: z.array(stageSchema).min(3).max(14),
  fields: z.array(fieldSchema).max(25),
  reasons: z.array(reasonSchema).max(25),
  items: z.array(z.string().trim().min(1).max(80)).max(60),
  /** How the sold item is called ("Produto vendido", "Imóvel", "Apólice"…). */
  itemLabel: z.string().trim().min(1).max(40),
});

export type StageDef = z.infer<typeof stageSchema>;
export type FieldDef = z.infer<typeof fieldSchema>;
export type ReasonDef = z.infer<typeof reasonSchema>;
export type ProductConfig = z.infer<typeof productConfigSchema>;

/** Rules a pipeline must follow, in plain words; null when it is fine. */
export function productConfigProblem(config: ProductConfig): string | null {
  const unique = (keys: string[]) => new Set(keys).size === keys.length;
  if (!unique(config.stages.map((stage) => stage.key))) return "Há duas etapas com a mesma chave.";
  if (!unique(config.fields.map((field) => field.key))) return "Há dois campos com a mesma chave.";
  if (!unique(config.reasons.map((reason) => reason.key))) return "Há dois motivos com a mesma chave.";
  if (config.stages[0]?.kind !== "open") return "A primeira etapa precisa ser \"Em andamento\": é nela que os atendimentos novos entram.";
  if (!config.stages.some((stage) => stage.kind === "won")) return "Inclua pelo menos uma etapa de venda fechada.";
  if (!config.stages.some((stage) => stage.kind === "lost")) return "Inclua pelo menos uma etapa de \"não fechou\".";
  const handoffs = config.stages.filter((stage) => stage.kind === "handoff");
  if (handoffs.length > 1) return "Só pode haver uma etapa de caso técnico.";
  if (handoffs.some((stage) => stage.key !== HANDOFF_STAGE_KEY) || config.stages.some((stage) => stage.key === HANDOFF_STAGE_KEY && stage.kind !== "handoff")) {
    return "A etapa de caso técnico usa a chave \"technical\".";
  }
  const emptySelect = config.fields.find((field) => field.type === "select" && !(field.options?.length));
  if (emptySelect) return `O campo "${emptySelect.label}" é uma lista: inclua pelo menos uma opção.`;
  return null;
}

/** "Cliente do banco" → "cliente_do_banco", unique among `taken`. */
export function makeKey(label: string, taken: string[]) {
  const base = label
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    .slice(0, 32) || "item";
  let key = base;
  for (let n = 2; taken.includes(key) || key === HANDOFF_STAGE_KEY; n += 1) key = `${base}_${n}`;
  return key;
}

export function saleStatusOfKind(kind: StageKind | undefined): "sold" | "not_sold" | "pending" {
  return kind === "won" ? "sold" : kind === "lost" ? "not_sold" : "pending";
}

// ---------- Personalização do espaço (empresa ou pessoa independente) ----------

export const TERM_KEYS = ["customer", "customers", "deal", "deals", "sale", "sales"] as const;
export type TermKey = (typeof TERM_KEYS)[number];
export const DEFAULT_TERMS: Record<TermKey, string> = {
  customer: "Cliente",
  customers: "Clientes",
  deal: "Atendimento",
  deals: "Atendimentos",
  sale: "Venda",
  sales: "Vendas",
};

export const prefsSchema = z.object({
  terms: z.record(z.string(), z.string().trim().max(30)).transform((value) =>
    Object.fromEntries(Object.entries(value).filter(([key, label]) => (TERM_KEYS as readonly string[]).includes(key) && label.length > 0)) as Partial<Record<TermKey, string>>),
  /** Gender of the "deal" word, for "Novo/Nova". */
  dealFeminine: z.boolean(),
  customerFeminine: z.boolean(),
  /** Extra fields of the customer registry (Clientes cadastrados). */
  customerFields: z.array(fieldSchema).max(25),
  /** Days without a scheduled call before the reminder; 0 turns it off. */
  reminderDays: z.number().int().min(0).max(60),
  showGoals: z.boolean(),
  /** Short phrase under the logo in the menu. */
  tagline: z.string().trim().max(40),
});
export type WorkspacePrefs = z.infer<typeof prefsSchema>;

export const DEFAULT_PREFS: WorkspacePrefs = {
  terms: {},
  dealFeminine: false,
  customerFeminine: false,
  customerFields: [],
  reminderDays: 3,
  showGoals: true,
  tagline: "",
};

/** Saved prefs may be older than the schema: fill in what is missing. */
export function normalizePrefs(raw: unknown): WorkspacePrefs {
  const parsed = prefsSchema.partial().safeParse(raw ?? {});
  return { ...DEFAULT_PREFS, ...(parsed.success ? Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined)) : {}) };
}

// ---------- Modelos prontos ----------

export type PipelineTemplate = { key: string; name: string; description: string; color: string; config: ProductConfig };

const open = (key: string, label: string, color: StageColor): StageDef => ({ key, label, color, kind: "open" });
const won = (key: string, label: string): StageDef => ({ key, label, color: "emerald", kind: "won" });
const lost = (key: string, label: string): StageDef => ({ key, label, color: "rose", kind: "lost" });
const select = (key: string, label: string, options: string[], extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: "select", options, ...extra });

const COMMON_REASONS: ReasonDef[] = [
  { key: "preco", label: "Preço / valor" },
  { key: "sem_interesse", label: "Sem interesse no momento" },
  { key: "vai_pensar", label: "Vai pensar", callback: true },
  { key: "retornar", label: "Retornar em outro momento", callback: true },
  { key: "concorrencia", label: "Fechou com a concorrência" },
  { key: "sem_contato", label: "Não conseguiu contato" },
  { key: "outro", label: "Outro motivo" },
];

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    key: "generico",
    name: "Vendas em geral",
    description: "Funil simples para qualquer produto ou serviço.",
    color: "#13315c",
    config: {
      stages: [open("new", "Novo contato", "slate"), open("contacted", "Em atendimento", "blue"), open("proposal", "Proposta enviada", "violet"), open("negotiation", "Em negociação", "amber"), won("sold", "Venda fechada"), lost("lost", "Não fechou")],
      fields: [
        { key: "valor", label: "Valor estimado", type: "money", showOnCard: true },
        select("origem", "Como chegou até nós", ["Indicação", "Instagram", "Site", "WhatsApp", "Loja física", "Outro"]),
      ],
      reasons: COMMON_REASONS,
      items: [],
      itemLabel: "Produto vendido",
    },
  },
  {
    key: "credito",
    name: "Crédito bancário",
    description: "Empréstimos e cartões, com limite, caso técnico e classe do produto.",
    color: "#0b3a8a",
    config: {
      stages: [
        open("new", "Novo atendimento", "slate"), open("contacted", "Em atendimento", "blue"), open("negotiation", "Em negociação", "violet"),
        open("awaiting_limit", "Aguardando limite", "amber"), { key: HANDOFF_STAGE_KEY, label: "Caso técnico", color: "orange", kind: "handoff" },
        won("sold", "Venda realizada"), lost("lost", "Não fechou"),
      ],
      fields: [
        select("limite", "Limite de crédito disponível", ["Sim, tem limite", "Não tem limite", "Ainda não verificado"], { showOnCard: true }),
        select("cliente_banco", "Já é cliente do banco?", ["Sim, já é cliente", "Ainda não é cliente", "Não informado"], { showOnCard: true }),
        { key: "interesse_sem_limite", label: "Tem interesse, mas está sem limite", type: "yesno", showOnCard: true },
        select("classe", "Classe do produto", ["Empréstimo consignado", "Empréstimo pessoal", "Cartão consignado / saque", "Refinanciamento / portabilidade", "Outros"]),
      ],
      reasons: [
        { key: "no_limit", label: "Sem limite disponível" },
        { key: "rate", label: "Taxa de juros" },
        { key: "installment", label: "Valor da parcela" },
        { key: "thinking", label: "Vai pensar", callback: true },
        { key: "no_interest", label: "Sem interesse no momento" },
        { key: "documents", label: "Documentação" },
        { key: "later", label: "Retornar em outro momento", callback: true },
        { key: "unreachable", label: "Não conseguiu contato" },
        { key: "other", label: "Outro motivo" },
      ],
      items: ["Consignado INSS", "Consignado público", "Empréstimo pessoal", "Cartão consignado", "Saque complementar", "Portabilidade", "Refinanciamento"],
      itemLabel: "Último produto vendido",
    },
  },
  {
    key: "imoveis",
    name: "Imóveis",
    description: "Venda ou aluguel: visita, proposta, documentação e contrato.",
    color: "#0b6b3a",
    config: {
      stages: [open("new", "Novo interessado", "slate"), open("visit", "Visita agendada", "blue"), open("proposal", "Proposta", "violet"), open("documents", "Documentação", "amber"), won("sold", "Contrato assinado"), lost("lost", "Desistiu")],
      fields: [
        select("tipo_imovel", "Tipo de imóvel", ["Apartamento", "Casa", "Terreno", "Sala comercial", "Galpão"], { showOnCard: true }),
        select("negocio", "Negócio", ["Compra", "Aluguel"]),
        { key: "valor", label: "Faixa de valor", type: "money", showOnCard: true },
        { key: "bairro", label: "Bairro de interesse", type: "text" },
        { key: "financiamento", label: "Vai financiar?", type: "yesno" },
      ],
      reasons: [{ key: "preco", label: "Preço" }, { key: "credito", label: "Crédito/financiamento negado" }, { key: "localizacao", label: "Localização" }, ...COMMON_REASONS.filter((reason) => reason.key !== "preco")],
      items: [],
      itemLabel: "Imóvel",
    },
  },
  {
    key: "seguros",
    name: "Seguros",
    description: "Cotação, proposta e apólice emitida.",
    color: "#5b2a86",
    config: {
      stages: [open("new", "Cotação", "slate"), open("proposal", "Proposta enviada", "blue"), open("analysis", "Em análise", "violet"), won("sold", "Apólice emitida"), lost("lost", "Não fechou")],
      fields: [
        select("tipo_seguro", "Tipo de seguro", ["Auto", "Vida", "Residencial", "Empresarial", "Saúde", "Viagem"], { showOnCard: true }),
        { key: "premio", label: "Valor do prêmio", type: "money", showOnCard: true },
        { key: "vencimento", label: "Vencimento do seguro atual", type: "date" },
        { key: "seguradora_atual", label: "Seguradora atual", type: "text" },
      ],
      reasons: COMMON_REASONS,
      items: ["Seguro auto", "Seguro de vida", "Seguro residencial", "Seguro empresarial", "Plano de saúde"],
      itemLabel: "Apólice / produto",
    },
  },
  {
    key: "veiculos",
    name: "Veículos",
    description: "Loja ou concessionária: test drive, avaliação do usado e financiamento.",
    color: "#b3121f",
    config: {
      stages: [open("new", "Interessado", "slate"), open("test_drive", "Test drive", "blue"), open("evaluation", "Avaliação do usado", "cyan"), open("financing", "Financiamento", "amber"), won("sold", "Vendido"), lost("lost", "Perdido")],
      fields: [
        { key: "modelo", label: "Modelo de interesse", type: "text", showOnCard: true },
        { key: "troca", label: "Tem carro na troca?", type: "yesno", showOnCard: true },
        select("pagamento", "Forma de pagamento", ["À vista", "Financiado", "Consórcio", "Leasing"]),
        { key: "valor", label: "Valor do negócio", type: "money" },
      ],
      reasons: [{ key: "credito", label: "Financiamento recusado" }, ...COMMON_REASONS],
      items: [],
      itemLabel: "Veículo vendido",
    },
  },
  {
    key: "servicos",
    name: "Serviços e consultoria",
    description: "Diagnóstico, orçamento e aprovação.",
    color: "#2f3a48",
    config: {
      stages: [open("new", "Primeiro contato", "slate"), open("diagnosis", "Diagnóstico", "blue"), open("quote", "Orçamento enviado", "violet"), open("approval", "Aguardando aprovação", "amber"), won("sold", "Contratado"), lost("lost", "Recusado")],
      fields: [
        { key: "valor", label: "Valor do orçamento", type: "money", showOnCard: true },
        { key: "prazo", label: "Prazo de entrega", type: "date" },
        { key: "escopo", label: "Escopo", type: "textarea" },
      ],
      reasons: COMMON_REASONS,
      items: [],
      itemLabel: "Serviço contratado",
    },
  },
  {
    key: "educacao",
    name: "Educação e cursos",
    description: "Matrículas: interesse, aula experimental e matrícula.",
    color: "#d35400",
    config: {
      stages: [open("new", "Interessado", "slate"), open("trial", "Aula experimental", "blue"), open("pending", "Matrícula pendente", "amber"), won("sold", "Matriculado"), lost("lost", "Desistiu")],
      fields: [
        { key: "curso", label: "Curso de interesse", type: "text", showOnCard: true },
        select("turno", "Turno", ["Manhã", "Tarde", "Noite", "Online"], { showOnCard: true }),
        { key: "responsavel", label: "Responsável (se menor)", type: "text" },
      ],
      reasons: COMMON_REASONS,
      items: [],
      itemLabel: "Curso matriculado",
    },
  },
];

export const DEFAULT_TEMPLATE_KEY = "generico";

export function templateByKey(key: string | null | undefined) {
  return PIPELINE_TEMPLATES.find((template) => template.key === key) ?? PIPELINE_TEMPLATES[0];
}

/** Saved configs are parsed defensively: anything broken falls back to the template. */
export function parseProductConfig(raw: string | null | undefined, templateKey?: string | null): ProductConfig {
  try {
    const parsed = productConfigSchema.safeParse(JSON.parse(raw ?? ""));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through
  }
  return structuredClone(templateByKey(templateKey).config);
}

// ---------- Campos personalizados ----------

const MAX_TEXT: Record<FieldType, number> = { text: 160, textarea: 2000, number: 30, money: 30, date: 10, select: 60, yesno: 3, phone: 40 };

/**
 * Keeps only the fields defined in `defs`, normalized: yes/no is "sim" or "nao",
 * numbers use a dot, dates are YYYY-MM-DD, list values must be one of the options.
 * Returns the problem (in plain words) when a required field is empty.
 */
export function cleanCustomValues(defs: FieldDef[], values: Record<string, string> | null | undefined, enforceRequired = true): { values: Record<string, string>; problem: string | null } {
  const clean: Record<string, string> = {};
  for (const def of defs) {
    let value = String(values?.[def.key] ?? "").trim().slice(0, MAX_TEXT[def.type]);
    if (def.type === "yesno") value = value === "sim" || value === "nao" ? value : "";
    if (def.type === "number" || def.type === "money") {
      const number = Number(value.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
      value = value && Number.isFinite(number) ? String(number) : "";
    }
    if (def.type === "date") value = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
    if (def.type === "select") value = def.options?.includes(value) ? value : "";
    if (value) clean[def.key] = value;
    else if (def.required && enforceRequired) return { values: clean, problem: `Preencha "${def.label}".` };
  }
  return { values: clean, problem: null };
}

/** How a saved value reads on screen. */
export function formatCustomValue(def: FieldDef, value: string | undefined | null) {
  if (!value) return "";
  if (def.type === "yesno") return value === "sim" ? "Sim" : "Não";
  if (def.type === "money") return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
  if (def.type === "number") return Number(value).toLocaleString("pt-BR");
  if (def.type === "date") return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
  return value;
}

export function parseCustomValues(raw: string | null | undefined): Record<string, string> {
  try {
    const parsed = JSON.parse(raw ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "string" && value !== "")) as Record<string, string>;
  } catch {
    return {};
  }
}
