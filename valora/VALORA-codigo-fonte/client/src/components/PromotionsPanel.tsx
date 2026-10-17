import { useState } from "react";
import { Award, Check, CircleSlash, Clock3, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import { useAppDialog } from "@/components/AppDialogs";
import { trpc } from "@/lib/trpc";
import { roleLabel } from "@/lib/branding";

type Filter = "pending" | "all";

const STATUS_LABEL = {
  pending_manager: "Com o gerente da agência",
  pending_admin: "Com a administração",
  approved: "Aprovada",
  rejected: "Recusada",
  cancelled: "Cancelada",
} as const;

const date = (value: string | Date | null) => (value ? new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "");

export default function PromotionsPanel({ role }: { role: "admin" | "manager" | "leader" }) {
  const utils = trpc.useUtils();
  const dialog = useAppDialog();
  const query = trpc.features.promotions.useQuery(undefined, { retry: false });
  const decide = trpc.features.decidePromotion.useMutation();
  const cancel = trpc.features.cancelPromotion.useMutation();
  const [filter, setFilter] = useState<Filter>("pending");
  const items = (query.data ?? []).filter((item) => filter === "all" || item.status === "pending_manager" || item.status === "pending_admin");
  const waitingForMe = (query.data ?? []).filter((item) => item.canDecide).length;

  const act = async (id: number, approve: boolean, name: string) => {
    const note = await dialog.askText({
      title: approve ? `Aprovar a promoção de ${name}?` : `Recusar a promoção de ${name}?`,
      label: approve ? "Observação (opcional)" : "Motivo da recusa",
      minLength: approve ? 0 : 3,
      confirmLabel: approve ? (role === "admin" ? "Aprovar e aplicar" : "Aprovar e enviar à administração") : "Recusar",
    });
    if (note === null) return;
    try {
      const result = await decide.mutateAsync({ id, approve, note: note || null });
      await Promise.all([utils.features.promotions.invalidate(), utils.organization.me.invalidate(), utils.organization.performance.invalidate()]);
      toast.success(result.status === "approved" ? `${name} foi promovido.` : result.status === "pending_admin" ? "Aprovado. O pedido foi para a administração." : "Pedido recusado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar a decisão.");
    }
  };

  const cancelRequest = async (id: number, name: string) => {
    if (!(await dialog.confirm({ title: `Cancelar o pedido de promoção de ${name}?`, confirmLabel: "Cancelar pedido", danger: true }))) return;
    try { await cancel.mutateAsync({ id }); await utils.features.promotions.invalidate(); toast.success("Pedido cancelado."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível cancelar."); }
  };

  return (
    <div className="team-page">
      <article className="panel team-panel">
        <div className="team-panel-heading">
          <span className="team-icon"><Award size={18} /></span>
          <div><h2>{role === "leader" ? "Pedidos de promoção da equipe" : "Autorizações e promoções"}</h2>
            <p>{role === "leader" ? "Peça promoções em Minha equipe › Funcionários. O pedido passa pelo gerente e depois pela administração." : role === "manager" ? "Avalie os pedidos dos líderes da sua agência. Aprovados seguem para a administração." : "Última etapa: ao aprovar, o cargo da pessoa muda na hora."}</p></div>
          <div className="view-mode" role="tablist" aria-label="Filtro">
            <button type="button" role="tab" aria-selected={filter === "pending"} className={filter === "pending" ? "active" : ""} onClick={() => setFilter("pending")}>Em andamento{waitingForMe ? ` (${waitingForMe} com você)` : ""}</button>
            <button type="button" role="tab" aria-selected={filter === "all"} className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Histórico</button>
          </div>
        </div>
        {query.isLoading ? <div className="loading-table"><LoaderCircle className="spin" size={20} />Carregando pedidos…</div>
          : items.length === 0 ? <p className="team-empty">{filter === "pending" ? "Nenhum pedido em andamento." : "Nenhum pedido ainda."}</p>
          : (
            <ul className="promotion-list">
              {items.map((item) => {
                const name = item.targetName ?? "Ex-membro";
                return (
                  <li key={item.id} className={`promotion-item status-${item.status} ${item.canDecide ? "is-mine" : ""}`}>
                    <div className="promotion-main">
                      <strong>{name}</strong>
                      <span className="promotion-path">{item.currentPositionName ?? (item.currentRole ? roleLabel(item.currentRole) : "—")} → <b>{item.toPositionName}</b>{item.toLevel ? ` (${roleLabel(item.toLevel)})` : ""}</span>
                      <small>{[item.agencyName, item.teamName].filter(Boolean).join(" › ")} · pedido por {item.requestedByName ?? "—"} em {date(item.createdAt)}</small>
                      <p className="promotion-reason">“{item.reason}”{item.raiseNote ? <><br /><b>Aumento proposto:</b> {item.raiseNote}</> : null}</p>
                      <ol className="promotion-steps">
                        <li className="done"><Check size={11} />Pedido</li>
                        <li className={item.managerAt ? (item.status === "rejected" && !item.adminAt ? "no" : "done") : item.status === "pending_manager" ? "now" : "skip"}>{item.status === "pending_manager" ? <Clock3 size={11} /> : <Check size={11} />}Gerência{item.managerName ? `: ${item.managerName}` : ""}{item.managerNote ? ` — “${item.managerNote}”` : ""}</li>
                        <li className={item.status === "approved" ? "done" : item.status === "pending_admin" ? "now" : item.adminAt ? "no" : ""}>{item.status === "pending_admin" ? <Clock3 size={11} /> : item.status === "approved" ? <Check size={11} /> : <CircleSlash size={11} />}Administração{item.adminName ? `: ${item.adminName}` : ""}{item.adminNote ? ` — “${item.adminNote}”` : ""}</li>
                      </ol>
                    </div>
                    <div className="promotion-side">
                      <span className={`promotion-status status-${item.status}`}>{STATUS_LABEL[item.status]}</span>
                      {item.canDecide && <div className="promotion-actions">
                        <button type="button" className="button button-primary" disabled={decide.isPending} onClick={() => void act(item.id, true, name)}><Check size={14} />Aprovar</button>
                        <button type="button" className="button button-ghost" disabled={decide.isPending} onClick={() => void act(item.id, false, name)}><X size={14} />Recusar</button>
                      </div>}
                      {item.canCancel && <button type="button" className="link-button" onClick={() => void cancelRequest(item.id, name)}>Cancelar pedido</button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
      </article>
    </div>
  );
}
