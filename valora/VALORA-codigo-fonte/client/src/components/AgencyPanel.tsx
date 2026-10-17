import { useMemo, useState, type FormEvent } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { ArrowLeft, Award, BadgeCheck, Building2, ChevronRight, LoaderCircle, ShieldCheck, Star, Target, Users, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { roleLabel } from "@/lib/branding";
import type { AppRouter } from "../../../server/routers";

type Performance = inferRouterOutputs<AppRouter>["organization"]["performance"];
type Person = Performance["people"][number];
type Mode = "agency" | "teams" | "people";

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
const pct = (part: number, whole: number) => (whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0);

function totals(people: Person[]) {
  const rated = people.filter((person) => person.averageRating !== null);
  return {
    ...people.reduce((sum, person) => ({
      served: sum.served + person.served, sold: sum.sold + person.sold, technical: sum.technical + person.technicalCases,
      contactTarget: sum.contactTarget + person.contactTarget, saleTarget: sum.saleTarget + person.saleTarget,
    }), { served: 0, sold: 0, technical: 0, contactTarget: 0, saleTarget: 0 }),
    rating: rated.length ? Math.round((rated.reduce((sum, person) => sum + (person.averageRating ?? 0), 0) / rated.length) * 10) / 10 : null,
  };
}

function Progress({ value, target, label }: { value: number; target: number; label: string }) {
  const percent = pct(value, target);
  return (
    <div className="perf-progress" aria-label={`${label}: ${value} de ${target}`}>
      <span><strong>{value}</strong><small>/ {target}</small></span>
      <i><b style={{ width: `${percent}%` }} className={percent >= 100 ? "done" : ""} /></i>
      <em>{percent}%</em>
    </div>
  );
}

function Rating({ value, count }: { value: number | null; count?: number }) {
  if (value === null) return <span className="muted-cell">—</span>;
  return <span className="rating-badge" title={count ? `${count} avaliações` : undefined}><Star size={12} />{value.toFixed(1)}</span>;
}

function SummaryCards({ people, monthLabel }: { people: Person[]; monthLabel: string }) {
  const sum = totals(people);
  return (
    <section className="stats-grid" aria-label="Resumo do mês">
      <article className="stat-card"><div className="stat-top"><span className="stat-icon blue"><Users size={18} /></span><span className="stat-period">{monthLabel}</span></div><p className="stat-label">Clientes atendidos</p><div className="stat-value-row"><strong>{sum.served}</strong><span className="stat-share">{pct(sum.served, sum.contactTarget)}% da meta</span></div><p className="stat-note">Meta somada: {sum.contactTarget}</p></article>
      <article className="stat-card"><div className="stat-top"><span className="stat-icon teal"><BadgeCheck size={18} /></span><span className="stat-period">{monthLabel}</span></div><p className="stat-label">Vendas realizadas</p><div className="stat-value-row"><strong>{sum.sold}</strong><span className="stat-share">{pct(sum.sold, sum.saleTarget)}% da meta</span></div><p className="stat-note">Conversão: {pct(sum.sold, sum.served)}%</p></article>
      <article className="stat-card"><div className="stat-top"><span className="stat-icon violet"><Star size={18} /></span></div><p className="stat-label">Avaliação média</p><div className="stat-value-row"><strong>{sum.rating === null ? "—" : sum.rating.toFixed(1)}</strong></div><p className="stat-note">Notas dadas por líderes e gerentes</p></article>
      <article className="stat-card"><div className="stat-top"><span className="stat-icon amber"><Wrench size={18} /></span></div><p className="stat-label">Casos técnicos</p><div className="stat-value-row"><strong>{sum.technical}</strong></div><p className="stat-note">Em aberto com a gerência</p></article>
    </section>
  );
}

function PromotionDialog({ person, onClose }: { person: Person | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const branding = trpc.features.branding.useQuery(undefined, { retry: false });
  const request = trpc.features.requestPromotion.useMutation();
  const [positionId, setPositionId] = useState("");
  const [reason, setReason] = useState("");
  const [raise, setRaise] = useState("");
  const positions = (branding.data?.positions ?? []).filter((position) => position.level !== "admin");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!person) return;
    try {
      const result = await request.mutateAsync({ targetOpenId: person.openId, toPositionId: Number(positionId), reason, raiseNote: raise.trim() || null });
      await utils.features.promotions.invalidate();
      toast.success(result.status === "pending_manager" ? "Pedido enviado ao gerente da agência." : "Pedido enviado à administração.");
      setPositionId(""); setReason(""); setRaise("");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o pedido.");
    }
  };

  return (
    <Dialog open={Boolean(person)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="client-dialog app-dialog">
        <DialogHeader className="dialog-heading">
          <div className="dialog-icon"><Award size={18} /></div>
          <div><DialogTitle>Pedir promoção de {person?.name}</DialogTitle><DialogDescription>O pedido passa pelo gerente da agência e depois pela administração.</DialogDescription></div>
        </DialogHeader>
        {positions.length === 0 ? <p className="account-settings-note">A empresa ainda não cadastrou cargos. Peça ao administrador para criá-los em Personalizar.</p> : (
          <form className="client-form" onSubmit={(event) => void submit(event)}>
            <label className="field"><span>Novo cargo</span><select required value={positionId} onChange={(event) => setPositionId(event.target.value)}><option value="">Escolha o cargo</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.name} ({roleLabel(position.level)})</option>)}</select></label>
            <label className="field"><span>Motivo</span><textarea required minLength={10} maxLength={1000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: bateu a meta de vendas 3 meses seguidos e ajuda a equipe" /></label>
            <label className="field"><span>Aumento proposto <small>(opcional)</small></span><input maxLength={200} value={raise} onChange={(event) => setRaise(event.target.value)} placeholder="Ex.: 10% ou nova faixa salarial" /></label>
            <div className="form-actions"><button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary" disabled={request.isPending || !positionId || reason.trim().length < 10}>{request.isPending ? "Enviando…" : "Enviar pedido"}</button></div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PeopleTable({ people, teams, canPromote, onPromote, myOpenId }: { people: Person[]; teams: Performance["teams"]; canPromote: boolean; onPromote: (person: Person) => void; myOpenId?: string }) {
  const teamName = (id: number | null) => teams.find((team) => team.id === id)?.name ?? "—";
  const order = { manager: 0, leader: 1, member: 2, admin: 3 } as const;
  const sorted = [...people].sort((a, b) => order[a.role] - order[b.role] || teamName(a.teamId).localeCompare(teamName(b.teamId), "pt-BR") || a.name.localeCompare(b.name, "pt-BR"));
  if (!sorted.length) return <p className="team-empty agency-perf-empty">Ninguém aqui ainda.</p>;
  return (
    <div className="table-scroll"><table className="clients-table perf-table">
      <thead><tr><th>Funcionário</th><th>Cargo</th><th>Equipe</th><th>Clientes atendidos</th><th>Vendas realizadas</th><th>Conversão</th><th>Avaliação</th><th>Casos técnicos</th>{canPromote && <th><span className="sr-only">Ações</span></th>}</tr></thead>
      <tbody>{sorted.map((person) => (
        <tr key={person.openId}>
          <td><div className="member-name"><span className="client-avatar">{person.name.charAt(0).toUpperCase()}</span><span><strong>{person.name}</strong></span></div></td>
          <td><span className={`role-badge role-${person.role}`}>{person.positionName ?? roleLabel(person.role)}</span></td>
          <td className="muted-cell">{person.role === "manager" ? "Agência toda" : teamName(person.teamId)}</td>
          <td><Progress value={person.served} target={person.contactTarget} label="Clientes atendidos" /></td>
          <td><Progress value={person.sold} target={person.saleTarget} label="Vendas" /></td>
          <td className="muted-cell">{pct(person.sold, person.served)}%</td>
          <td><Rating value={person.averageRating} count={person.ratingCount} /></td>
          <td>{person.technicalCases ? <span className="mini-tag tag-amber"><Wrench size={11} />{person.technicalCases}</span> : <span className="muted-cell">—</span>}</td>
          {canPromote && <td>{person.role !== "admin" && person.openId !== myOpenId && <button type="button" className="button button-outline promote-button" onClick={() => onPromote(person)}><Award size={13} />Pedir promoção</button>}</td>}
        </tr>
      ))}</tbody>
    </table></div>
  );
}

function TeamsTable({ people, teams }: { people: Person[]; teams: Performance["teams"] }) {
  const rows = [
    ...teams.map((team) => ({ key: `t${team.id}`, name: team.name, people: people.filter((person) => person.teamId === team.id) })),
    ...(people.some((person) => person.teamId === null && person.role !== "manager" && person.role !== "admin") ? [{ key: "none", name: "Sem equipe", people: people.filter((person) => person.teamId === null && person.role !== "manager" && person.role !== "admin") }] : []),
  ];
  if (!rows.length) return <p className="team-empty agency-perf-empty">Nenhuma equipe nesta agência.</p>;
  return (
    <div className="table-scroll"><table className="clients-table perf-table">
      <thead><tr><th>Equipe</th><th>Líder</th><th>Pessoas</th><th>Clientes atendidos</th><th>Vendas realizadas</th><th>Conversão</th><th>Avaliação</th><th>Casos técnicos</th></tr></thead>
      <tbody>{rows.map((row) => {
        const sum = totals(row.people);
        const leaders = row.people.filter((person) => person.role === "leader").map((person) => person.name).join(", ");
        return (
          <tr key={row.key}>
            <td><div className="member-name"><span className="client-avatar"><Users size={13} /></span><span><strong>{row.name}</strong></span></div></td>
            <td className="muted-cell">{leaders || "Sem líder"}</td>
            <td className="muted-cell">{row.people.length}</td>
            <td><Progress value={sum.served} target={sum.contactTarget} label="Clientes atendidos" /></td>
            <td><Progress value={sum.sold} target={sum.saleTarget} label="Vendas" /></td>
            <td className="muted-cell">{pct(sum.sold, sum.served)}%</td>
            <td><Rating value={sum.rating} /></td>
            <td>{sum.technical ? <span className="mini-tag tag-amber"><Wrench size={11} />{sum.technical}</span> : <span className="muted-cell">—</span>}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}

function AgencyDetail({ title, people, teams, monthLabel, allowTeams, canPromote, onBack, myOpenId }: { title: string; people: Person[]; teams: Performance["teams"]; monthLabel: string; allowTeams: boolean; canPromote: boolean; onBack?: () => void; myOpenId?: string }) {
  const [mode, setMode] = useState<Mode>(allowTeams ? "agency" : "people");
  const [promoting, setPromoting] = useState<Person | null>(null);
  const managers = people.filter((person) => person.role === "manager").map((person) => person.name);
  const modes: { value: Mode; label: string }[] = allowTeams
    ? [{ value: "agency", label: "Agência" }, { value: "teams", label: "Equipes" }, { value: "people", label: "Funcionários" }]
    : [{ value: "agency", label: "Equipe" }, { value: "people", label: "Funcionários" }];
  return (
    <div className="team-page">
      <article className="panel team-panel agency-detail-head">
        <div className="team-panel-heading">
          {onBack && <button type="button" className="icon-back" onClick={onBack} aria-label="Voltar para a lista de agências"><ArrowLeft size={16} /></button>}
          <span className="team-icon"><Building2 size={18} /></span>
          <div><h2>{title}</h2><p>{people.length} {people.length === 1 ? "pessoa" : "pessoas"}{allowTeams ? ` · ${teams.length} ${teams.length === 1 ? "equipe" : "equipes"} · Gerência: ${managers.join(", ") || "sem gerente"}` : ""}</p></div>
          <div className="view-mode" role="tablist" aria-label="Modo de visualização">
            {modes.map((item) => <button key={item.value} type="button" role="tab" aria-selected={mode === item.value} className={mode === item.value ? "active" : ""} onClick={() => setMode(item.value)}>{item.label}</button>)}
          </div>
        </div>
      </article>
      <SummaryCards people={people.filter((person) => person.role !== "admin")} monthLabel={monthLabel} />
      {mode === "agency" && (
        <article className="panel team-panel">
          <div className="team-panel-heading"><span className="team-icon"><Target size={17} /></span><div><h2>Rendimento {allowTeams ? "da agência" : "da equipe"}</h2><p>Metas somadas de todos e quanto já foi alcançado em {monthLabel}.</p></div></div>
          {(() => { const sum = totals(people.filter((person) => person.role !== "admin")); return (
            <div className="agency-goal-bars">
              <div><span>Clientes atendidos</span><Progress value={sum.served} target={sum.contactTarget} label="Clientes atendidos" /></div>
              <div><span>Vendas realizadas</span><Progress value={sum.sold} target={sum.saleTarget} label="Vendas" /></div>
            </div>
          ); })()}
          <p className="team-hint">Use os modos <b>{allowTeams ? "Equipes" : "Funcionários"}</b> para ver o rendimento em detalhe.</p>
        </article>
      )}
      {mode === "teams" && <article className="panel agency-perf"><TeamsTable people={people} teams={teams} /></article>}
      {mode === "people" && <article className="panel agency-perf"><PeopleTable people={people} teams={teams} canPromote={canPromote} onPromote={setPromoting} myOpenId={myOpenId} /></article>}
      <PromotionDialog person={promoting} onClose={() => setPromoting(null)} />
    </div>
  );
}

export default function AgencyPanel({ canPromote, myOpenId }: { canPromote: boolean; myOpenId?: string }) {
  const [month, setMonth] = useState(currentMonth);
  const [openAgency, setOpenAgency] = useState<string | null>(null);
  const query = trpc.organization.performance.useQuery({ month }, { retry: false });
  const data = query.data;
  const monthLabel = new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const groups = useMemo(() => {
    if (!data) return [];
    const list = data.agencies.map((agency) => ({ key: `a${agency.id}`, agencyId: agency.id, title: agency.name, people: data.people.filter((person) => person.agencyId === agency.id) }));
    const withoutAgency = data.people.filter((person) => person.agencyId === null && person.role !== "admin");
    if (data.scope === "company" && withoutAgency.length) list.push({ key: "none", agencyId: -1, title: "Sem agência", people: withoutAgency });
    return list;
  }, [data]);

  const monthPicker = <label className="period-select"><Target size={15} /><input type="month" aria-label="Mês do painel" value={month} max={currentMonth()} onChange={(event) => event.target.value && setMonth(event.target.value)} /></label>;

  if (query.isLoading) return <div className="loading-table"><LoaderCircle className="spin" size={20} />Carregando o painel…</div>;
  if (query.isError || !data) return <div className="notice notice-error"><span>{query.error?.message ?? "Não foi possível carregar o painel."}</span><button onClick={() => void query.refetch()}>Tentar novamente</button></div>;

  const privacy = <div className="team-note perf-privacy"><ShieldCheck size={15} /><span>Este painel mostra só números (metas, atendimentos, vendas, avaliações e casos técnicos). Nomes, contatos e detalhes dos clientes não aparecem aqui.</span></div>;
  const toolbar = (title: string) => <div className="section-toolbar"><div className="section-title-wrap"><h2>{title}</h2><span className="soft-count">{monthLabel}</span></div><div className="toolbar-controls">{monthPicker}</div></div>;

  // Manager → their agency; leader → their team. Straight to the detail.
  if (data.scope !== "company") {
    const title = data.scope === "agency" ? data.agencies[0]?.name ?? "Minha agência" : data.teams[0]?.name ?? "Minha equipe";
    return <div className="team-page">{toolbar(data.scope === "agency" ? "Minha agência" : "Minha equipe")}{privacy}<AgencyDetail title={title} people={data.people} teams={data.teams} monthLabel={monthLabel} allowTeams={data.scope === "agency"} canPromote={canPromote} myOpenId={myOpenId} /></div>;
  }

  const selected = groups.find((group) => group.key === openAgency);
  if (selected) {
    return <div className="team-page">{toolbar(`Agências de ${data.company.name}`)}{privacy}<AgencyDetail title={selected.title} people={selected.people} teams={data.teams.filter((team) => team.agencyId === selected.agencyId)} monthLabel={monthLabel} allowTeams canPromote={canPromote} myOpenId={myOpenId} onBack={() => setOpenAgency(null)} /></div>;
  }

  return (
    <div className="team-page">
      {toolbar(`Agências de ${data.company.name}`)}
      {privacy}
      <SummaryCards people={data.people.filter((person) => person.role !== "admin")} monthLabel={monthLabel} />
      {groups.length === 0 && <p className="team-empty">Nenhuma agência cadastrada. Crie agências em Minha empresa.</p>}
      <div className="agency-grid">
        {groups.map((group) => {
          const sum = totals(group.people);
          const managers = group.people.filter((person) => person.role === "manager").map((person) => person.name);
          const teamCount = data.teams.filter((team) => team.agencyId === group.agencyId).length;
          return (
            <button type="button" key={group.key} className="panel agency-tile" onClick={() => setOpenAgency(group.key)}>
              <span className="agency-tile-head"><span className="team-icon"><Building2 size={17} /></span><span><strong>{group.title}</strong><small>{group.people.length} pessoas · {teamCount} {teamCount === 1 ? "equipe" : "equipes"}</small></span><ChevronRight size={18} /></span>
              <span className="agency-tile-manager">Gerência: {managers.join(", ") || "sem gerente"}</span>
              <span className="agency-tile-bars">
                <span><small>Atendidos</small><Progress value={sum.served} target={sum.contactTarget} label="Atendidos" /></span>
                <span><small>Vendas</small><Progress value={sum.sold} target={sum.saleTarget} label="Vendas" /></span>
              </span>
              <span className="agency-tile-foot"><span><Star size={12} />{sum.rating === null ? "Sem avaliações" : `Avaliação ${sum.rating.toFixed(1)}`}</span><span><Wrench size={12} />{sum.technical} casos técnicos</span></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
