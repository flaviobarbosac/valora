export const PIPELINE_STAGES = [
  { value: "new", label: "Novo atendimento", color: "slate" },
  { value: "contacted", label: "Em atendimento", color: "blue" },
  { value: "negotiation", label: "Em negociação", color: "violet" },
  { value: "awaiting_limit", label: "Aguardando limite", color: "amber" },
  { value: "technical", label: "Caso técnico", color: "orange" },
  { value: "sold", label: "Venda realizada", color: "emerald" },
  { value: "lost", label: "Não fechou", color: "rose" },
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number]["value"];
export type YesNoUnknown = "yes" | "no" | "unknown";
export type SaleStatus = "sold" | "not_sold" | "pending";

export const CREDIT_OPTIONS: { value: YesNoUnknown; label: string }[] = [
  { value: "unknown", label: "Ainda não verificado" },
  { value: "yes", label: "Sim, tem limite" },
  { value: "no", label: "Não tem limite" },
];

export const BANK_OPTIONS: { value: YesNoUnknown; label: string }[] = [
  { value: "unknown", label: "Não informado" },
  { value: "yes", label: "Sim, já é cliente" },
  { value: "no", label: "Ainda não é cliente" },
];

export const OBJECTIONS = [
  { value: "no_limit", label: "Sem limite disponível" },
  { value: "rate", label: "Taxa de juros" },
  { value: "installment", label: "Valor da parcela" },
  { value: "thinking", label: "Vai pensar" },
  { value: "no_interest", label: "Sem interesse no momento" },
  { value: "documents", label: "Documentação" },
  { value: "later", label: "Retornar em outro momento" },
  { value: "unreachable", label: "Não conseguiu contato" },
  { value: "other", label: "Outro motivo" },
] as const;

export type Objection = (typeof OBJECTIONS)[number]["value"];

export const PRODUCT_CLASSES = [
  { value: "consignado", label: "Empréstimo consignado" },
  { value: "pessoal", label: "Empréstimo pessoal" },
  { value: "cartao_consignado", label: "Cartão consignado / saque" },
  { value: "refinanciamento", label: "Refinanciamento / portabilidade" },
  { value: "outros", label: "Outros" },
] as const;

export type ProductClass = (typeof PRODUCT_CLASSES)[number]["value"];

export const DEFAULT_MONTHLY_GOALS = {
  monthlyContactTarget: 100,
  monthlySaleTarget: 20,
} as const;

export type GoalSettings = {
  monthlyContactTarget: number;
  monthlySaleTarget: number;
};

export type ClientRecord = {
  id: number;
  reference: string;
  name: string;
  contact: string | null;
  contactDate: string;
  hasCreditLimit: YesNoUnknown;
  saleStatus: SaleStatus;
  lastProductSold: string | null;
  productClass: ProductClass | null;
  isBankCustomer: YesNoUnknown;
  objection: Objection | null;
  objectionNotes: string | null;
  interestedWithoutLimit: boolean;
  stage: PipelineStage;
  followUpDate: string | null;
  /** "Lembrar depois" on the 3-day call reminder. */
  remindAfter: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  /** Who registered it (shown when leaders, managers or admins see their area). */
  ownerName: string;
  /** Registered by the signed-in person. */
  isMine: boolean;
  /** The owner, or an agency manager on a "caso técnico". Everything else opens read-only. */
  canEdit: boolean;
  /** Leaders and managers can charge ("cobrar") and evaluate the people below them. */
  canReview: boolean;
  lastRating: number | null;
  noteCount: number;
};

export type ClientFormValues = {
  reference?: string;
  name: string;
  contact: string;
  contactDate: string;
  hasCreditLimit: YesNoUnknown;
  saleStatus: SaleStatus;
  lastProductSold: string;
  productClass: ProductClass | "";
  isBankCustomer: YesNoUnknown;
  objection: Objection | "";
  objectionNotes: string;
  interestedWithoutLimit: boolean;
  stage: PipelineStage;
  followUpDate: string;
};

export const EMPTY_CLIENT: ClientFormValues = {
  name: "",
  contact: "",
  contactDate: new Date().toISOString().slice(0, 10),
  hasCreditLimit: "unknown",
  saleStatus: "pending",
  lastProductSold: "",
  productClass: "",
  isBankCustomer: "unknown",
  objection: "",
  objectionNotes: "",
  interestedWithoutLimit: false,
  stage: "new",
  followUpDate: "",
};

let stageLabelOverrides: Record<string, string> = {};
/** Company-specific stage names (Personalizar). Set by lib/branding.ts. */
export function setStageLabelOverrides(map: Record<string, string>) {
  stageLabelOverrides = map;
}

export function stageLabel(value: string) {
  return stageLabelOverrides[value] || PIPELINE_STAGES.find((stage) => stage.value === value)?.label || value;
}

export function objectionLabel(value: string | null | undefined) {
  return OBJECTIONS.find((item) => item.value === value)?.label ?? "—";
}

export function productClassLabel(value: string | null | undefined) {
  return PRODUCT_CLASSES.find((item) => item.value === value)?.label ?? "Não classificado";
}

export type ProfileSettings = {
  displayName: string;
  jobTitle: string;
  avatarDataUrl: string | null;
};
