import { useState } from "react";
import { Bug, ChevronDown, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const CATEGORY_LABEL: Record<string, string> = { erro: "Erro", lentidao: "Lentidão", visual: "Visual", sugestao: "Sugestão", outro: "Outro" };
const STATUS_LABEL = { new: "Novo", in_progress: "Em análise", resolved: "Resolvido" } as const;

export default function BugReportsPanel() {
  const utils = trpc.useUtils();
  const query = trpc.features.bugReports.useQuery(undefined, { retry: false });
  const setStatus = trpc.features.setBugStatus.useMutation();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [expanded, setExpanded] = useState<number | null>(null);
  const items = (query.data ?? []).filter((item) => filter === "all" || item.status !== "resolved");

  const change = async (id: number, status: "new" | "in_progress" | "resolved") => {
    try { await setStatus.mutateAsync({ id, status }); await utils.features.bugReports.invalidate(); toast.success("Situação atualizada."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar."); }
  };

  return (
    <div className="team-page">
      <article className="panel team-panel">
        <div className="team-panel-heading">
          <span className="team-icon"><Bug size={18} /></span>
          <div><h2>Relatos de erro</h2><p>Problemas e sugestões enviados pelo menu da conta › Relatar erro.</p></div>
          <div className="view-mode" role="tablist" aria-label="Filtro">
            <button type="button" role="tab" aria-selected={filter === "open"} className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}>Abertos</button>
            <button type="button" role="tab" aria-selected={filter === "all"} className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todos</button>
          </div>
        </div>
        {query.isLoading ? <div className="loading-table"><LoaderCircle className="spin" size={20} />Carregando…</div>
          : items.length === 0 ? <p className="team-empty">Nenhum relato {filter === "open" ? "aberto" : "ainda"}.</p>
          : <ul className="bug-list">{items.map((item) => (
            <li key={item.id} className={`bug-item bug-${item.status}`}>
              <div className="bug-main">
                <span className="bug-meta"><b>#{item.id}</b><span className="mini-tag tag-gray">{CATEGORY_LABEL[item.category] ?? item.category}</span><span>{new Date(item.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span><span>{item.reporterName || item.email || "Sem identificação"}</span>{item.pageUrl && <code>{item.pageUrl}</code>}</span>
                <p>{item.description}</p>
                {item.technicalLog && <button type="button" className="link-button tech-toggle" onClick={() => setExpanded((current) => (current === item.id ? null : item.id))}><ChevronDown size={13} className={expanded === item.id ? "open" : ""} />Informações técnicas</button>}
                {expanded === item.id && <pre className="tech-preview">{item.technicalLog}{item.userAgent ? `\n\nNavegador: ${item.userAgent}` : ""}</pre>}
              </div>
              <select aria-label={`Situação do relato ${item.id}`} value={item.status} onChange={(event) => void change(item.id, event.target.value as keyof typeof STATUS_LABEL)}>
                {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </li>
          ))}</ul>}
      </article>
    </div>
  );
}
