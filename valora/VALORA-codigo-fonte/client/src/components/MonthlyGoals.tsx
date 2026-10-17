import { ArrowUpRight, Target } from "lucide-react";
import type { GoalSettings } from "@/lib/client-types";

type Props = {
  monthLabel: string;
  contacts: number;
  sales: number;
  goals: GoalSettings;
  loading: boolean;
  onEditGoals: () => void;
};

function GoalProgress({ title, actual, target, unit }: { title: string; actual: number; target: number; unit: string }) {
  const percent = Math.round((actual / target) * 100);
  const barWidth = Math.min(100, Math.max(0, percent));
  return (
    <div className="goal-progress-row">
      <div className="goal-progress-heading"><span>{title}</span><strong>{actual} <small>de {target} {unit}</small></strong></div>
      <div className="goal-progress-track" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(actual, target)}><i style={{ width: `${barWidth}%` }} /></div>
      <span className="goal-progress-percent">{percent}% da meta</span>
    </div>
  );
}

export default function MonthlyGoals({ monthLabel, contacts, sales, goals, loading, onEditGoals }: Props) {
  return (
    <section className="panel monthly-goals-panel" aria-labelledby="monthly-goals-title">
      <header className="monthly-goals-heading">
        <span className="monthly-goals-icon"><Target size={17} /></span>
        <div><h2 id="monthly-goals-title">Metas de {monthLabel}</h2><p>Seu ritmo neste mês-calendário</p></div>
        <button type="button" className="button button-outline goals-adjust-button" onClick={onEditGoals}><span>Ajustar metas</span><ArrowUpRight size={14} /></button>
      </header>
      {loading ? <div className="goals-loading">Carregando suas metas…</div> : <div className="goal-progress-grid">
        <GoalProgress title="Atendimentos" actual={contacts} target={goals.monthlyContactTarget} unit="contatos" />
        <GoalProgress title="Vendas fechadas" actual={sales} target={goals.monthlySaleTarget} unit="vendas" />
      </div>}
      <p className="goals-note">As metas iniciais são 100 atendimentos e 20 vendas. Ajuste os valores para o seu objetivo.</p>
    </section>
  );
}
