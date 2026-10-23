import { createContext, useContext, type ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { DEFAULT_PREFS, DEFAULT_TERMS, type FieldDef, type StageDef, type TermKey, type WorkspacePrefs } from "@shared/pipeline";
import type { ClientRecord } from "@/lib/client-types";

// The workspace (company or independent person): products with their pipelines,
// and the wording/preferences chosen in Personalizar. Home loads it once and
// shares it through this context; the wording lives in a module-level map so
// plain functions can call term() too.

export type WorkspaceData = inferRouterOutputs<AppRouter>["workspace"]["get"];
export type Product = WorkspaceData["products"][number];

let terms: Record<TermKey, string> = { ...DEFAULT_TERMS };
let feminine = { deal: false, customer: false };

export function setWorkspaceTerms(prefs: WorkspacePrefs | null | undefined) {
  terms = { ...DEFAULT_TERMS, ...(prefs?.terms ?? {}) };
  feminine = { deal: Boolean(prefs?.dealFeminine), customer: Boolean(prefs?.customerFeminine) };
}

/** The company's word for it: term("deal") → "Atendimento"; lower → "atendimento". */
export function term(key: TermKey, lower = false) {
  const value = terms[key];
  return lower ? value.toLocaleLowerCase("pt-BR") : value;
}

/** "Novo atendimento" / "Nova oportunidade". */
export function newWord(key: "deal" | "customer") {
  return feminine[key] ? "Nova" : "Novo";
}

/** "o" / "a", to agree with the words in sentences. */
export function article(key: "deal" | "customer") {
  return feminine[key] ? "a" : "o";
}

const FEMININE_FORMS: Record<string, string> = {
  um: "uma", Nenhum: "Nenhuma", os: "as", Os: "As", aos: "às", dos: "das", do: "da", Do: "Da", o: "a",
  Todos: "Todas", Outros: "Outras", outro: "outra", seus: "suas",
};

/** A word that agrees with the company's term: agree("deal", "registrado") → "registrada" for "Consulta". */
export function agree(key: "deal" | "customer", word: string) {
  if (!feminine[key]) return word;
  return FEMININE_FORMS[word] ?? word.replace(/o(s?)$/, "a$1");
}

type Ctx = {
  data: WorkspaceData | null;
  products: Product[];
  myProduct: Product | null;
  prefs: WorkspacePrefs;
  /** The product a record belongs to (or the viewer's, for records without one). */
  productOf: (record: Pick<ClientRecord, "productId"> | null | undefined) => Product | null;
};

const WorkspaceContext = createContext<Ctx>({ data: null, products: [], myProduct: null, prefs: DEFAULT_PREFS, productOf: () => null });

export function WorkspaceProvider({ data, children }: { data: WorkspaceData | null; children: ReactNode }) {
  const products = data?.products ?? [];
  const myProduct = products.find((product) => product.id === data?.myProductId) ?? products[0] ?? null;
  const productOf: Ctx["productOf"] = (record) => products.find((product) => product.id === record?.productId) ?? myProduct;
  return <WorkspaceContext.Provider value={{ data, products, myProduct, prefs: data?.prefs ?? DEFAULT_PREFS, productOf }}>{children}</WorkspaceContext.Provider>;
}

export const useWorkspace = () => useContext(WorkspaceContext);

export function stageOf(product: Product | null, key: string): StageDef | undefined {
  return product?.config.stages.find((stage) => stage.key === key);
}

export function stageName(product: Product | null, key: string) {
  return stageOf(product, key)?.label ?? key;
}

export function reasonLabel(product: Product | null, key: string | null | undefined) {
  if (!key) return "—";
  return product?.config.reasons.find((reason) => reason.key === key)?.label ?? key;
}

/** "Vai pensar", "Retornar depois"…: the customer is undecided and should be called again. */
export function isCallbackReason(product: Product | null, key: string | null | undefined) {
  return Boolean(key && product?.config.reasons.find((reason) => reason.key === key)?.callback);
}

export const cardFields = (product: Product | null): FieldDef[] => product?.config.fields.filter((field) => field.showOnCard) ?? [];
