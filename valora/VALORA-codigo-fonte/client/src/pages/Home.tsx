import AccountMenu from "@/components/AccountMenu";
import AgencyPanel from "@/components/AgencyPanel";
import BugReportDialog from "@/components/BugReportDialog";
import BugReportsPanel from "@/components/BugReportsPanel";
import CustomizePanel from "@/components/CustomizePanel";
import PromotionsPanel from "@/components/PromotionsPanel";
import type { AppNotification } from "@/components/ReminderBell";
import { useAppDialog } from "@/components/AppDialogs";
import AccountSettingsDialog from "@/components/AccountSettingsDialog";
import ClientFormDialog from "@/components/ClientFormDialog";
import DeleteAccountDialog from "@/components/DeleteAccountDialog";
import FollowUpAgenda from "@/components/FollowUpAgenda";
import LoginScreen from "@/components/LoginScreen";
import ClientPipeline, { stageMoveProblem } from "@/components/ClientPipeline";
import MonthlyGoals from "@/components/MonthlyGoals";
import ReminderBell, { reminderText } from "@/components/ReminderBell";
import SuperAdminPanel from "@/components/SuperAdminPanel";
import TeamPanel from "@/components/TeamPanel";
import ValoraLogo from "@/components/ValoraLogo";
import { useAuth } from "@/_core/hooks/useAuth";
import { DEFAULT_MONTHLY_GOALS, OBJECTIONS, PIPELINE_STAGES, PRODUCT_CLASSES, objectionLabel, productClassLabel, stageLabel, type ClientFormValues, type ClientRecord, type GoalSettings, type ProductClass, type ProfileSettings } from "@/lib/client-types";
import { trpc } from "@/lib/trpc";
import { applyBrandColors, roleLabel, setBrandLabels } from "@/lib/branding";
import { OUTCOMES, REMINDER_DAYS, addDaysISO, needsCallReminder, outcomeOf, type Outcome } from "@/lib/followups";
import { stopViewAs } from "@/lib/viewAs";
import { COMPANY_ROLE_LABELS, SUPER_ADMIN_LABEL } from "@shared/const";
import { toast } from "sonner";
import {
  ArrowDownToLine, ArrowDownRight, ArrowRight, ArrowUpRight, BadgeCheck,
  Banknote, Building2, CalendarDays, Check, ChevronDown, CircleDollarSign, Clock3,
  Filter, LayoutDashboard, LoaderCircle, LogOut, Menu, MoreHorizontal, Plus,
  Search, ShieldCheck, SlidersHorizontal, Sparkles, Target, TrendingUp,
  Users, X, Eye, Undo2, PhoneCall, ThumbsDown, RotateCcw, Wrench, Award, Palette, Bug,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type View = "overview" | "clients" | "pipeline" | "agenda" | "agencies" | "promotions" | "team" | "customize" | "admin" | "bugs";
type CompanyRoleOrNone = "admin" | "manager" | "leader" | "member" | null;

/** Each position sees only what it needs. Super administrators also get Usuários and Relatos de erro. */
const VIEWS_BY_ROLE: Record<"admin" | "manager" | "leader" | "member" | "independent", View[]> = {
  admin: ["agencies", "promotions", "team", "customize"],
  manager: ["agencies", "pipeline", "promotions", "clients", "agenda", "overview"],
  leader: ["overview", "pipeline", "agencies", "promotions", "clients", "agenda"],
  member: ["overview", "clients", "agenda", "pipeline"],
  independent: ["overview", "clients", "agenda", "pipeline", "team"],
};
const VIEW_ICON: Record<View, typeof Users> = {
  overview: LayoutDashboard, clients: Users, agenda: CalendarDays, pipeline: Target, agencies: Building2,
  promotions: Award, team: Building2, customize: Palette, admin: ShieldCheck, bugs: Bug,
};
const RECORD_VIEWS: View[] = ["overview", "clients", "agenda", "pipeline"];
const URL_VIEWS: Record<string, View> = { promocoes: "promotions", relatos: "bugs", agencias: "agencies", pipeline: "pipeline", personalizar: "customize" };
type Scope = "mine" | "area";

const SHORT_ROLE = { admin: "Admin", manager: "Gerente", leader: "Líder", member: "Usuário" } as const;
// Admins only get numbers (Agências), so they have no "see my area" switch.
const AREA_LABEL: Partial<Record<"leader" | "manager" | "admin" | "member", string>> = { leader: "Minha equipe", manager: "Minha agência" };
const VIEW_LABEL: Record<View, string> = { overview: "Visão geral", clients: "Atendimentos", agenda: "Próximos contatos", pipeline: "Pipeline", agencies: "Agências", promotions: "Promoções", team: "Minha empresa", customize: "Personalizar", admin: "Usuários do sistema", bugs: "Relatos de erro" };
type Period = "7" | "30" | "90" | "all";

const periodLabel: Record<Period, string> = { "7": "Últimos 7 dias", "30": "Últimos 30 dias", "90": "Últimos 90 dias", all: "Todo o período" };
const limitLabel = (value: string) => value === "yes" ? "Tem limite" : value === "no" ? "Sem limite" : "Não verificado";
const bankLabel = (value: string) => value === "yes" ? "Cliente do banco" : value === "no" ? "Novo cliente" : "Não informado";
const saleLabel = (value: string) => value === "sold" ? "Venda realizada" : value === "not_sold" ? "Não fechou" : "Em andamento";
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
const localDateISO = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const moneylessPercent = (part: number, whole: number) => whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`;

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
  records, onEdit, onDelete, onStageChange, showOwner, locked,
}: {
  records: ClientRecord[];
  showOwner: boolean;
  /** "Ver como": everything is read-only. */
  locked: boolean;
  onEdit: (record: ClientRecord) => void;
  onDelete: (record: ClientRecord) => void;
  onStageChange: (record: ClientRecord, stage: ClientRecord["stage"]) => void;
}) {
  if (!records.length) return (
    <div className="table-empty">
      <div className="empty-illustration"><Users size={24} /></div>
      <h3>Nenhum atendimento por aqui</h3>
      <p>Cadastre um contato ou ajuste os filtros para encontrar outro atendimento.</p>
    </div>
  );
  return (
    <div className="table-scroll"><table className="clients-table">
      <thead><tr><th>Cliente</th>{showOwner && <th>Responsável</th>}<th>Data do contato</th><th>Limite</th><th>Resultado</th><th>Produto</th><th>Classe</th><th>Objeção</th><th>Etapa</th><th><span className="sr-only">Ações</span></th></tr></thead>
      <tbody>{records.map((record) => <tr key={record.id}>
        <td><button type="button" className="table-client" onClick={() => onEdit(record)}>{record.stage === "technical" && <span className="technical-flag" title="Caso técnico: com a gerência da agência"><Wrench size={11} /></span>}<span className="client-avatar">{record.name.trim().charAt(0).toUpperCase()}</span><span><strong>{record.name}{record.lastRating ? <em className="card-rating" title="Última avaliação da liderança"> ★ {record.lastRating}</em> : null}{record.noteCount > 0 ? <em className="card-notes" title="Cobranças e avaliações"> {record.noteCount}</em> : null}</strong><small>{record.reference} <i>·</i> {record.contact || "Sem contato informado"}</small></span></button></td>
        {showOwner && <td><span className={`owner-tag ${record.isMine ? "owner-mine" : ""}`}>{record.isMine ? "Você" : record.ownerName}</span></td>}
        <td className="muted-cell">{dateLabel(record.contactDate)}</td>
        <td><span className={`mini-tag ${record.hasCreditLimit === "yes" ? "tag-green" : record.hasCreditLimit === "no" ? "tag-amber" : "tag-gray"}`}><span className="tag-dot" />{limitLabel(record.hasCreditLimit)}</span>{record.interestedWithoutLimit && <small className="interest-note">Quer empréstimo</small>}</td>
        <td><span className={`sale-label sale-${record.saleStatus}`}>{record.saleStatus === "sold" ? <Check size={13} /> : record.saleStatus === "not_sold" ? <ArrowDownRight size={13} /> : <Clock3 size={13} />}{saleLabel(record.saleStatus)}</span></td>
        <td className="muted-cell">{record.lastProductSold || "—"}</td>
        <td><span className={`product-class-tag ${record.productClass ? `product-class-${record.productClass}` : record.lastProductSold ? "product-class-unclassified" : "product-class-empty"}`}>{record.lastProductSold ? productClassLabel(record.productClass) : "—"}</span></td>
        <td className="muted-cell">{objectionLabel(record.objection)}</td>
        <td><select aria-label={`Etapa de ${record.name}`} disabled={record.saleStatus === "sold" || !record.canEdit || locked} title={record.canEdit ? undefined : "Só quem registrou (ou a gerência, em caso técnico) pode mudar a etapa"} className={`stage-select stage-select-${PIPELINE_STAGES.find((x) => x.value === record.stage)?.color ?? "slate"}`} value={record.stage} onChange={(event) => onStageChange(record, event.target.value as ClientRecord["stage"])}>{PIPELINE_STAGES.map((stage) => <option key={stage.value} disabled={stage.value !== record.stage && Boolean(stageMoveProblem(record, stage.value))} value={stage.value}>{stageLabel(stage.value)}</option>)}</select></td>
        <td><div className="row-actions"><button type="button" title={record.canEdit ? "Editar atendimento" : "Ver atendimento"} aria-label={`${record.canEdit ? "Editar" : "Ver"} ${record.name}`} onClick={() => onEdit(record)}><MoreHorizontal size={17} /></button>{record.isMine && !locked && <button type="button" className="delete-action" title="Excluir atendimento" aria-label={`Excluir ${record.name}`} onClick={() => onDelete(record)}><X size={16} /></button>}</div></td>
      </tr>)}</tbody>
    </table></div>
  );
}

export default function Home() {
  const auth = useAuth();
  const [view, setView] = useState<View>("overview");
  const [period, setPeriod] = useState<Period>("30");
  const [search, setSearch] = useState("");
  const [limitFilter, setLimitFilter] = useState("all");
  const [saleFilter, setSaleFilter] = useState("all");
  const [bankFilter, setBankFilter] = useState("all");
  const [objectionFilter, setObjectionFilter] = useState("all");
  const [productClassFilter, setProductClassFilter] = useState<ProductClass | "unclassified" | "all">("all");
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
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<Scope>("mine");
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const utils = trpc.useUtils();
  const dialog = useAppDialog();
  const orgQuery = trpc.organization.me.useQuery(undefined, { enabled: Boolean(auth.user), retry: false });
  const companyRole = orgQuery.data?.membership?.role ?? null;
  const areaLabel = companyRole ? AREA_LABEL[companyRole] ?? null : null;
  const agencyViewLabel = companyRole === "admin" ? "Agências" : companyRole === "manager" ? "Minha agência" : companyRole === "leader" ? "Minha equipe" : null;
  const isSuperAdmin = Boolean(auth.user?.isSuperAdmin);
  const viewedBy = auth.user?.viewedBy ?? null;
  const readOnlyMode = Boolean(viewedBy);
  const navViews: View[] = useMemo(() => {
    const base = VIEWS_BY_ROLE[(companyRole ?? "independent") as keyof typeof VIEWS_BY_ROLE];
    return auth.user?.isSuperAdmin ? [...base, "admin", "bugs"] : base;
  }, [companyRole, auth.user?.isSuperAdmin]);
  const viewLabel = (item: View) =>
    item === "agencies" ? agencyViewLabel ?? "Agências"
    : item === "promotions" ? (companyRole === "manager" || companyRole === "admin" ? "Autorizações e promoções" : "Promoções")
    : item === "pipeline" && (companyRole === "manager" || companyRole === "leader") ? "Pipeline da " + (companyRole === "manager" ? "agência" : "equipe")
    : VIEW_LABEL[item];
  const brandingQuery = trpc.features.branding.useQuery(undefined, { enabled: Boolean(auth.user) && Boolean(companyRole), retry: false });
  const branding = companyRole ? brandingQuery.data ?? null : null;
  setBrandLabels(branding?.roleLabels, branding?.stageLabels);
  useEffect(() => { applyBrandColors(branding ? { primary: branding.primaryColor, dark: branding.darkColor, accent: branding.accentColor } : null); }, [branding?.primaryColor, branding?.darkColor, branding?.accentColor, Boolean(branding)]);
  const notificationsQuery = trpc.features.notifications.useQuery(undefined, { enabled: Boolean(auth.user), retry: false, refetchInterval: 60_000 });
  const promotionsQuery = trpc.features.promotions.useQuery(undefined, { enabled: Boolean(auth.user) && Boolean(companyRole) && companyRole !== "member", retry: false });
  const pendingPromotions = (promotionsQuery.data ?? []).filter((item) => item.canDecide).length;
  const bugsQuery = trpc.features.bugReports.useQuery(undefined, { enabled: Boolean(auth.user?.isSuperAdmin) && !auth.user?.viewedBy, retry: false });
  const newBugReports = (bugsQuery.data ?? []).filter((item) => item.status === "new").length;

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

  const monthKey = todayISO.slice(0, 7);
  const monthlyRecords = useMemo(() => records.filter((item) => item.contactDate.slice(0, 7) === monthKey), [records, monthKey]);
  // Monthly goals are personal, whatever the selected scope.
  const myMonthlyRecords = useMemo(() => myRecords.filter((item) => item.contactDate.slice(0, 7) === monthKey), [myRecords, monthKey]);
  const monthLabel = new Date(`${monthKey}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return currentPeriodRecords.filter((item) => {
      const matchesSearch = !query || [item.name, item.reference, item.contact ?? "", item.lastProductSold ?? "", item.lastProductSold ? productClassLabel(item.productClass) : ""].some((part) => part.toLocaleLowerCase("pt-BR").includes(query));
      return matchesSearch
        && (limitFilter === "all" || item.hasCreditLimit === limitFilter)
        && (saleFilter === "all" || item.saleStatus === saleFilter)
        && (bankFilter === "all" || item.isBankCustomer === bankFilter)
        && (objectionFilter === "all" || item.objection === objectionFilter)
        && (productClassFilter === "all" || (productClassFilter === "unclassified" ? Boolean(item.lastProductSold) && !item.productClass : item.productClass === productClassFilter))
        && (outcomeFilter === "all" || outcomeOf(item) === outcomeFilter);
    });
  }, [currentPeriodRecords, search, limitFilter, saleFilter, bankFilter, objectionFilter, productClassFilter, outcomeFilter]);
  const outcomeCounts = useMemo(() => {
    const counts: Record<Outcome, number> = { waiting: 0, success: 0, failed: 0, callback: 0 };
    currentPeriodRecords.forEach((item) => { counts[outcomeOf(item)] += 1; });
    return counts;
  }, [currentPeriodRecords]);
  // "Opa, não esqueça de ligar…": my open clients with no call scheduled for 3+ days.
  const reminders = useMemo(() => myRecords.filter((item) => needsCallReminder(item, todayISO)).sort((a, b) => a.contactDate.localeCompare(b.contactDate)), [myRecords, todayISO]);

  const sold = currentPeriodRecords.filter((item) => item.saleStatus === "sold").length;
  const noLimit = currentPeriodRecords.filter((item) => item.interestedWithoutLimit).length;
  const conversion = currentPeriodRecords.length ? Math.round((sold / currentPeriodRecords.length) * 100) : 0;
  const followUps = currentPeriodRecords.filter((item) => item.followUpDate && item.followUpDate >= todayISO).length;
  const dueFollowUpCount = myRecords.filter((item) => item.followUpDate && item.followUpDate <= todayISO).length + reminders.length;
  const objections = useMemo(() => {
    const counts = new Map<string, number>();
    currentPeriodRecords.filter((item) => item.saleStatus === "not_sold" && item.objection).forEach((item) => counts.set(item.objection!, (counts.get(item.objection!) ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [currentPeriodRecords]);
  const activeFilterCount = [limitFilter !== "all", saleFilter !== "all", bankFilter !== "all", objectionFilter !== "all", productClassFilter !== "all", Boolean(dateFrom), Boolean(dateTo)].filter(Boolean).length;

  const createMutation = trpc.clients.create.useMutation();
  const updateMutation = trpc.clients.update.useMutation();
  const deleteMutation = trpc.clients.delete.useMutation();
  const stageMutation = trpc.clients.updateStage.useMutation();
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
      if (record) openEdit(record); else toast.info("Esse atendimento não está mais disponível para você.");
    } else if (section && navViews.includes(section)) setView(section);
  };

  const snoozeReminder = async (record: ClientRecord) => {
    try {
      await snoozeMutation.mutateAsync({ id: record.id, until: addDaysISO(todayISO, REMINDER_DAYS) });
      await utils.clients.list.invalidate();
      toast.success(`Combinado: lembro de ${record.name} de novo em ${REMINDER_DAYS} dias.`);
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Não foi possível adiar o lembrete.");
    }
  };

  // Show the reminders once per visit, like a message: "Opa, não esqueça de ligar para Fulano".
  const remindersAnnounced = useRef(false);
  useEffect(() => {
    if (remindersAnnounced.current || clientQuery.isLoading || !reminders.length) return;
    remindersAnnounced.current = true;
    const [first] = reminders;
    toast(reminderText(first), {
      description: reminders.length > 1 ? `E mais ${reminders.length - 1} ${reminders.length === 2 ? "cliente" : "clientes"} esperando ligação. Veja no sino.` : "Ele está há 3 dias ou mais sem data de retorno marcada.",
      icon: <PhoneCall size={16} />,
      duration: 12_000,
      action: { label: "Abrir ficha", onClick: () => openEdit(first) },
    });
  }, [reminders, clientQuery.isLoading]);

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
    else { setRecordInUrl(null); toast.info("Esse atendimento não foi encontrado na sua conta."); }
  }, [clientQuery.isLoading, clientQuery.data]);

  const openAccountSettings = (tab: "profile" | "goals" | "security" = "profile") => { setAccountSettingsTab(tab); setAccountSettingsOpen(true); };
  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const setRecordInUrl = (id: number | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("atendimento", String(id)); else url.searchParams.delete("atendimento");
    window.history.replaceState(null, "", url.toString());
  };
  const openEdit = (record: ClientRecord) => { setEditing(record); setDialogOpen(true); setRecordInUrl(record.id); };
  const changeDialog = (open: boolean) => { setDialogOpen(open); if (!open) setRecordInUrl(null); };
  const go = (next: View) => { setView(next); setSidebarOpen(false); };
  useEffect(() => {
    if (!sidebarOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [sidebarOpen]);
  const saveClient = async (values: ClientFormValues) => {
    setSaving(true);
    const payload = {
      name: values.name.trim(),
      contact: values.contact.trim() || null,
      contactDate: values.contactDate,
      hasCreditLimit: values.hasCreditLimit,
      saleStatus: values.saleStatus,
      lastProductSold: values.lastProductSold.trim() || null,
      productClass: values.productClass || null,
      isBankCustomer: values.isBankCustomer,
      objection: values.objection || null,
      objectionNotes: values.objectionNotes.trim() || null,
      interestedWithoutLimit: values.interestedWithoutLimit,
      stage: values.saleStatus === "sold" ? "sold" as const : values.stage,
      followUpDate: values.followUpDate || null,
    };
    try {
      if (editing) await updateMutation.mutateAsync({ id: editing.id, ...payload });
      else await createMutation.mutateAsync(payload);
      await utils.clients.list.invalidate();
      toast.success(editing ? "Atendimento atualizado." : "Atendimento registrado.");
      changeDialog(false);
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const deleteClient = async (record: ClientRecord) => {
    if (!(await dialog.confirm({ title: `Excluir o atendimento de ${record.name}?`, description: `${record.reference} · Esta ação não pode ser desfeita.`, confirmLabel: "Excluir", danger: true }))) return;
    try {
      await deleteMutation.mutateAsync({ id: record.id });
      await utils.clients.list.invalidate();
      toast.success("Atendimento excluído.");
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Não foi possível excluir o atendimento.");
    }
  };

  const moveStage = async (record: ClientRecord, stage: ClientRecord["stage"]) => {
    const problem = stageMoveProblem(record, stage);
    if (problem) { toast.error(problem); return; }
    // Move the card right away; the server confirms (or the list is reloaded on error).
    utils.clients.list.setData(undefined, (current) => current?.map((item) => (item.id === record.id ? { ...item, stage } : item)));
    try {
      await stageMutation.mutateAsync({ id: record.id, stage });
      toast.success(stage === "technical" ? `${record.name} virou caso técnico: a gerência da agência foi responsabilizada.` : `${record.name} foi para ${stageLabel(stage)}.`);
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Não foi possível mudar a etapa.");
    } finally {
      await utils.clients.list.invalidate();
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
      return error instanceof Error && error.message ? error.message : "Não foi possível alterar a senha.";
    }
  };

  const logout = async () => {
    try { await auth.logout(); } catch { toast.error("Não foi possível sair."); }
  };

  const deleteAccount = async (password: string): Promise<string | null> => {
    try {
      await deleteAccountMutation.mutateAsync({ password });
    } catch (error) {
      return error instanceof Error && error.message ? error.message : "Não foi possível excluir a conta.";
    }
    setDeleteAccountOpen(false);
    toast.success("Sua conta foi excluída.");
    await logout();
    return null;
  };

  const exportCsv = () => {
    if (!filteredRecords.length) { toast.info("Não há registros para exportar."); return; }
    const rows = [
      ["Referencial", "Responsável", "Nome do cliente", "Contato", "Dia do contato", "Limite disponível", "Venda realizada", "Último produto vendido", "Classe do produto", "Cliente do banco", "Objeção", "Interesse sem limite", "Etapa", "Próximo contato"],
      ...filteredRecords.map((item) => [item.reference, item.isMine ? (profile.displayName || "Você") : item.ownerName, item.name, item.contact ?? "", item.contactDate, limitLabel(item.hasCreditLimit), saleLabel(item.saleStatus), item.lastProductSold ?? "", productClassLabel(item.productClass), bankLabel(item.isBankCustomer), objectionLabel(item.objection), item.interestedWithoutLimit ? "Sim" : "Não", stageLabel(item.stage), item.followUpDate ?? ""]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `valora-atendimentos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => { setSearch(""); setOutcomeFilter("all"); setLimitFilter("all"); setSaleFilter("all"); setBankFilter("all"); setObjectionFilter("all"); setProductClassFilter("all"); setDateFrom(""); setDateTo(""); };
  const greeting = profile.displayName.trim().split(/\s+/)[0] || "por aqui";
  const isRecordsView = view === "overview" || view === "clients";
  const showOwner = effectiveScope === "area";
  const scopeSwitch = areaLabel ? (
    <div className="scope-switch" role="group" aria-label="Quais atendimentos mostrar">
      <button type="button" className={effectiveScope === "mine" ? "active" : ""} aria-pressed={effectiveScope === "mine"} onClick={() => setScope("mine")}>Meus</button>
      <button type="button" className={effectiveScope === "area" ? "active" : ""} aria-pressed={effectiveScope === "area"} onClick={() => setScope("area")}>{areaLabel}</button>
    </div>
  ) : null;

  if (auth.loading) return <div className="auth-loading"><div className="loader-ring" /><span>Preparando seu espaço de atendimento…</span></div>;
  if (!auth.user) return <LoginScreen onLogin={auth.login} loggingIn={auth.loggingIn} />;

  return (
    <div className="app-shell">
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}
      <aside id="app-sidebar" className={`app-sidebar ${sidebarOpen ? "open" : ""}`} aria-hidden={!sidebarOpen} aria-label="Menu principal">
        <div className="sidebar-brand"><ValoraLogo variant="dark" /><button type="button" className="sidebar-close" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <div className="sidebar-label">ESPAÇO DE TRABALHO</div>
        <nav className="side-nav" aria-label="Navegação principal">
          {navViews.map((item) => {
            const Icon = VIEW_ICON[item];
            const count = item === "clients" ? myRecords.length : item === "agenda" ? dueFollowUpCount : item === "promotions" ? pendingPromotions : item === "bugs" ? newBugReports : null;
            return <button key={item} className={`nav-item ${view === item ? "active" : ""}`} onClick={() => go(item)}><Icon size={18} /><span>{viewLabel(item)}</span>{count ? <span className="nav-count">{count}</span> : null}{item === "pipeline" && <span className="nav-live" />}</button>;
          })}
        </nav>
        {!readOnlyMode && <div className="sidebar-tip"><div className="tip-spark"><Sparkles size={16} /></div><strong>Um próximo passo<br />de cada vez.</strong><p>Registre cada conversa para manter suas oportunidades em movimento.</p><button onClick={() => { setSidebarOpen(false); openNew(); }}>Registrar atendimento <ArrowRight size={13} /></button></div>}
        <div className="sidebar-bottom"><div className="privacy-line"><ShieldCheck size={14} /><span>Dados protegidos por conta</span></div><div className="sidebar-user"><button type="button" className="sidebar-profile-button" title="Configurações da conta" disabled={readOnlyMode} onClick={() => { setSidebarOpen(false); openAccountSettings("profile"); }}><span className="user-avatar">{profile.avatarDataUrl ? <img src={profile.avatarDataUrl} alt="" /> : (profile.displayName.trim().charAt(0).toLocaleUpperCase("pt-BR") || "V")}</span><span className="user-details"><strong>{profile.displayName || "Usuário Valora"}</strong><small>{profile.jobTitle || myRoleLabel}</small></span></button>{readOnlyMode
          ? <button className="logout-button" title="Voltar para a minha conta" aria-label="Voltar para a minha conta" onClick={() => stopViewAs()}><Undo2 size={16} /></button>
          : <button className="logout-button" title="Sair" aria-label="Sair da conta" onClick={() => void logout()}><LogOut size={16} /></button>}</div></div>
      </aside>
      <main className="main-area">
        {viewedBy && <div className="view-as-banner" role="status"><Eye size={16} /><span>Você está vendo o VALORA como <b>{profile.displayName || auth.user.name || auth.user.email}</b> ({myRoleLabel}) — somente leitura.</span><button type="button" onClick={() => stopViewAs()}><Undo2 size={14} />Voltar para a minha conta</button></div>}
        <header className="topbar"><div className="topbar-left"><div className="mobile-brand">{branding?.logoDataUrl ? <span className="company-brand"><img src={branding.logoDataUrl} alt="" /><strong>{branding.displayName || branding.companyName}</strong></span> : branding?.displayName ? <span className="company-brand"><strong>{branding.displayName}</strong></span> : <ValoraLogo compact />}</div><div className="breadcrumb"><span className="crumb-separator">/</span><strong>{viewLabel(view)}</strong></div></div><div className="topbar-right"><span className="today-chip"><CalendarDays size={14} />{new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}</span><span className="topbar-divider" /><ReminderBell reminders={reminders} notifications={notificationsQuery.data ?? []} today={todayISO} readOnly={readOnlyMode} onOpen={openEdit} onSnooze={(record) => void snoozeReminder(record)} onNotification={(item) => void openNotification(item)} onMarkAllRead={() => void markAllRead()} />{readOnlyMode
          ? <button type="button" className="button button-outline view-as-exit" onClick={() => stopViewAs()}><Undo2 size={14} />Voltar</button>
          : <AccountMenu profile={profile} roleLabel={myRoleLabel} email={auth.user.email ?? ""} onOpenProfile={() => openAccountSettings("profile")} onChangePassword={() => openAccountSettings("security")} onLogout={() => void logout()} onDeleteAccount={() => setDeleteAccountOpen(true)} onReportBug={() => setBugReportOpen(true)} />}<button type="button" className="section-menu-button menu-right" aria-expanded={sidebarOpen} aria-controls="app-sidebar" onClick={() => setSidebarOpen((current) => !current)} title="Abrir menu" aria-label="Abrir menu"><Menu size={17} /><span>Menu</span></button></div></header>

        <div className="page-content">
          <section className="welcome-row"><div><div className="eyebrow page-eyebrow"><span className="eyebrow-line" />{view === "team" ? "EMPRESA E EQUIPES" : view === "admin" || view === "bugs" ? "SUPER ADMINISTRADOR" : view === "agencies" ? "DESEMPENHO" : view === "promotions" ? "CARREIRA" : view === "customize" ? "IDENTIDADE" : "PAINEL DE VENDAS"}</div><h1>{view === "overview" ? <>Seu pipeline, <em>em movimento.</em></> : view === "clients" ? <>Atendimentos <em>registrados.</em></> : view === "agenda" ? <>Próximos <em>contatos.</em></> : view === "agencies" ? (companyRole === "leader" ? <>Sua <em>equipe.</em></> : <>{companyRole === "admin" ? "Suas" : "Sua"} <em>{companyRole === "admin" ? "agências." : "agência."}</em></>) : view === "promotions" ? <>Promoções e <em>autorizações.</em></> : view === "customize" ? <>Do jeito do <em>seu banco.</em></> : view === "bugs" ? <>Relatos de <em>erro.</em></> : view === "team" ? <>Sua <em>empresa.</em></> : view === "admin" ? <>Todos os <em>usuários.</em></> : <>Acompanhe cada <em>etapa.</em></>}</h1><p>{view === "overview" ? `Olá, ${greeting}. ${effectiveScope === "area" ? `Você está vendo: ${areaLabel?.toLowerCase()}.` : "Veja como estão suas oportunidades de crédito."}` : view === "clients" ? "Consulte, atualize e organize os contatos da sua carteira." : view === "agenda" ? "Saiba para quem ligar hoje, recupere os retornos atrasados e organize os próximos 7, 15 ou 30 dias." : view === "agencies" ? (companyRole === "admin" ? "Clique numa agência para ver o rendimento dela, das equipes e de cada funcionário." : companyRole === "manager" ? "Rendimento da sua agência, das equipes e de cada funcionário. Acompanhe os atendimentos no Pipeline da agência." : "Rendimento da sua equipe e de cada pessoa. Peça promoções por aqui.") : view === "promotions" ? "Pedidos de promoção: o líder pede, o gerente aprova e a administração dá a palavra final." : view === "customize" ? "Nome, logo, cores, nomes dos perfis, etapas e cargos da sua empresa." : view === "bugs" ? "Problemas e sugestões enviados pelas pessoas que usam o app." : view === "team" ? "Trabalhe sozinho ou com sua equipe: agências, equipes, perfis e convites." : view === "admin" ? "Contas de todas as empresas e de quem trabalha de forma independente." : "Organize os clientes pelo momento atual do atendimento."}</p></div>{RECORD_VIEWS.includes(view) && !readOnlyMode && <button className="button button-primary new-client-button" onClick={openNew}><Plus size={17} />Novo atendimento</button>}</section>

          {clientQuery.isError && <div className="notice notice-error"><CircleDollarSign size={18} /><span>Não foi possível carregar seus registros. Verifique a conexão e tente novamente.</span><button onClick={() => void clientQuery.refetch()}>Tentar novamente</button></div>}

          {isRecordsView && <>
            <div className="section-toolbar"><div className="section-title-wrap"><h2>{view === "overview" ? "Visão do período" : "Todos os atendimentos"}</h2><span className="soft-count">{currentPeriodRecords.length} {currentPeriodRecords.length === 1 ? "registro" : "registros"}</span></div><div className="toolbar-controls">{scopeSwitch}<label className="period-select"><CalendarDays size={15} /><select aria-label="Período dos indicadores" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>{Object.entries(periodLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={14} /></label><button className="button button-outline export-button" onClick={exportCsv}><ArrowDownToLine size={15} /><span>Exportar</span></button></div></div>
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
              <StatCard icon={Users} label="Clientes atendidos" value={String(currentPeriodRecords.length)} note="Conversas registradas" tone="blue" />
              <StatCard icon={BadgeCheck} label="Vendas realizadas" value={String(sold)} note={`${moneylessPercent(sold, currentPeriodRecords.length)} dos atendimentos`} tone="teal" progress={conversion} />
              <StatCard icon={TrendingUp} label="Taxa de conversão" value={`${conversion}%`} note="Vendas sobre atendimentos" tone="violet" />
              <StatCard icon={CircleDollarSign} label="Interesse sem limite" value={String(noLimit)} note="Querem o empréstimo; sem limite" tone="amber" />
            </section>}
            {view === "overview" && <MonthlyGoals monthLabel={monthLabel} contacts={myMonthlyRecords.length} sales={myMonthlyRecords.filter((item) => item.saleStatus === "sold").length} goals={goals} loading={goalQuery.isLoading} onEditGoals={() => openAccountSettings("goals")} />}
          </>}

          {view === "overview" && <section className="insights-grid">
            <article className="panel funnel-panel"><div className="panel-heading"><div><h2>Movimento do pipeline</h2><p>Atendimentos por etapa</p></div><button className="text-action" onClick={() => setView("pipeline")}>Ver funil <ArrowRight size={14} /></button></div>
              <div className="stage-summary">{PIPELINE_STAGES.map((stage) => { const count = currentPeriodRecords.filter((item) => item.stage === stage.value).length; const width = currentPeriodRecords.length ? Math.max(count / currentPeriodRecords.length * 100, count ? 5 : 0) : 0; return <div className="stage-summary-row" key={stage.value}><div className="stage-summary-title"><span className={`stage-dot stage-${stage.color}`} /><span>{stageLabel(stage.value)}</span><strong>{count}</strong></div><div className="stage-track"><i className={`track-${stage.color}`} style={{ width: `${width}%` }} /></div></div>; })}</div>
              <div className="panel-footer-note"><span className="online-dot" />Os números acompanham os filtros de período.</div>
            </article>
            <article className="panel objections-panel"><div className="panel-heading"><div><h2>Principais objeções</h2><p>Motivos registrados sem fechamento</p></div><span className="objection-icon"><SlidersHorizontal size={16} /></span></div>
              {objections.length ? <div className="objection-list">{objections.map(([key, count], index) => { const total = currentPeriodRecords.filter((item) => item.saleStatus === "not_sold" && item.objection).length; const item = OBJECTIONS.find((option) => option.value === key); return <div className="objection-row" key={key}><span className={`objection-rank rank-${index + 1}`}>0{index + 1}</span><span className="objection-name">{item?.label ?? key}</span><div className="objection-track"><i style={{ width: `${Math.round((count / total) * 100)}%` }} /></div><strong>{count}</strong></div>; })}</div> : <div className="compact-empty"><div className="empty-small-icon"><SlidersHorizontal size={17} /></div><strong>Sem objeções registradas</strong><span>As objeções adicionadas aos atendimentos aparecerão aqui.</span></div>}
              <div className="objection-footer"><span><ArrowDownRight size={14} />{followUps} retornos programados</span><button onClick={() => setView("clients")}>Ver atendimentos <ArrowRight size={13} /></button></div>
            </article>
            <article className="panel product-mix-panel"><div className="panel-heading"><div><h2>Vendas por classe de produto</h2><p>Vendas registradas em {monthLabel}</p></div><span className="objection-icon"><Banknote size={16} /></span></div>
              <div className="product-mix-list">{PRODUCT_CLASSES.map((item) => {
                const count = monthlyRecords.filter((record) => record.saleStatus === "sold" && record.productClass === item.value).length;
                const total = monthlyRecords.filter((record) => record.saleStatus === "sold").length;
                return <button type="button" className="product-mix-row" key={item.value} onClick={() => { clearFilters(); setPeriod("all"); setProductClassFilter(item.value); setView("clients"); }}><span>{item.label}</span><span className="product-mix-track"><i style={{ width: `${total ? Math.round((count / total) * 100) : 0}%` }} /></span><strong>{count}</strong></button>;
              })}
                {monthlyRecords.some((record) => record.saleStatus === "sold" && !record.productClass) && <button type="button" className="product-mix-row product-mix-unclassified" onClick={() => { clearFilters(); setPeriod("all"); setProductClassFilter("unclassified"); setView("clients"); }}><span>Não classificado</span><span className="product-mix-track"><i style={{ width: `${Math.round((monthlyRecords.filter((record) => record.saleStatus === "sold" && !record.productClass).length / monthlyRecords.filter((record) => record.saleStatus === "sold").length) * 100)}%` }} /></span><strong>{monthlyRecords.filter((record) => record.saleStatus === "sold" && !record.productClass).length}</strong></button>}
              </div><div className="product-mix-footer">Selecione uma classe para filtrar a carteira.</div>
            </article>
          </section>}

          {view === "pipeline" && <section className="pipeline-section"><div className="pipeline-toolbar"><div><h2>Etapas do atendimento</h2><p>{currentPeriodRecords.length} clientes no período selecionado</p></div><div className="toolbar-controls">{scopeSwitch}<label className="period-select"><CalendarDays size={15} /><select aria-label="Período do pipeline" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>{Object.entries(periodLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={14} /></label></div></div><ClientPipeline records={currentPeriodRecords} onEdit={openEdit} onMove={(record, stage) => void moveStage(record, stage)} locked={readOnlyMode} /></section>}

          {view === "agencies" && agencyViewLabel && <AgencyPanel canPromote={!readOnlyMode && (companyRole === "leader" || companyRole === "manager" || companyRole === "admin")} myOpenId={auth.user.openId} />}

          {view === "promotions" && (companyRole === "admin" || companyRole === "manager" || companyRole === "leader") && <PromotionsPanel role={companyRole} />}

          {view === "customize" && companyRole === "admin" && <CustomizePanel />}

          {view === "bugs" && isSuperAdmin && <BugReportsPanel />}

          {view === "team" && <TeamPanel myOpenId={auth.user.openId} />}

          {view === "admin" && isSuperAdmin && <SuperAdminPanel myOpenId={auth.user.openId} />}

          {view === "agenda" && <FollowUpAgenda records={myRecords} today={todayISO} loading={clientQuery.isLoading} onEdit={openEdit} onNew={openNew} />}

          {isRecordsView && <section className="panel records-panel"><div className="records-heading"><div><div className="panel-heading-title"><h2>{view === "overview" ? "Atendimentos recentes" : "Sua carteira de clientes"}</h2>{view === "overview" && <span className="recent-badge">RECENTES</span>}</div><p>{view === "overview" ? "Acompanhe o histórico e atualize a próxima etapa." : "Use a busca e os filtros para encontrar um atendimento."}</p></div>{view === "overview" && <button className="text-action" onClick={() => setView("clients")}>Ver todos <ArrowRight size={14} /></button>}</div>
            <div className="filter-toolbar"><div className="search-box"><Search size={16} /><input aria-label="Buscar atendimento" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, referência ou contato…" />{search && <button title="Limpar busca" onClick={() => setSearch("")}><X size={14} /></button>}</div><button className={`filter-button ${showFilters || activeFilterCount ? "filter-active" : ""}`} onClick={() => setShowFilters((current) => !current)}><Filter size={15} />Filtros{activeFilterCount > 0 && <span>{activeFilterCount}</span>}</button></div>
            {showFilters && <div className="filter-panel">
              <label>Contato a partir de<input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPeriod("all"); }} /></label>
              <label>Contato até<input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPeriod("all"); }} /></label>
              <label>Limite<select value={limitFilter} onChange={(event) => setLimitFilter(event.target.value)}><option value="all">Todos</option><option value="yes">Tem limite</option><option value="no">Sem limite</option><option value="unknown">Não verificado</option></select></label>
              <label>Resultado<select value={saleFilter} onChange={(event) => setSaleFilter(event.target.value)}><option value="all">Todos</option><option value="sold">Venda realizada</option><option value="not_sold">Não fechou</option><option value="pending">Em andamento</option></select></label>
              <label>Vínculo bancário<select value={bankFilter} onChange={(event) => setBankFilter(event.target.value)}><option value="all">Todos</option><option value="yes">Já é cliente</option><option value="no">Ainda não é cliente</option><option value="unknown">Não informado</option></select></label>
              <label>Objeção<select value={objectionFilter} onChange={(event) => setObjectionFilter(event.target.value)}><option value="all">Todas</option>{OBJECTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label>Classe do produto<select value={productClassFilter} onChange={(event) => setProductClassFilter(event.target.value as ProductClass | "unclassified" | "all")}><option value="all">Todas as classes</option>{PRODUCT_CLASSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}<option value="unclassified">Não classificado</option></select></label>
              {activeFilterCount > 0 && <button className="clear-filters" onClick={clearFilters}><X size={13} />Limpar filtros</button>}
            </div>}
            {clientQuery.isLoading ? <div className="loading-table"><LoaderCircle className="spin" size={20} />Carregando atendimentos…</div> : <ClientTable records={view === "overview" ? filteredRecords.slice(0, 6) : filteredRecords} onEdit={openEdit} onDelete={deleteClient} onStageChange={(record, stage) => void moveStage(record, stage)} showOwner={showOwner} locked={readOnlyMode} />}
            {view === "overview" && filteredRecords.length > 6 && <button className="table-more" onClick={() => setView("clients")}>Ver os {filteredRecords.length - 6} atendimentos restantes <ArrowRight size={14} /></button>}
            <div className="table-bottom"><span>Exibindo {Math.min(filteredRecords.length, view === "overview" ? 6 : filteredRecords.length)} de {filteredRecords.length} registros</span><span>Última atualização automática</span></div>
          </section>}
          <footer className="page-footer"><span>VALORA <i>·</i> PIPELINE BANCÁRIO</span><span><ShieldCheck size={13} /> Seus dados ficam vinculados à sua conta</span></footer>
        </div>
      </main>
      <AccountSettingsDialog open={accountSettingsOpen} onOpenChange={setAccountSettingsOpen} initialTab={accountSettingsTab} profile={profile} profileLoading={profileQuery.isLoading} savingProfile={saveProfileMutation.isPending} goals={goals} goalsLoading={goalQuery.isLoading} savingGoals={saveGoalsMutation.isPending} monthLabel={monthLabel} onSaveProfile={saveProfile} onSaveGoals={saveGoals} email={auth.user.email ?? ""} changingPassword={changePasswordMutation.isPending} onChangePassword={changePassword} />
      <BugReportDialog open={bugReportOpen} onOpenChange={setBugReportOpen} signedIn />
      <DeleteAccountDialog open={deleteAccountOpen} onOpenChange={setDeleteAccountOpen} username={auth.user.email ?? ""} deleting={deleteAccountMutation.isPending} onConfirm={deleteAccount} />
      <ClientFormDialog open={dialogOpen} onOpenChange={changeDialog} initial={editing} onSubmit={saveClient} saving={saving} readOnly={readOnlyMode || Boolean(editing && !editing.canEdit)} ownerName={readOnlyMode && editing?.isMine ? (profile.displayName || auth.user.email || undefined) : editing?.ownerName} viewOnlyReason={readOnlyMode ? "Modo Ver como: somente leitura." : undefined} />
    </div>
  );
}