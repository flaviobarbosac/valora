export type SaleStatus = "sold" | "not_sold" | "pending";

export const DEFAULT_MONTHLY_GOALS = {
  monthlyContactTarget: 100,
  monthlySaleTarget: 20,
} as const;

export type GoalSettings = {
  monthlyContactTarget: number;
  monthlySaleTarget: number;
};

/** An atendimento. Stages, reasons and extra fields come from its product (lib/workspace). */
export type ClientRecord = {
  id: number;
  reference: string;
  name: string;
  contact: string | null;
  contactDate: string;
  /** Follows the stage kind: won → sold, lost → not_sold. */
  saleStatus: SaleStatus;
  /** The item sold (the product's "itemLabel"). */
  lastProductSold: string | null;
  /** Loss reason key. */
  objection: string | null;
  objectionNotes: string | null;
  stage: string;
  followUpDate: string | null;
  /** "Lembrar depois" on the call reminder. */
  remindAfter: string | null;
  productId: number | null;
  /** Registered customer (Clientes cadastrados). */
  customerId: number | null;
  customFields: Record<string, string>;
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
  lastProductSold: string;
  objection: string;
  objectionNotes: string;
  stage: string;
  followUpDate: string;
  customerId: number | null;
  customFields: Record<string, string>;
  /** New atendimento of an independent person with several products. */
  productId?: number;
};

/** A registered customer (Clientes cadastrados). */
export type Customer = {
  id: number;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  customFields: Record<string, string>;
  ownerName: string;
  isMine: boolean;
  dealCount: number;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type CustomerFormValues = Omit<Customer, "id" | "ownerName" | "isMine" | "dealCount" | "createdAt" | "updatedAt">;

export const EMPTY_CUSTOMER: CustomerFormValues = {
  name: "", document: "", phone: "", email: "", birthDate: "", address: "", district: "", city: "", state: "", zip: "", notes: "", customFields: {},
};

export const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export type ProfileSettings = {
  displayName: string;
  jobTitle: string;
  avatarDataUrl: string | null;
};
