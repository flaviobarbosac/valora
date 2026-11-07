import AccountMenu from "@/components/AccountMenu";
import AgencyPanel from "@/components/AgencyPanel";
import BugReportDialog from "@/components/BugReportDialog";
import BugReportsPanel from "@/components/BugReportsPanel";
import CustomizePanel, { PersonalCustomizePanel } from "@/components/CustomizePanel";
import PromotionsPanel from "@/components/PromotionsPanel";
import type { AppNotification } from "@/components/ReminderBell";
import { useAppDialog } from "@/components/AppDialogs";
import AccountSettingsDialog from "@/components/AccountSettingsDialog";
import ClientFormDialog from "@/components/ClientFormDialog";
import ClientPostcard from "@/components/ClientPostcard";
import CustomerFormDialog from "@/components/CustomerFormDialog";
import CustomersPanel from "@/components/CustomersPanel";
import DeleteAccountDialog from "@/components/DeleteAccountDialog";
import FollowUpAgenda from "@/components/FollowUpAgenda";
import LoginScreen from "@/components/LoginScreen";
import ClientPipeline from "@/components/ClientPipeline";
import MonthlyGoals from "@/components/MonthlyGoals";
import ReminderBell, { reminderText } from "@/components/ReminderBell";
import SuperAdminPanel from "@/components/SuperAdminPanel";
import TeamPanel from "@/components/TeamPanel";
import ValoraLogo from "@/components/ValoraLogo";
import { useAuth } from "@/_core/hooks/useAuth";
import { DEFAULT_MONTHLY_GOALS, type ClientFormValues, type ClientRecord, type Customer, type CustomerFormValues, type GoalSettings, type ProfileSettings } from "@/lib/client-types";
import { trpc } from "@/lib/trpc";
import { applyBrandColors, roleLabel, setBrandLabels } from "@/lib/branding";
import { OUTCOMES, addDaysISO, needsCallReminder, outcomeOf, type Outcome } from "@/lib/followups";
import { stopViewAs } from "@/lib/viewAs";
import {
  WorkspaceProvider, agree, cardFields, isCallbackReason, newWord, reasonLabel, setWorkspaceTerms, stageName, stageOf, term,
  type Product,
} from "@/lib/workspace";
import { DEFAULT_PREFS, formatCustomValue } from "@shared/pipeline";
import { SUPER_ADMIN_LABEL } from "@shared/const";
import { toast } from "sonner";
import {
  ArrowDownToLine, ArrowDownRight, ArrowRight, BadgeCheck,
  Building2, CalendarDays, Check, ChevronDown, CircleDollarSign, Clock3,
  Filter, LayoutDashboard, LoaderCircle, LogOut, Menu, MoreHorizontal, Plus,
  Search, ShieldCheck, SlidersHorizontal, Sparkles, Target, TrendingUp,
  Users, X, Eye, Undo2, PhoneCall, ThumbsDown, RotateCcw, Wrench, Award, Palette, Bug, IdCard, ShoppingBag, Hourglass,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type View = "overview" | "clients" | "customers" | "pipeline" | "agenda" | "agencies" | "promotions" | "team" | "customize" | "admin" | "bugs";
type CompanyRoleOrNone = "admin" | "manager" | "leader" | "member" | null;

/** Each position sees only what it needs. Super administrators also get Usuários and Relatos de erro. */
const VIEWS_BY_ROLE: Record<"admin" | "manager" | "leader" | "member" | "independent", View[]> = {
  admin: ["agencies", "promotions", "team", "customize"],
  manager: ["agencies", "pipeline", "promotions", "clients", "customers", "agenda", "overview"],
  leader: ["overview", "pipeline", "agencies", "promotions", "clients", "customers", "agenda"],
  member: ["overview", "pipeline", "clients", "customers", "agenda"],
  independent: ["overview", "pipeline", "clients", "customers", "agenda", "team", "customize"],
};
const VIEW_ICON: Record<View, typeof Users> = {
  overview: LayoutDashboard, clients: Users, customers: IdCard, agenda: CalendarDays, pipeline: Target, agencies: Building2,
  promotions: Award, team: Building2, customize: Palette, admin: ShieldCheck, bugs: Bug,
};
const RECORD_VIEWS: View[] = ["overview", "clients", "agenda", "pipeline"];
const URL_VIEWS: Record<string, View> = { promocoes: "promotions", relatos: "bugs", agencias: "agencies", pipeline: "pipeline", personalizar: "customize", clientes: "customers" };
type Scope = "mine" | "area";

// Admins only get numbers (Agências), so they have no "see my area" switch.
const AREA_LABEL: Partial<Record<"leader" | "manager" | "admin" | "member", string>> = { leader: "Minha equipe", manager: "Minha agência" };
const STATIC_VIEW_LABEL: Partial<Record<View, string>> = { overview: "Visão geral", agenda: "Próximos contatos", pipeline: "Pipeline", agencies: "Agências", promotions: "Promoções", team: "Minha empresa", customize: "Personalizar", admin: "Usuários do sistema", bugs: "Relatos de erro" };
type Period = "7" | "30" | "90" | "all";

const periodLabel: Record<Period, string> = { "7": "Últimos 7 dias", "30": "Últimos 30 dias", "90": "Últimos 90 dias", all: "Todo o período" };
const saleLabel = (value: string) => value === "sold" ? "Fechou" : value === "not_sold" ? "Não fechou" : "Em andamento";
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
const localDateISO = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const moneylessPercent = (part: number, whole: number) => whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`;
const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

function StatCard({ icon: Icon, label, value, note, tone, progress }: { icon: typeof Users; label: string; value: string; note: string; tone: string; progress?: number }) {
  return (
    <article className="stat-card">
      <div className="stat-top"><span className={`stat-icon ${tone}`}><Icon size={18} strokeWidth={2} /></span><span className="stat-period">No período</span></div>
      <p className="stat-label">{label}</p>
      <div className="stat-value-row"><strong>{value}</strong>{progress !== undefined && <span className="stat-progress"><TrendingUp size={13} />{progress}%</span>}</div>
      <p className="stat-note">{note}</p>
      <div className={`stat-accent ${tone}`} />
    </article>
  );
}

function ClientTable({
  records, productOf, onOpen, onEdit, onDelete, onStageChange, showOwner, showProduct, locked,
}: {
  records: ClientRecord[];
  productOf: (record: ClientRecord) => Product | null;
  showOwner: boolean;
  showProduct: boolean;
  /** "Ver como": everything is read-only. */
  locked: boolean;
  onOpen: (record: ClientRecord) => void;
  onEdit: (record: ClientRecord) => void;
  onDelete: (record: ClientRecord) => void;
  onStageChange: (record: ClientRecord, stage: string) => void;
}) {
  if (!records.length) return (
    <div className="table-empty">
      <div className="empty-illustration"><Users size={24} /></div>
      <h3>{agree("deal", "Nenhum")} {term("deal", true)} por aqui</h3>
      <p>Cadastre um contato ou ajuste os filtros para encontrar {agree("deal", "outro")} {term("deal", true)}.</p>
    </div>
  );
  return (
    <div className="table-scroll"><table className="clients-table">
      <thead><tr><th>{term("customer")}</th>{showOwner && <th>Responsável</th>}<th>Data do contato</th>{showProduct && <th>Produto</th>}<th>Detalhes</th><th>Resultado</th><th>Item vendido</th><th>Motivo</th><th>Etapa</th><th><span className="sr-only">Ações</span></th></tr></thead>
      <tbody>{records.map((record) => {
        const product = productOf(record);
        const stage = stageOf(product, record.stage);
        const details = cardFields(product).filter((field) => record.customFields[field.key]).slice(0, 2);
        return <tr key={record.id}>
          <td><button type="button" className="table-client" onClick={() => onOpen(record)}>{stage?.kind === "handoff" && <span className="technical-flag" title="Caso técnico: com a gerência da agência"><Wrench size={11} /></span>}<span className="client-avatar">{record.name.trim().charAt(0).toUpperCase()}</span><span><strong>{record.name}{record.customerId ? <em className="card-registered" title={`${term("customer")} cadastrado`}> <IdCard size={10} /></em> : null}{record.lastRating ? <em className="card-rating" title="Última avaliação da liderança"> ★ {record.lastRating}</em> : null}{record.noteCount > 0 ? <em className="card-notes" title="Cobranças e avaliações"> {record.noteCount}</em> : null}</strong><small>{record.reference} <i>·</i> {record.contact || "Sem contato informado"}</small></span></button></td>
          {showOwner && <td><span className={`owner-tag ${record.isMine ? "owner-mine" : ""}`}>{record.isMine ? "Você" : record.ownerName}</span></td>}
          <td className="muted-cell">{dateLabel(record.contactDate)}</td>
          {showProduct && <td><span className="product-chip"><i style={{ background: product?.color ?? "#13315c" }} />{product?.name ?? "—"}</span></td>}
          <td className="muted-cell detail-cell">{details.length ? details.map((field) => <span key={field.key}>{field.label}: <b>{formatCustomValue(field, record.customFields[field.key])}</b></span>) : "—"}</td>
          <td><span className={`sale-label sale-${record.saleStatus}`}>{record.saleStatus === "sold" ? <Check size={13} /> : record.saleStatus === "not_sold" ? <ArrowDownRight size={13} /> : <Clock3 size={13} />}{saleLabel(record.saleStatus)}</span></td>
          <td className="muted-cell">{record.lastProductSold || "—"}</td>
          <td className="muted-cell">{reasonLabel(product, record.objection)}</td>
          <td><select aria-label={`Etapa de ${record.name}`} disabled={!record.canEdit || locked} title={record.canEdit ? undefined : "Só quem registrou (ou a gerência, em caso técnico) pode mudar a etapa"} className={`stage-select stage-select-${stage?.color ?? "slate"}`} value={record.stage} onChange={(event) => onStageChange(record, event.target.value)}>{product?.config.stages.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}{!stage && <option value={record.stage}>{record.stage}</option>}</select></td>
          <td><div className="row-actions"><button type="button" title={record.canEdit ? `Editar ${term("deal", true)}` : `Ver ${term("deal", true)}`} aria-label={`${record.canEdit ? "Editar" : "Ver"} ${record.name}`} onClick={() => onEdit(record)}><MoreHorizontal size={17} /></button>{record.isMine && !locked && <button type="button" className="delete-action" title={`Excluir ${term("deal", true)}`} aria-label={`Excluir ${record.name}`} onClick={() => onDelete(record)}><X size={16} /></button>}</div></td>
        </tr>;
      })}</tbody>
    </table></div>
  );
}

type PostcardState = { recordId: number | null; customerId: number | null };
type CustomerFormState = { initial: Customer | null; prefill: Partial<CustomerFormValues> | null; linkRecordId: number | null };

export default function Home() {
  const auth = useAuth();
  const [view, setView] = useState<View>("overview");
  const [period, setPeriod] = useState<Period>("30");
  const [search, setSearch] = useState("");
  const [saleFilter, setSaleFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [itemFilter, setItemFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [fieldFilters, setFieldFilters] = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [outcomeFilter, setOutcomeFilter] = useState<Outcome | "all">("all");
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [accountSettingsTab, setAccountSettingsTab] = useState<"profile" | "goals" | "security">("profile");
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const [presetCustomer, setPresetCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<Scope>("mine");
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [pipelineProductId, setPipelineProductId] = useState<number | null>(null);
  const [postcard, setPostcard] = useState<PostcardState | null>(null);
  const [postcardOpen, setPostcardOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerFormState | null>(null);
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const utils = trpc.useUtils();
  const dialog = useAppDialog();
  const orgQuery = trpc.organization.me.useQuery(undefined, { enabled: Boolean(auth.user), retry: false });
  const companyRole: CompanyRoleOrNone = orgQuery.data?.membership?.role ?? null;
  const areaLabel = companyRole ? AREA_LABEL[companyRole] ?? null : null;
  const agencyViewLabel = companyRole === "admin" ? "Agências" : companyRole === "manager" ? "Minha agência" : companyRole === "leader" ? "Minha equipe" : null;
  const isSuperAdmin = Boolean(auth.user?.isSuperAdmin);
  const viewedBy = auth.user?.viewedBy ?? null;
  const readOnlyMode = Boolean(viewedBy);
  const navViews: View[] = useMemo(() => {
    const base = VIEWS_BY_ROLE[(companyRole ?? "independent") as keyof typeof VIEWS_BY_ROLE];
    return auth.user?.isSuperAdmin ? [...base, "admin", "bugs"] : base;
  }, [companyRole, auth.user?.isSuperAdmin]);

  const workspaceQuery = trpc.workspace.get.useQuery(undefined, { enabled: Boolean(auth.user), retry: false });
  const workspace = workspaceQuery.data ?? null;
  const prefs = workspace?.prefs ?? DEFAULT_PREFS;
  setWorkspaceTerms(prefs);
  const products = workspace?.products ?? [];
  const myProduct = products.find((product) => product.id === workspace?.myProductId) ?? products[0] ?? null;
  const productOf = (record: Pick<ClientRecord, "productId"> | null | undefined) => products.find((product) => product.id === record?.productId) ?? myProduct;
  const isCallback = (record: ClientRecord) => (key: string) => isCallbackReason(productOf(record), key);

  const viewLabel = (item: View) =>
    item === "agencies" ? agencyViewLabel ?? "Agências"
    : item === "promotions" ? (companyRole === "manager" || companyRole === "admin" ? "Autorizações e promoções" : "Promoções")
    : item === "pipeline" && (companyRole === "manager" || companyRole === "leader") ? "Pipeline da " + (companyRole === "manager" ? "agência" : "equipe")
    : item === "clients" ? term("deals")
    : item === "customers" ? `${term("customers")} ${agree("customer", "cadastrados")}`
    : STATIC_VIEW_LABEL[item] ?? item;
  const brandingQuery = trpc.features.branding.useQuery(undefined, { enabled: Boolean(auth.user) && Boolean(companyRole), retry: false });
  const branding = companyRole ? brandingQuery.data ?? null : null;
  setBrandLabels(branding?.roleLabels);
  useEffect(() => { applyBrandColors(branding ? { primary: branding.primaryColor, dark: branding.darkColor, accent: branding.accentColor } : null); }, [branding?.primaryColor, branding?.darkColor, branding?.accentColor, Boolean(branding)]);
  const notificationsQuery = trpc.features.notifications.useQuery(undefined, { enabled: Boolean(auth.user), retry: false, refetchInterval: 60_000 });
  const promotionsQuery = trpc.features.promotions.useQuery(undefined, { enabled: Boolean(auth.user) && Boolean(companyRole) && companyRole !== "member", retry: false });
  const pendingPromotions = (promotionsQuery.data ?? []).filter((item) => item.canDecide).length;
  const bugsQuery = trpc.features.bugReports.useQuery(undefined, { enabled: Boolean(auth.user?.isSuperAdmin) && !auth.user?.viewedBy, retry: false });
  const newBugReports = (bugsQuery.data ?? []).filter((item) => item.status === "new").length;
  const customersQuery = trpc.customers.list.useQuery(undefined, { enabled: Boolean(auth.user) && companyRole !== "admin", retry: false });
  const customers = (customersQuery.data ?? []) as Customer[];
  const myCustomers = useMemo(() => customers.filter((customer) => customer.isMine), [customers]);

  // Each position starts where its work is: admins and managers on the agency panel,
  // leaders and managers seeing their area in the pipeline. ?tela= opens a section (notification links).
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!auth.user || !orgQuery.isFetched) return;
    const key = `${auth.user.openId}:${companyRole ?? "none"}`;
    if (startedFor.current === key) return;
    startedFor.current = key;
    const requested = URL_VIEWS[new URLSearchParams(window.location.search).get("tela") ?? ""];
    setView(requested && navViews.includes(requested) ? requested : navViews[0]);
    setScope(companyRole === "manager" || companyRole === "leader" ? "area" : "mine");
  }, [auth.user, orgQuery.isFetched, companyRole, navViews]);
  useEffect(() => { setView((current) => (navViews.includes(current) ? current : navViews[0])); }, [navViews, view]);

  const myRoleLabel = [isSuperAdmin ? SUPER_ADMIN_LABEL : null, companyRole ? roleLabel(companyRole) : null].filter(Boolean).join(" · ") || "Trabalho independente";
  const clientQuery = trpc.clients.list.useQuery(undefined, { enabled: Boolean(auth.user), retry: false });
  const goalQuery = trpc.goals.get.useQuery(undefined, { enabled: Boolean(auth.user), retry: false });
  const profileQuery = trpc.profile.get.useQuery(undefined, { enabled: Boolean(auth.user), retry: false });
  const visibleRecords = (clientQuery.data ?? []) as unknown as ClientRecord[];
  const myRecords = useMemo(() => visibleRecords.filter((item) => item.isMine), [visibleRecords]);
  const effectiveScope: Scope = areaLabel ? scope : "mine";
  const records = effectiveScope === "area" ? visibleRecords : myRecords;
  const goals = (goalQuery.data ?? DEFAULT_MONTHLY_GOALS) as GoalSettings;
  const profileFallback = useMemo<ProfileSettings>(() => ({ displayName: auth.user?.name ?? "", jobTitle: "", avatarDataUrl: null }), [auth.user?.name]);
  const profile: ProfileSettings = profileQuery.data ?? profileFallback;
  const [todayISO, setTodayISO] = useState(() => localDateISO());
  useEffect(() => {
    const timer = window.setInterval(() => {
      const localToday = localDateISO();
      setTodayISO((current) => current === localToday ? current : localToday);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const currentPeriodRecords = useMemo(() => {
    let result = records;
    if (period !== "all") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - Number(period) + 1);
      const periodStart = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
      result = result.filter((item) => item.contactDate >= periodStart);
    }
    if (dateFrom) result = result.filter((item) => item.contactDate >= dateFrom);
    if (dateTo) result = result.filter((item) => item.contactDate <= dateTo);
    return result;
  }, [period, records, dateFrom, dateTo]);

  // Products that show up: mine plus any used by the visible records.
  const usedProducts = useMemo(() => {
    const ids = new Set(records.map((record) => productOf(record)?.id).filter((id): id is number => id !== undefined));
    if (myProduct) ids.add(myProduct.id);
    return products.filter((product) => ids.has(product.id));
  }, [records, products, myProduct]);
  const pipelineProduct = usedProducts.find((product) => product.id === pipelineProductId) ?? myProduct ?? usedProducts[0] ?? null;
  const productRecords = useMemo(() => currentPeriodRecords.filter((record) => productOf(record)?.id === pipelineProduct?.id), [currentPeriodRecords, pipelineProduct, products]);
  const productTabs = usedProducts.length > 1 ? (
    <div className="product-tabs" role="tablist" aria-label="Produto">
      {usedProducts.map((product) => <button type="button" role="tab" key={product.id} aria-selected={pipelineProduct?.id === product.id} className={pipelineProduct?.id === product.id ? "active" : ""} onClick={() => setPipelineProductId(product.id)}><i style={{ background: product.color ?? "#13315c" }} />{product.name}</button>)}
    </div>
  ) : null;

  const monthKey = todayISO.slice(0, 7);
  const monthlyRecords = useMemo(() => records.filter((item) => item.contactDate.slice(0, 7) === monthKey), [records, monthKey]);
  // Monthly goals are personal, whatever the selected scope.
  const myMonthlyRecords = useMemo(() => myRecords.filter((item) => item.contactDate.slice(0, 7) === monthKey), [myRecords, monthKey]);
  const monthLabel = new Date(`${monthKey}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  // Filters built from the pipelines in use: stages, reasons and list fields.
  const filterStages = useMemo(() => Array.from(new Set(usedProducts.flatMap((product) => product.config.stages.map((stage) => stage.label)))), [usedProducts]);
  const filterReasons = useMemo(() => Array.from(new Set(usedProducts.flatMap((product) => product.config.reasons.map((reason) => reason.label)))), [usedProducts]);
  const soldItems = useMemo(() => Array.from(new Set(records.map((record) => record.lastProductSold).filter((item): item is string => Boolean(item)))).sort(), [records]);
  const filterFields = (myProduct?.config.fields ?? []).filter((field) => field.type === "select" || field.type === "yesno");

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return currentPeriodRecords.filter((item) => {
      const product = productOf(item);
      const matchesSearch = !query || [item.name, item.reference, item.contact ?? "", item.lastProductSold ?? "", ...Object.values(item.customFields)].some((part) => part.toLocaleLowerCase("pt-BR").includes(query));
      const activeFields = Object.entries(fieldFilters).filter(([, value]) => value);
      return matchesSearch
        && (saleFilter === "all" || item.saleStatus === saleFilter)
        && (stageFilter === "all" || stageName(product, item.stage) === stageFilter)
        && (reasonFilter === "all" || (item.objection && reasonLabel(product, item.objection) === reasonFilter))
        && (itemFilter === "all" || (itemFilter === "none" ? item.saleStatus === "sold" && !item.lastProductSold : item.lastProductSold === itemFilter))
        && (productFilter === "all" || String(product?.id) === productFilter)
        && (!activeFields.length || (product?.id === myProduct?.id && activeFields.every(([key, value]) => item.customFields[key] === value)))
        && (outcomeFilter === "all" || outcomeOf(item, isCallback(item)) === outcomeFilter);
    });
  }, [currentPeriodRecords, search, saleFilter, stageFilter, reasonFilter, itemFilter, productFilter, fieldFilters, outcomeFilter, products]);
  const outcomeCounts = useMemo(() => {
    const counts: Record<Outcome, number> = { waiting: 0, success: 0, failed: 0, callback: 0 };
    currentPeriodRecords.forEach((item) => { counts[outcomeOf(item, isCallback(item))] += 1; });
    return counts;
  }, [currentPeriodRecords, products]);
  // "Opa, não esqueça de ligar…": my open clients with no call scheduled for a few days.
  const reminders = useMemo(() => myRecords.filter((item) => needsCallReminder(item, todayISO, prefs.reminderDays, isCallback(item))).sort((a, b) => a.contactDate.localeCompare(b.contactDate)), [myRecords, todayISO, prefs.reminderDays, products]);

  const sold = currentPeriodRecords.filter((item) => item.saleStatus === "sold").length;
  const openCount = currentPeriodRecords.filter((item) => item.saleStatus === "pending").length;
  const conversion = currentPeriodRecords.length ? Math.round((sold / currentPeriodRecords.length) * 100) : 0;
  const followUps = currentPeriodRecords.filter((item) => item.followUpDate && item.followUpDate >= todayISO).length;
  const dueFollowUpCount = myRecords.filter((item) => item.followUpDate && item.followUpDate <= todayISO).length + reminders.length;
  const lostWithReason = currentPeriodRecords.filter((item) => item.saleStatus === "not_sold" && item.objection);
  const objections = useMemo(() => {
    const counts = new Map<string, number>();
    lostWithReason.forEach((item) => { const label = reasonLabel(productOf(item), item.objection); counts.set(label, (counts.get(label) ?? 0) + 1); });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [currentPeriodRecords, products]);
  const monthlySold = monthlyRecords.filter((record) => record.saleStatus === "sold");
  const topItems = useMemo(() => {
    const counts = new Map<string, number>();
    monthlySold.forEach((record) => { const item = record.lastProductSold || ""; counts.set(item, (counts.get(item) ?? 0) + 1); });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [monthlyRecords]);
  const activeFilterCount = [saleFilter !== "all", stageFilter !== "all", reasonFilter !== "all", itemFilter !== "all", productFilter !== "all", Boolean(dateFrom), Boolean(dateTo), ...Object.values(fieldFilters).map(Boolean)].filter(Boolean).length;

  const createMutation = trpc.clients.create.useMutation();
  const updateMutation = trpc.clients.update.useMutation();
  const deleteMutation = trpc.clients.delete.useMutation();
  const stageMutation = trpc.clients.updateStage.useMutation();
  const setCustomerMutation = trpc.clients.setCustomer.useMutation();
  const createCustomerMutation = trpc.customers.create.useMutation();
  const updateCustomerMutation = trpc.customers.update.useMutation();
  const deleteCustomerMutation = trpc.customers.delete.useMutation();
  const saveGoalsMutation = trpc.goals.save.useMutation();
  const saveProfileMutation = trpc.profile.save.useMutation();
  const changePasswordMutation = trpc.auth.changePassword.useMutation();
  const deleteAccountMutation = trpc.auth.deleteAccount.useMutation();
  const snoozeMutation = trpc.clients.snoozeReminder.useMutation();

  const markRead = trpc.features.markNotificationsRead.useMutation();
  const markAllRead = async () => {
    try { await markRead.mutateAsync({ ids: null }); await utils.features.notifications.invalidate(); } catch { /* read-only mode */ }
  };
  // A notification link is an in-app path: "/?atendimento=12" opens the client, "/?tela=promocoes" a section.
  const openNotification = async (item: AppNotification) => {
    if (!item.readAt && !readOnlyMode) { try { await markRead.mutateAsync({ ids: [item.id] }); await utils.features.notifications.invalidate(); } catch { /* ignore */ } }
    if (!item.link) return;
    const params = new URL(item.link, window.location.origin).searchParams;
    const recordId = Number(params.get("atendimento"));
    const section = URL_VIEWS[params.get("tela") ?? ""];
    if (recordId) {
      const record = visibleRecords.find((entry) => entry.id === recordId);
      if (record) openEdit(record); else toast.info(`Esse ${term("deal", true)} não está mais disponível para você.`);
    } else if (section && navViews.includes(section)) setView(section);
  };

  const snoozeReminder = async (record: ClientRecord) => {
    try {
      await snoozeMutation.mutateAsync({ id: record.id, until: addDaysISO(todayISO, prefs.reminderDays || 3) });
      await utils.clients.list.invalidate();
      toast.success(`Combinado: lembro de ${record.name} de novo em ${prefs.reminderDays || 3} dias.`);
    } catch (error) {
      toast.error(errorText(error, "Não foi possível adiar o lembrete."));
    }
  };

  // Show the reminders once per visit, like a message: "Opa, não esqueça de ligar para Fulano".
  const remindersAnnounced = useRef(false);
  useEffect(() => {
    if (remindersAnnounced.current || clientQuery.isLoading || workspaceQuery.isLoading || !reminders.length) return;
    remindersAnnounced.current = true;
    const [first] = reminders;
    toast(reminderText(first), {
      description: reminders.length > 1 ? `E mais ${reminders.length - 1} ${reminders.length === 2 ? term("customer", true) : term("customers", true)} esperando ligação. Veja no sino.` : `Está há ${prefs.reminderDays} dias ou mais sem data de retorno marcada.`,
      icon: <PhoneCall size={16} />,
      duration: 12_000,
      action: { label: "Abrir ficha", onClick: () => openPostcard(first) },
    });
  }, [reminders, clientQuery.isLoading, workspaceQuery.isLoading]);

  // Deep link: /?atendimento=ID opens that client's page (used by the reminder links).
  const deepLinkHandled = useRef(false);
  // Signing out and in as someone else keeps this screen mounted: start their visit fresh.
  const visitOf = useRef<string | null>(null);
  if (visitOf.current !== (auth.user?.openId ?? null)) {
    visitOf.current = auth.user?.openId ?? null;
    remindersAnnounced.current = false;
    deepLinkHandled.current = false;
  }
  useEffect(() => {
    if (deepLinkHandled.current || clientQuery.isLoading || !clientQuery.data) return;
    deepLinkHandled.current = true;
    const id = Number(new URLSearchParams(window.location.search).get("atendimento"));
    if (!id) return;
    const record = visibleRecords.find((item) => item.id === id);
    if (record) openEdit(record);
    else { setRecordInUrl(null); toast.info(`Esse ${term("deal", true)} não foi encontrado na sua conta.`); }
  }, [clientQuery.isLoading, clientQuery.data]);

  const openAccountSettings = (tab: "profile" | "goals" | "security" = "profile") => { setAccountSettingsTab(tab); setAccountSettingsOpen(true); };
  const openNew = (customer: Customer | null = null) => { setEditing(null); setPresetCustomer(customer); setDialogOpen(true); };
  const setRecordInUrl = (id: number | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("atendimento", String(id)); else url.searchParams.delete("atendimento");
    window.history.replaceState(null, "", url.toString());
  };
  const openEdit = (record: ClientRecord) => { setPostcardOpen(false); setEditing(record); setPresetCustomer(null); setDialogOpen(true); setRecordInUrl(record.id); };
  const changeDialog = (open: boolean) => { setDialogOpen(open); if (!open) setRecordInUrl(null); };
  const openPostcard = (record: ClientRecord) => { setPostcard({ recordId: record.id, customerId: record.customerId }); setPostcardOpen(true); };
  const openCustomerCard = (customer: Customer) => { setPostcard({ recordId: null, customerId: customer.id }); setPostcardOpen(true); };
  const go = (next: View) => { setView(next); setSidebarOpen(false); };
  useEffect(() => {
    if (!sidebarOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [sidebarOpen]);

  const postcardRecord = postcard?.recordId ? visibleRecords.find((item) => item.id === postcard.recordId) ?? null : null;
  const postcardCustomerId = postcardRecord ? postcardRecord.customerId : postcard?.customerId ?? null;
  const postcardCustomer = postcardCustomerId ? customers.find((item) => item.id === postcardCustomerId) ?? null : null;
  const postcardDeals = postcardCustomerId ? visibleRecords.filter((item) => item.customerId === postcardCustomerId) : [];

  const saveClient = async (values: ClientFormValues) => {
    setSaving(true);
    const product = editing ? productOf(editing) : products.find((item) => item.id === values.productId) ?? myProduct;
    const kind = stageOf(product, values.stage)?.kind;
    const payload = {
      name: values.name.trim(),
      contact: values.contact.trim() || null,
      contactDate: values.contactDate,
      lastProductSold: kind === "won" ? values.lastProductSold.trim() || null : null,
      objection: kind === "won" ? null : values.objection || null,
      objectionNotes: values.objectionNotes.trim() || null,
      stage: values.stage,
      followUpDate: values.followUpDate || null,
      customerId: values.customerId,
      customFields: values.customFields,
    };
    try {
      if (editing) await updateMutation.mutateAsync({ id: editing.id, ...payload });
      else await createMutation.mutateAsync({ ...payload, ...(values.productId ? { productId: values.productId } : {}) });
      await Promise.all([utils.clients.list.invalidate(), utils.customers.list.invalidate()]);
      toast.success(editing ? `${term("deal")} ${agree("deal", "atualizado")}.` : `${term("deal")} ${agree("deal", "registrado")}.`);
      changeDialog(false);
    } catch (error) {
      toast.error(errorText(error, "Não foi possível salvar. Tente novamente."));
    } finally {
      setSaving(false);
    }
  };

  const deleteClient = async (record: ClientRecord) => {
    if (!(await dialog.confirm({ title: `Excluir ${article()} ${term("deal", true)} de ${record.name}?`, description: `${record.reference} · Esta ação não pode ser desfeita.`, confirmLabel: "Excluir", danger: true }))) return;
    try {
      await deleteMutation.mutateAsync({ id: record.id });
      await Promise.all([utils.clients.list.invalidate(), utils.customers.list.invalidate()]);
      toast.success(`${term("deal")} ${agree("deal", "excluído")}.`);
    } catch (error) {
      toast.error(errorText(error, "Não foi possível excluir."));
    }
  };

  const moveStage = async (record: ClientRecord, stageKey: string) => {
    const product = productOf(record);
    const stage = stageOf(product, stageKey);
    if (!stage || stage.key === record.stage) return;
    // A "não fechou" stage needs the reason: ask for it right away.
    let objection: string | null | undefined;
    const reasons = product?.config.reasons ?? [];
    if (stage.kind === "lost" && reasons.length && !reasons.some((reason) => reason.key === record.objection)) {
      objection = await dialog.askChoice({ title: `Por que ${record.name} não fechou?`, label: "Motivo", confirmLabel: `Mover para ${stage.label}`, options: reasons.map((reason) => ({ value: reason.key, label: reason.label })) });
      if (!objection) return;
    }
    const saleStatus = stage.kind === "won" ? "sold" as const : stage.kind === "lost" ? "not_sold" as const : "pending" as const;
    // Move the card right away; the server confirms (or the list is reloaded on error).
    utils.clients.list.setData(undefined, (current) => current?.map((item) => (item.id === record.id ? { ...item, stage: stage.key, saleStatus, ...(objection ? { objection } : {}) } : item)));
    try {
      await stageMutation.mutateAsync({ id: record.id, stage: stage.key, ...(objection !== undefined ? { objection } : {}) });
      toast.success(stage.kind === "handoff" ? `${record.name} virou caso técnico: a gerência da agência foi responsabilizada.` : `${record.name} foi para ${stage.label}.`);
    } catch (error) {
      toast.error(errorText(error, "Não foi possível mudar a etapa."));
    } finally {
      await utils.clients.list.invalidate();
    }
  };

  const article = () => (prefs.dealFeminine ? "a" : "o");

  const openCustomerForm = (state: CustomerFormState) => { setPostcardOpen(false); setCustomerForm(state); setCustomerFormOpen(true); };
  const saveCustomer = async (values: CustomerFormValues) => {
    if (!customerForm) return;
    setSavingCustomer(true);
    const payload = {
      name: values.name.trim(), document: values.document, phone: values.phone, email: values.email, birthDate: values.birthDate || null,
      address: values.address, district: values.district, city: values.city, state: values.state, zip: values.zip, notes: values.notes, customFields: values.customFields,
    };
    try {
      let customerId = customerForm.initial?.id ?? null;
      if (customerForm.initial) await updateCustomerMutation.mutateAsync({ id: customerForm.initial.id, ...payload });
      else customerId = (await createCustomerMutation.mutateAsync(payload)).id;
      if (customerForm.linkRecordId && customerId) await setCustomerMutation.mutateAsync({ id: customerForm.linkRecordId, customerId });
      await Promise.all([utils.customers.list.invalidate(), utils.clients.list.invalidate()]);
      toast.success(customerForm.initial ? "Cadastro atualizado." : `${term("customer")} ${agree("customer", "cadastrado")}.`);
      setCustomerFormOpen(false);
      // Back to the postcard, now with the address side filled in.
      if (customerId) { setPostcard({ recordId: customerForm.linkRecordId ?? postcard?.recordId ?? null, customerId }); setPostcardOpen(true); }
    } catch (error) {
      toast.error(errorText(error, "Não foi possível salvar o cadastro."));
    } finally {
      setSavingCustomer(false);
    }
  };
  const deleteCustomer = async (customer: Customer) => {
    if (!(await dialog.confirm({ title: `Excluir o cadastro de ${customer.name}?`, description: `${agree("deal", "Os")} ${term("deals", true)} continuam existindo, só deixam de estar ligados ao cadastro.`, confirmLabel: "Excluir", danger: true }))) return;
    try {
      await deleteCustomerMutation.mutateAsync({ id: customer.id });
      await Promise.all([utils.customers.list.invalidate(), utils.clients.list.invalidate()]);
      setCustomerFormOpen(false);
      setPostcard(null);
      toast.success("Cadastro excluído.");
    } catch (error) {
      toast.error(errorText(error, "Não foi possível excluir o cadastro."));
    }
  };

  const saveGoals = async (nextGoals: GoalSettings) => {
    try {
      await saveGoalsMutation.mutateAsync(nextGoals);
      await utils.goals.get.invalidate();
      toast.success("Metas mensais atualizadas.");
      return true;
    } catch {
      toast.error("Não foi possível salvar as metas.");
      return false;
    }
  };

  const saveProfile = async (nextProfile: ProfileSettings) => {
    try {
      await saveProfileMutation.mutateAsync(nextProfile);
      await utils.profile.get.invalidate();
      toast.success("Perfil atualizado.");
      return true;
    } catch {
      toast.error("Não foi possível salvar seu perfil.");
      return false;
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<string | null> => {
    try {
      await changePasswordMutation.mutateAsync({ currentPassword, newPassword });
      toast.success("Senha alterada.");
      return null;
    } catch (error) {
      return errorText(error, "Não foi possível alterar a senha.");
    }
  };

  const logout = async () => {
    try { await auth.logout(); } catch { toast.error("Não foi possível sair."); }
  };

  const deleteAccount = async (password: string): Promise<string | null> => {
    try {
      await deleteAccountMutation.mutateAsync({ password });
    } catch (error) {
      return errorText(error, "Não foi possível excluir a conta.");
    }
    setDeleteAccountOpen(false);
    toast.success("Sua conta foi excluída.");
    await logout();
    return null;
  };

  const exportCsv = () => {
    if (!filteredRecords.length) { toast.info("Não há registros para exportar."); return; }
    const rows = [
      ["Referencial", "Responsável", "Produto", `Nome do ${term("customer", true)}`, "Contato", "Dia do contato", "Etapa", "Resultado", "Item vendido", "Motivo", "Observação", "Próximo contato", "Detalhes"],
      ...filteredRecords.map((item) => {
        const product = productOf(item);
        const details = (product?.config.fields ?? []).filter((field) => item.customFields[field.key]).map((field) => `${field.label}: ${formatCustomValue(field, item.customFields[field.key])}`).join("; ");
        return [item.reference, item.isMine ? (profile.displayName || "Você") : item.ownerName, product?.name ?? "", item.name, item.contact ?? "", item.contactDate, stageName(product, item.stage), saleLabel(item.saleStatus), item.lastProductSold ?? "", item.objection ? reasonLabel(product, item.objection) : "", item.objectionNotes ?? "", item.followUpDate ?? "", details];
      }),
    ];
    const csv = "﻿" + rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `valora-${term("deals", true).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => { setSearch(""); setOutcomeFilter("all"); setSaleFilter("all"); setStageFilter("all"); setReasonFilter("all"); setItemFilter("all"); setProductFilter("all"); setFieldFilters({}); setDateFrom(""); setDateTo(""); };
  const greeting = profile.displayName.trim().split(/\s+/)[0] || "por aqui";
  const isRecordsView = view === "overview" || view === "clients";
  const showOwner = effectiveScope === "area";
  const scopeSwitch = areaLabel ? (
    <div className="scope-switch" role="group" aria-label={`Quais ${term("deals", true)} mostrar`}>
      <button type="button" className={effectiveScope === "mine" ? "active" : ""} aria-pressed={effectiveScope === "mine"} onClick={() => setScope("mine")}>Meus</button>
      <button type="button" className={effectiveScope === "area" ? "active" : ""} aria-pressed={effectiveScope === "area"} onClick={() => setScope("area")}>{areaLabel}</button>
    </div>
  ) : null;

  if (auth.loading) return <div className="auth-loading"><div className="loader-ring" /><span>Preparando seu espaço de trabalho…</span></div>;
  if (!auth.user) return <LoginScreen onLogin={auth.login} loggingIn={auth.loggingIn} />;

  const deals = term("deals", true);
  const heading: Record<View, ReactNode> = {
    overview: <>Seu pipeline, <em>em movimento.</em></>,
    clients: <>{term("deals")} <em>{agree("deal", "registrados")}.</em></>,
    customers: <>{term("customers")} <em>{agree("customer", "cadastrados")}.</em></>,
    agenda: <>Próximos <em>contatos.</em></>,
    agencies: companyRole === "leader" ? <>Sua <em>equipe.</em></> : <>{companyRole === "admin" ? "Suas" : "Sua"} <em>{companyRole === "admin" ? "agências." : "agência."}</em></>,
    promotions: <>Promoções e <em>autorizações.</em></>,
    customize: companyRole ? <>Do jeito da <em>sua empresa.</em></> : <>Do <em>seu jeito.</em></>,
    bugs: <>Relatos de <em>erro.</em></>,
    team: <>Sua <em>empresa.</em></>,
    admin: <>Todos os <em>usuários.</em></>,
    pipeline: <>Acompanhe cada <em>etapa.</em></>,
  };
  const subtitle: Record<View, string> = {
    overview: `Olá, ${greeting}. ${effectiveScope === "area" ? `Você está vendo: ${areaLabel?.toLowerCase()}.` : `Veja como estão ${agree("deal", "seus")} ${deals}.`}`,
    clients: `Consulte, atualize e organize ${agree("deal", "os")} ${deals} da sua carteira.`,
    customers: `O cadastro de cada ${term("customer", true)}, em formato de cartão postal: endereço, contatos e histórico de ${deals}.`,
    agenda: "Saiba para quem ligar hoje, recupere os retornos atrasados e organize os próximos 7, 15 ou 30 dias.",
    agencies: companyRole === "admin" ? "Clique numa agência para ver o rendimento dela, das equipes e de cada funcionário." : companyRole === "manager" ? "Rendimento da sua agência, das equipes e de cada funcionário. Acompanhe os atendimentos no Pipeline da agência." : "Rendimento da sua equipe e de cada pessoa. Peça promoções por aqui.",
    promotions: "Pedidos de promoção: o líder pede, o gerente aprova e a administração dá a palavra final.",
    customize: companyRole ? "Produtos e pipelines, vocabulário, nome, logo, cores, perfis e cargos da sua empresa." : "Escolha o pipeline com que você trabalha e as palavras do seu negócio.",
    bugs: "Problemas e sugestões enviados pelas pessoas que usam o app.",
    team: "Trabalhe sozinho ou com sua equipe: agências, equipes, perfis e convites.",
    admin: "Contas de todas as empresas e de quem trabalha de forma independente.",
    pipeline: `Organize os ${term("customers", true)} pelo momento atual. Clique num ${term("customer", true)} para abrir a ficha.`,
  };
  const eyebrow = view === "team" ? "EMPRESA E EQUIPES" : view === "admin" || view === "bugs" ? "SUPER ADMINISTRADOR" : view === "agencies" ? "DESEMPENHO" : view === "promotions" ? "CARREIRA" : view === "customize" ? "PERSONALIZAÇÃO" : view === "customers" ? "CADASTRO" : "PAINEL DE VENDAS";
  const tagline = prefs.tagline || (myProduct ? myProduct.name.toLocaleUpperCase("pt-BR") : "");

  return (
    <WorkspaceProvider data={workspace}>
    <div className="app-shell">
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}
      <aside id="app-sidebar" className={`app-sidebar ${sidebarOpen ? "open" : ""}`} aria-hidden={!sidebarOpen} aria-label="Menu principal">
        <div className="sidebar-brand"><ValoraLogo variant="dark" tagline={tagline} /><button type="button" className="sidebar-close" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <div className="sidebar-label">ESPAÇO DE TRABALHO</div>
        <nav className="side-nav" aria-label="Navegação principal">
          {navViews.map((item) => {
            const Icon = VIEW_ICON[item];
            const count = item === "clients" ? myRecords.length : item === "customers" ? myCustomers.length : item === "agenda" ? dueFollowUpCount : item === "promotions" ? pendingPromotions : item === "bugs" ? newBugReports : null;
            return <button key={item} className={`nav-item ${view === item ? "active" : ""}`} onClick={() => go(item)}><Icon size={18} /><span>{viewLabel(item)}</span>{count ? <span className="nav-count">{count}</span> : null}{item === "pipeline" && <span className="nav-live" />}</button>;
          })}
        </nav>
        {!readOnlyMode && companyRole !== "admin" && <div className="sidebar-tip"><div className="tip-spark"><Sparkles size={16} /></div><strong>Um próximo passo<br />de cada vez.</strong><p>Registre cada conversa para manter suas oportunidades em movimento.</p><button onClick={() => { setSidebarOpen(false); openNew(); }}>Registrar {term("deal", true)} <ArrowRight size={13} /></button></div>}
        <div className="sidebar-bottom"><div className="privacy-line"><ShieldCheck size={14} /><span>Dados protegidos por conta</span></div><div className="sidebar-user"><button type="button" className="sidebar-profile-button" title="Configurações da conta" disabled={readOnlyMode} onClick={() => { setSidebarOpen(false); openAccountSettings("profile"); }}><span className="user-avatar">{profile.avatarDataUrl ? <img src={profile.avatarDataUrl} alt="" /> : (profile.displayName.trim().charAt(0).toLocaleUpperCase("pt-BR") || "V")}</span><span className="user-details"><strong>{profile.displayName || "Usuário Valora"}</strong><small>{profile.jobTitle || myRoleLabel}</small></span></button>{readOnlyMode
          ? <button className="logout-button" title="Voltar para a minha conta" aria-label="Voltar para a minha conta" onClick={() => stopViewAs()}><Undo2 size={16} /></button>
          : <button className="logout-button" title="Sair" aria-label="Sair da conta" onClick={() => void logout()}><LogOut size={16} /></button>}</div></div>
      </aside>
      <main className="main-area">
        {viewedBy && <div className="view-as-banner" role="status"><Eye size={16} /><span>Você está vendo o VALORA como <b>{profile.displayName || auth.user.name || auth.user.email}</b> ({myRoleLabel}) — somente leitura.</span><button type="button" onClick={() => stopViewAs()}><Undo2 size={14} />Voltar para a minha conta</button></div>}
        <header className="topbar"><div className="topbar-left"><div className="mobile-brand">{branding?.logoDataUrl ? <span className="company-brand"><img src={branding.logoDataUrl} alt="" /><strong>{branding.displayName || branding.companyName}</strong></span> : branding?.displayName ? <span className="company-brand"><strong>{branding.displayName}</strong></span> : <ValoraLogo compact />}</div><div className="breadcrumb"><span className="crumb-separator">/</span><strong>{viewLabel(view)}</strong></div></div><div className="topbar-right"><span className="today-chip"><CalendarDays size={14} />{new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}</span><span className="topbar-divider" /><ReminderBell reminders={reminders} notifications={notificationsQuery.data ?? []} today={todayISO} reminderDays={prefs.reminderDays || 3} readOnly={readOnlyMode} onOpen={openPostcard} onSnooze={(record) => void snoozeReminder(record)} onNotification={(item) => void openNotification(item)} onMarkAllRead={() => void markAllRead()} />{readOnlyMode
          ? <button type="button" className="button button-outline view-as-exit" onClick={() => stopViewAs()}><Undo2 size={14} />Voltar</button>
          : <AccountMenu profile={profile} roleLabel={myRoleLabel} email={auth.user.email ?? ""} onOpenProfile={() => openAccountSettings("profile")} onChangePassword={() => openAccountSettings("security")} onLogout={() => void logout()} onDeleteAccount={() => setDeleteAccountOpen(true)} onReportBug={() => setBugReportOpen(true)} />}<button type="button" className="section-menu-button menu-right" aria-expanded={sidebarOpen} aria-controls="app-sidebar" onClick={() => setSidebarOpen((current) => !current)} title="Abrir menu" aria-label="Abrir menu"><Menu size={17} /><span>Menu</span></button></div></header>

        <div className="page-content">
          <section className="welcome-row"><div><div className="eyebrow page-eyebrow"><span className="eyebrow-line" />{eyebrow}</div><h1>{heading[view]}</h1><p>{subtitle[view]}</p></div>{RECORD_VIEWS.includes(view) && !readOnlyMode && <button className="button button-primary new-client-button" onClick={() => openNew()}><Plus size={17} />{newWord("deal")} {term("deal", true)}</button>}</section>

          {clientQuery.isError && <div className="notice notice-error"><CircleDollarSign size={18} /><span>Não foi possível carregar seus registros. Verifique a conexão e tente novamente.</span><button onClick={() => void clientQuery.refetch()}>Tentar novamente</button></div>}

          {isRecordsView && <>
            <div className="section-toolbar"><div className="section-title-wrap"><h2>{view === "overview" ? "Visão do período" : `${agree("deal", "Todos")} ${agree("deal", "os")} ${deals}`}</h2><span className="soft-count">{currentPeriodRecords.length} {currentPeriodRecords.length === 1 ? "registro" : "registros"}</span></div><div className="toolbar-controls">{scopeSwitch}<label className="period-select"><CalendarDays size={15} /><select aria-label="Período dos indicadores" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>{Object.entries(periodLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={14} /></label><button className="button button-outline export-button" onClick={exportCsv}><ArrowDownToLine size={15} /><span>Exportar</span></button></div></div>
            {view === "clients" ? <section className="stats-grid" aria-label="Situação dos retornos">
              {OUTCOMES.map((item) => {
                const Icon = { waiting: Clock3, success: BadgeCheck, failed: ThumbsDown, callback: RotateCcw }[item.value];
                const count = outcomeCounts[item.value];
                const active = outcomeFilter === item.value;
                return (
                  <button type="button" key={item.value} className={`stat-card stat-card-button ${active ? "active" : ""}`} aria-pressed={active} onClick={() => setOutcomeFilter(active ? "all" : item.value)} title={active ? "Mostrar todos" : `Mostrar só: ${item.label}`}>
                    <div className="stat-top"><span className={`stat-icon ${item.tone}`}><Icon size={18} strokeWidth={2} /></span><span className="stat-period">{active ? "Filtrando" : "No período"}</span></div>
                    <p className="stat-label">{item.label}</p>
                    <div className="stat-value-row"><strong>{count}</strong><span className="stat-share">{moneylessPercent(count, currentPeriodRecords.length)}</span></div>
                    <p className="stat-note">{item.note}</p>
                    <div className={`stat-accent ${item.tone}`} />
                  </button>
                );
              })}
            </section> : <section className="stats-grid" aria-label="Indicadores do período">
              <StatCard icon={Users} label={`${term("customers")} atendidos`} value={String(currentPeriodRecords.length)} note="Conversas registradas" tone="blue" />
              <StatCard icon={BadgeCheck} label={`${term("sales")} fechadas`} value={String(sold)} note={`${moneylessPercent(sold, currentPeriodRecords.length)} ${agree("deal", "dos")} ${deals}`} tone="teal" progress={conversion} />
              <StatCard icon={TrendingUp} label="Taxa de conversão" value={`${conversion}%`} note={`${term("sales")} sobre ${deals}`} tone="violet" />
              <StatCard icon={Hourglass} label="Em andamento" value={String(openCount)} note="Ainda sem desfecho" tone="amber" />
            </section>}
            {view === "overview" && prefs.showGoals && <MonthlyGoals monthLabel={monthLabel} contacts={myMonthlyRecords.length} sales={myMonthlyRecords.filter((item) => item.saleStatus === "sold").length} goals={goals} loading={goalQuery.isLoading} onEditGoals={() => openAccountSettings("goals")} />}
          </>}

          {view === "overview" && <section className="insights-grid">
            <article className="panel funnel-panel"><div className="panel-heading"><div><h2>Movimento do pipeline</h2><p>{pipelineProduct ? `${pipelineProduct.name} · ${deals} por etapa` : `${term("deals")} por etapa`}</p></div><button className="text-action" onClick={() => setView("pipeline")}>Ver funil <ArrowRight size={14} /></button></div>
              {productTabs}
              <div className="stage-summary">{pipelineProduct?.config.stages.map((stage) => { const count = productRecords.filter((item) => item.stage === stage.key).length; const width = productRecords.length ? Math.max(count / productRecords.length * 100, count ? 5 : 0) : 0; return <div className="stage-summary-row" key={stage.key}><div className="stage-summary-title"><span className={`stage-dot stage-${stage.color}`} /><span>{stage.label}</span><strong>{count}</strong></div><div className="stage-track"><i className={`track-${stage.color}`} style={{ width: `${width}%` }} /></div></div>; })}</div>
              <div className="panel-footer-note"><span className="online-dot" />Os números acompanham os filtros de período.</div>
            </article>
            <article className="panel objections-panel"><div className="panel-heading"><div><h2>Principais objeções</h2><p>Motivos registrados sem fechamento</p></div><span className="objection-icon"><SlidersHorizontal size={16} /></span></div>
              {objections.length ? <div className="objection-list">{objections.map(([label, count], index) => <div className="objection-row" key={label}><span className={`objection-rank rank-${index + 1}`}>0{index + 1}</span><span className="objection-name">{label}</span><div className="objection-track"><i style={{ width: `${Math.round((count / lostWithReason.length) * 100)}%` }} /></div><strong>{count}</strong></div>)}</div> : <div className="compact-empty"><div className="empty-small-icon"><SlidersHorizontal size={17} /></div><strong>Sem objeções registradas</strong><span>Os motivos de não fechar aparecerão aqui.</span></div>}
              <div className="objection-footer"><span><ArrowDownRight size={14} />{followUps} retornos programados</span><button onClick={() => setView("clients")}>Ver {deals} <ArrowRight size={13} /></button></div>
            </article>
            <article className="panel product-mix-panel"><div className="panel-heading"><div><h2>O que mais vendeu</h2><p>{term("sales")} registradas em {monthLabel}</p></div><span className="objection-icon"><ShoppingBag size={16} /></span></div>
              <div className="product-mix-list">{topItems.length ? topItems.map(([item, count]) => (
                <button type="button" className={`product-mix-row ${item ? "" : "product-mix-unclassified"}`} key={item || "none"} onClick={() => { clearFilters(); setPeriod("all"); setItemFilter(item || "none"); setView("clients"); }}><span>{item || "Sem item informado"}</span><span className="product-mix-track"><i style={{ width: `${Math.round((count / monthlySold.length) * 100)}%` }} /></span><strong>{count}</strong></button>
              )) : <div className="compact-empty"><div className="empty-small-icon"><ShoppingBag size={17} /></div><strong>Nenhuma {term("sale", true)} neste mês</strong><span>As {term("sales", true)} fechadas aparecem aqui, por item vendido.</span></div>}
              </div><div className="product-mix-footer">Selecione um item para filtrar a carteira.</div>
            </article>
          </section>}

          {view === "pipeline" && <section className="pipeline-section"><div className="pipeline-toolbar"><div><h2>{pipelineProduct ? `Pipeline de ${pipelineProduct.name}` : "Etapas"}</h2><p>{productRecords.length} {productRecords.length === 1 ? term("customer", true) : term("customers", true)} no período selecionado · clique para abrir a ficha</p></div><div className="toolbar-controls">{scopeSwitch}<label className="period-select"><CalendarDays size={15} /><select aria-label="Período do pipeline" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>{Object.entries(periodLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={14} /></label></div></div>
            {productTabs}
            {workspaceQuery.isLoading || !pipelineProduct ? <div className="loading-table"><LoaderCircle className="spin" size={20} />Carregando o pipeline…</div> : <ClientPipeline product={pipelineProduct} records={productRecords} onOpen={openPostcard} onMove={(record, stage) => void moveStage(record, stage)} locked={readOnlyMode} />}
          </section>}

          {view === "customers" && <CustomersPanel customers={customers} loading={customersQuery.isLoading} readOnly={readOnlyMode} onOpen={openCustomerCard} onNew={() => openCustomerForm({ initial: null, prefill: null, linkRecordId: null })} />}

          {view === "agencies" && agencyViewLabel && <AgencyPanel canPromote={!readOnlyMode && (companyRole === "leader" || companyRole === "manager" || companyRole === "admin")} myOpenId={auth.user.openId} />}

          {view === "promotions" && (companyRole === "admin" || companyRole === "manager" || companyRole === "leader") && <PromotionsPanel role={companyRole} />}

          {view === "customize" && companyRole === "admin" && <CustomizePanel agencies={orgQuery.data && "agencies" in orgQuery.data ? orgQuery.data.agencies ?? [] : []} />}
          {view === "customize" && !companyRole && <PersonalCustomizePanel />}

          {view === "bugs" && isSuperAdmin && <BugReportsPanel />}

          {view === "team" && <TeamPanel myOpenId={auth.user.openId} />}

          {view === "admin" && isSuperAdmin && <SuperAdminPanel myOpenId={auth.user.openId} />}

          {view === "agenda" && <FollowUpAgenda records={myRecords} today={todayISO} loading={clientQuery.isLoading} onEdit={openEdit} onNew={() => openNew()} />}

          {isRecordsView && <section className="panel records-panel"><div className="records-heading"><div><div className="panel-heading-title"><h2>{view === "overview" ? `${term("deals")} recentes` : "Sua carteira"}</h2>{view === "overview" && <span className="recent-badge">RECENTES</span>}</div><p>{view === "overview" ? "Acompanhe o histórico e atualize a próxima etapa." : `Use a busca e os filtros para encontrar ${article()} ${term("deal", true)}.`}</p></div>{view === "overview" && <button className="text-action" onClick={() => setView("clients")}>Ver todos <ArrowRight size={14} /></button>}</div>
            <div className="filter-toolbar"><div className="search-box"><Search size={16} /><input aria-label="Buscar" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, referência, contato ou qualquer informação…" />{search && <button title="Limpar busca" onClick={() => setSearch("")}><X size={14} /></button>}</div><button className={`filter-button ${showFilters || activeFilterCount ? "filter-active" : ""}`} onClick={() => setShowFilters((current) => !current)}><Filter size={15} />Filtros{activeFilterCount > 0 && <span>{activeFilterCount}</span>}</button></div>
            {showFilters && <div className="filter-panel">
              <label>Contato a partir de<input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPeriod("all"); }} /></label>
              <label>Contato até<input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPeriod("all"); }} /></label>
              {usedProducts.length > 1 && <label>Produto<select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}><option value="all">Todos</option>{usedProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>}
              <label>Resultado<select value={saleFilter} onChange={(event) => setSaleFilter(event.target.value)}><option value="all">Todos</option><option value="sold">Fechou</option><option value="not_sold">Não fechou</option><option value="pending">Em andamento</option></select></label>
              <label>Etapa<select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="all">Todas</option>{filterStages.map((label) => <option key={label} value={label}>{label}</option>)}</select></label>
              {filterReasons.length > 0 && <label>Motivo<select value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value)}><option value="all">Todos</option>{filterReasons.map((label) => <option key={label} value={label}>{label}</option>)}</select></label>}
              <label>Item vendido<select value={itemFilter} onChange={(event) => setItemFilter(event.target.value)}><option value="all">Todos</option>{soldItems.map((item) => <option key={item} value={item}>{item}</option>)}<option value="none">Sem item informado</option></select></label>
              {filterFields.map((field) => <label key={field.key}>{field.label}<select value={fieldFilters[field.key] ?? ""} onChange={(event) => setFieldFilters((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">Todos</option>{field.type === "yesno" ? <><option value="sim">Sim</option><option value="nao">Não</option></> : field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>)}
              {activeFilterCount > 0 && <button className="clear-filters" onClick={clearFilters}><X size={13} />Limpar filtros</button>}
            </div>}
            {clientQuery.isLoading ? <div className="loading-table"><LoaderCircle className="spin" size={20} />Carregando…</div> : <ClientTable records={view === "overview" ? filteredRecords.slice(0, 6) : filteredRecords} productOf={productOf} onOpen={openPostcard} onEdit={openEdit} onDelete={deleteClient} onStageChange={(record, stage) => void moveStage(record, stage)} showOwner={showOwner} showProduct={usedProducts.length > 1} locked={readOnlyMode} />}
            {view === "overview" && filteredRecords.length > 6 && <button className="table-more" onClick={() => setView("clients")}>Ver {agree("deal", "os")} {filteredRecords.length - 6} {deals} restantes <ArrowRight size={14} /></button>}
            <div className="table-bottom"><span>Exibindo {Math.min(filteredRecords.length, view === "overview" ? 6 : filteredRecords.length)} de {filteredRecords.length} registros</span><span>Última atualização automática</span></div>
          </section>}
          <footer className="page-footer"><span>VALORA <i>·</i> {tagline || "PIPELINE DE VENDAS"}</span><span><ShieldCheck size={13} /> Seus dados ficam vinculados à sua conta</span></footer>
        </div>
      </main>
      <AccountSettingsDialog open={accountSettingsOpen} onOpenChange={setAccountSettingsOpen} initialTab={accountSettingsTab} profile={profile} profileLoading={profileQuery.isLoading} savingProfile={saveProfileMutation.isPending} goals={goals} goalsLoading={goalQuery.isLoading} savingGoals={saveGoalsMutation.isPending} monthLabel={monthLabel} onSaveProfile={saveProfile} onSaveGoals={saveGoals} email={auth.user.email ?? ""} changingPassword={changePasswordMutation.isPending} onChangePassword={changePassword} />
      <BugReportDialog open={bugReportOpen} onOpenChange={setBugReportOpen} signedIn />
      <DeleteAccountDialog open={deleteAccountOpen} onOpenChange={setDeleteAccountOpen} username={auth.user.email ?? ""} deleting={deleteAccountMutation.isPending} onConfirm={deleteAccount} />
      <ClientFormDialog open={dialogOpen} onOpenChange={changeDialog} initial={editing} onSubmit={saveClient} saving={saving} readOnly={readOnlyMode || Boolean(editing && !editing.canEdit)} ownerName={readOnlyMode && editing?.isMine ? (profile.displayName || auth.user.email || undefined) : editing?.ownerName} viewOnlyReason={readOnlyMode ? "Modo Ver como: somente leitura." : undefined} customers={editing && !editing.isMine ? customers.filter((customer) => customer.id === editing.customerId) : myCustomers} presetCustomer={presetCustomer} />
      <ClientPostcard open={postcardOpen} onOpenChange={setPostcardOpen} record={postcardRecord} customer={postcardCustomer} deals={postcardDeals} readOnly={readOnlyMode} logo={branding?.logoDataUrl}
        onEditDeal={openEdit} onOpenDeal={openPostcard}
        onRegister={(record) => openCustomerForm({ initial: null, prefill: { name: record.name, ...(record.contact?.includes("@") ? { email: record.contact } : { phone: record.contact ?? "" }) }, linkRecordId: record.id })}
        onEditCustomer={(customer) => openCustomerForm({ initial: customer, prefill: null, linkRecordId: null })}
        onNewDeal={(customer) => { setPostcardOpen(false); openNew(customer); }} />
      <CustomerFormDialog open={customerFormOpen} onOpenChange={setCustomerFormOpen} initial={customerForm?.initial ?? null} prefill={customerForm?.prefill} saving={savingCustomer} onSubmit={saveCustomer} onDelete={(customer) => void deleteCustomer(customer)} />
    </div>
    </WorkspaceProvider>
  );
}
