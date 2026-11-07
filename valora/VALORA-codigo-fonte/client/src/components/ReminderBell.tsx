import { Bell, BellRing, CheckCheck, Clock3, Copy, Megaphone, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ClientRecord } from "@/lib/client-types";
import { clientLink, daysBetween } from "@/lib/followups";

export type AppNotification = { id: number; title: string; body: string | null; link: string | null; readAt: string | Date | null; createdAt: string | Date };

type Props = {
  reminders: ClientRecord[];
  notifications: AppNotification[];
  today: string;
  /** Days without a scheduled call before the reminder (Personalizar). */
  reminderDays: number;
  readOnly: boolean;
  onOpen: (record: ClientRecord) => void;
  onSnooze: (record: ClientRecord) => void;
  onNotification: (notification: AppNotification) => void;
  onMarkAllRead: () => void;
};

export function reminderText(record: ClientRecord) {
  return `Opa, não esqueça de ligar para ${record.name}!`;
}

const when = (value: string | Date) => {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 60 * 24) return `há ${Math.round(minutes / 60)} h`;
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

export default function ReminderBell({ reminders, notifications, today, reminderDays, readOnly, onOpen, onSnooze, onNotification, onMarkAllRead }: Props) {
  const unread = notifications.filter((item) => !item.readAt);
  const total = reminders.length + unread.length;

  const copy = async (record: ClientRecord) => {
    const text = `${reminderText(record)} ${clientLink(record.id)}`;
    try { await navigator.clipboard.writeText(text); toast.success("Lembrete copiado com o link do cliente."); } catch { toast.info(text, { description: "Não deu para copiar automaticamente. Selecione o texto acima e copie com Ctrl+C.", duration: 15_000 }); }
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={`reminder-bell ${total ? "has-reminders" : ""}`} title="Lembretes e avisos" aria-label={`${total} lembretes e avisos`}>
          {total ? <BellRing size={16} /> : <Bell size={16} />}
          {total > 0 && <b>{total > 9 ? "9+" : total}</b>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="reminder-menu">
        {notifications.length > 0 && <>
          <DropdownMenuLabel className="reminder-menu-header reminder-menu-row">
            <span><strong>Avisos</strong><small>Cobranças, avaliações e promoções.</small></span>
            {unread.length > 0 && !readOnly && <button type="button" className="link-button" onClick={onMarkAllRead}><CheckCheck size={13} />Marcar como lidos</button>}
          </DropdownMenuLabel>
          <ul className="reminder-list notice-list">
            {notifications.slice(0, 12).map((item) => (
              <li key={item.id} className={item.readAt ? "is-read" : ""}>
                <button type="button" className="reminder-main" onClick={() => onNotification(item)}>
                  <Megaphone size={15} />
                  <span><strong>{item.title}</strong>{item.body && <small className="notice-body">{item.body}</small>}<small>{when(item.createdAt)}</small></span>
                </button>
              </li>
            ))}
          </ul>
          <DropdownMenuSeparator />
        </>}
        <DropdownMenuLabel className="reminder-menu-header">
          <strong>Lembretes de retorno</strong>
          <small>Sem data de retorno marcada há {reminderDays} {reminderDays === 1 ? "dia" : "dias"} ou mais.</small>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {reminders.length === 0 ? (
          <p className="reminder-empty">Tudo em dia. Nenhum cliente esperando ligação.</p>
        ) : (
          <ul className="reminder-list">
            {reminders.map((record) => {
              const days = daysBetween(record.contactDate, today);
              return (
                <li key={record.id}>
                  <button type="button" className="reminder-main" onClick={() => onOpen(record)}>
                    <PhoneCall size={15} />
                    <span><strong>{reminderText(record)}</strong><small>Último contato há {days} {days === 1 ? "dia" : "dias"}{record.contact ? ` · ${record.contact}` : ""}</small></span>
                  </button>
                  <span className="reminder-actions">
                    <button type="button" onClick={() => onOpen(record)}>Abrir ficha</button>
                    {!readOnly && <button type="button" onClick={() => onSnooze(record)}><Clock3 size={12} />Lembrar em {reminderDays} {reminderDays === 1 ? "dia" : "dias"}</button>}
                    <button type="button" onClick={() => void copy(record)} title="Copiar lembrete com o link"><Copy size={12} /></button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
