import { useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, CircleDollarSign, Clock3, Phone, Target } from "lucide-react";
import type { ClientRecord } from "@/lib/client-types";
import { cardFields, reasonLabel, stageName, useWorkspace } from "@/lib/workspace";
import { formatCustomValue } from "@shared/pipeline";
import { normalizePhoneContact } from "@/lib/contact-format";

type FollowUpRecord = ClientRecord & { followUpDate: string };
type GroupTone = "overdue" | "today" | "upcoming";
type Props = {
  records: ClientRecord[];
  today: string;
  loading: boolean;
  onEdit: (record: ClientRecord) => void;
  onNew: () => void;
};

type GroupProps = {
  title: string;
  description: string;
  icon: typeof Clock3;
  tone: GroupTone;
  records: FollowUpRecord[];
  onEdit: (record: ClientRecord) => void;
};

const localDateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});

const shiftDate = (value: string, offset: number) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

function FollowUpGroup({ title, description, icon: Icon, tone, records, onEdit }: GroupProps) {
  const { productOf } = useWorkspace();
  return (
    <section className={`agenda-group agenda-group-${tone}`}>
      <header className="agenda-group-heading">
        <span className={`agenda-group-icon agenda-icon-${tone}`}><Icon size={17} /></span>
        <div><h2>{title}</h2><p>{description}</p></div>
        <span className="agenda-group-count">{records.length}</span>
      </header>
      <div className="agenda-cards">
        {records.map((record) => {
          const contact = record.contact?.trim() ?? "";
          const phone = normalizePhoneContact(contact);
          const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
          const date = record.followUpDate;
          const product = productOf(record);
          const field = cardFields(product).find((item) => record.customFields[item.key]);
          return (
            <article className="agenda-card" key={record.id}>
              <div className="agenda-card-topline">
                <span className={`agenda-status agenda-status-${tone}`}>
                  {tone === "overdue" ? "Atrasado" : tone === "today" ? "Hoje" : "Próximo"}
                </span>
                <time dateTime={date}>{localDateLabel(date)}</time>
              </div>
              <div className="agenda-client-heading">
                <span className="agenda-client-avatar">{record.name.trim().charAt(0).toUpperCase()}</span>
                <div><h3>{record.name}</h3><span>{record.reference}</span></div>
              </div>
              <div className="agenda-contact-row">
                <span>{contact || "Sem contato informado"}</span>
                {phone !== null && <a href={`tel:${phone}`}><Phone size={13} /> Ligar</a>}
                {phone === null && isEmail && <a href={`mailto:${contact}`}>Enviar e-mail</a>}
              </div>
              <div className="agenda-meta-row">
                <span><Target size={13} />{stageName(product, record.stage)}</span>
                {field && <span><CircleDollarSign size={13} />{field.label}: {formatCustomValue(field, record.customFields[field.key])}</span>}
              </div>
              {record.objection && <p className="agenda-objection">Última objeção: {reasonLabel(product, record.objection)}</p>}
              <button type="button" className="agenda-edit-button" onClick={() => onEdit(record)}>
                Revisar ou reagendar <ArrowRight size={14} />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function FollowUpAgenda({ records, today, loading, onEdit, onNew }: Props) {
  const [horizonDays, setHorizonDays] = useState<7 | 15 | 30>(7);
  const scheduled = records
    .filter((record): record is FollowUpRecord => Boolean(record.followUpDate))
    .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate) || a.name.localeCompare(b.name, "pt-BR"));
  const overdue = scheduled.filter((record) => record.followUpDate < today);
  const dueToday = scheduled.filter((record) => record.followUpDate === today);
  const upcomingEnd = shiftDate(today, horizonDays);
  const upcoming = scheduled.filter((record) => record.followUpDate > today && record.followUpDate <= upcomingEnd);
  const pendingCount = overdue.length + dueToday.length;

  if (loading) return <div className="agenda-loading"><Clock3 size={18} />Carregando os próximos contatos…</div>;

  return (
    <section className="agenda-page" aria-labelledby="agenda-title">
      <div className="agenda-page-heading">
        <div><div className="eyebrow page-eyebrow"><span className="eyebrow-line" />AGENDA DE RETORNOS</div><h2 id="agenda-title">Próximos contatos</h2><p>Saiba para quem ligar hoje, recupere os retornos atrasados e organize os próximos dias.</p></div>
        <div className="agenda-header-controls">
          <div className="agenda-horizon" role="group" aria-label="Mostrar próximos contatos">
            {([7, 15, 30] as const).map((days) => <button type="button" key={days} aria-pressed={horizonDays === days} className={horizonDays === days ? "active" : ""} onClick={() => setHorizonDays(days)}>Próximos {days} dias</button>)}
          </div>
          <div className="agenda-today-chip"><CalendarDays size={15} />{localDateLabel(today)}</div>
        </div>
      </div>

      <div className="agenda-summary" aria-label="Resumo dos retornos">
        <article className="agenda-summary-card agenda-summary-overdue"><span><Clock3 size={16} />Atrasados</span><strong>{overdue.length}</strong><small>Precisam de retorno</small></article>
        <article className="agenda-summary-card agenda-summary-today"><span><CalendarDays size={16} />Para hoje</span><strong>{dueToday.length}</strong><small>Programados para hoje</small></article>
        <article className="agenda-summary-card agenda-summary-upcoming"><span><Target size={16} />Próximos {horizonDays} dias</span><strong>{upcoming.length}</strong><small>Retornos agendados</small></article>
      </div>

      {pendingCount === 0 && <div className="agenda-clear-state"><span><CheckCircle2 size={20} /></span><div><strong>Você está em dia com os retornos.</strong><p>Os contatos programados para hoje ou antes aparecerão aqui.</p></div></div>}
      {overdue.length > 0 && <FollowUpGroup title="Atrasados" description="Retornos com data anterior a hoje" icon={Clock3} tone="overdue" records={overdue} onEdit={onEdit} />}
      {dueToday.length > 0 && <FollowUpGroup title="Agendados para hoje" description="Clientes que precisam de contato nesta data" icon={CalendarDays} tone="today" records={dueToday} onEdit={onEdit} />}
      {upcoming.length > 0 && <FollowUpGroup title={`Próximos ${horizonDays} dias`} description="Planeje os retornos que estão chegando" icon={Target} tone="upcoming" records={upcoming} onEdit={onEdit} />}
      {scheduled.length === 0 && <div className="agenda-empty"><CalendarDays size={22} /><div><strong>Nenhum próximo contato agendado</strong><p>Abra um atendimento e preencha a data do próximo contato para ele aparecer nesta agenda.</p></div><button type="button" className="button button-primary" onClick={onNew}>Registrar atendimento <ArrowRight size={14} /></button></div>}
    </section>
  );
}
