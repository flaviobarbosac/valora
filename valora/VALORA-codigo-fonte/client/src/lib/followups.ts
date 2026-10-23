import type { ClientRecord } from "@/lib/client-types";

/** Reasons that mean "the client is undecided, call again" when the product does not say (see ReasonDef.callback). */
export const UNDECIDED_OBJECTIONS = ["thinking", "later", "vai_pensar", "retornar"] as const;
const defaultIsCallback = (key: string) => (UNDECIDED_OBJECTIONS as readonly string[]).includes(key);

export type Outcome = "waiting" | "success" | "failed" | "callback";

export const OUTCOMES: { value: Outcome; label: string; note: string; tone: string }[] = [
  { value: "waiting", label: "Esperando retorno", note: "Atendimentos em andamento", tone: "blue" },
  { value: "success", label: "Retorno com sucesso", note: "Negócio fechado", tone: "teal" },
  { value: "failed", label: "Retorno falho", note: "Não fechou", tone: "rose" },
  { value: "callback", label: "Deve retornar de novo", note: "Cliente indeciso (vai pensar)", tone: "amber" },
];

export function outcomeOf(record: Pick<ClientRecord, "saleStatus" | "objection">, isCallback: (key: string) => boolean = defaultIsCallback): Outcome {
  if (record.saleStatus === "sold") return "success";
  if (record.objection && isCallback(record.objection)) return "callback";
  if (record.saleStatus === "not_sold") return "failed";
  return "waiting";
}

/** Days without a scheduled call before the app reminds the owner (changeable in Personalizar). */
export const REMINDER_DAYS = 3;

export function addDaysISO(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function daysBetween(fromISO: string, toISO: string) {
  return Math.round((new Date(`${toISO}T12:00:00`).getTime() - new Date(`${fromISO}T12:00:00`).getTime()) / 86_400_000);
}

/**
 * A call reminder is due when one of *my* clients is still open (waiting or
 * undecided), has no next-contact date, and the last contact was at least
 * `days` days ago — unless "Lembrar depois" pushed it further. 0 days = off.
 */
export function needsCallReminder(record: ClientRecord, todayISO: string, days = REMINDER_DAYS, isCallback: (key: string) => boolean = defaultIsCallback) {
  if (!days || !record.isMine || record.followUpDate) return false;
  const outcome = outcomeOf(record, isCallback);
  if (outcome !== "waiting" && outcome !== "callback") return false;
  const dueOn = addDaysISO(record.contactDate, days);
  const quietUntil = record.remindAfter && record.remindAfter > dueOn ? record.remindAfter : dueOn;
  return todayISO >= quietUntil;
}

export function clientLink(recordId: number) {
  return `${window.location.origin}/?atendimento=${recordId}`;
}
