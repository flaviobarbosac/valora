import { useState, type DragEvent } from "react";
import { ArrowRight, CalendarClock, CircleDollarSign, GripVertical, MessageSquare, UserRound, Wrench } from "lucide-react";
import { PIPELINE_STAGES, stageLabel, type ClientRecord, type PipelineStage } from "@/lib/client-types";

type Props = {
  records: ClientRecord[];
  onEdit: (record: ClientRecord) => void;
  /** Called when a card is dropped on another column. */
  onMove: (record: ClientRecord, stage: PipelineStage) => void;
  /** "Ver como": nothing can be dragged. */
  locked?: boolean;
};

/** Same rules the server enforces, so impossible drops are refused before they are sent. */
export function stageMoveProblem(record: ClientRecord, stage: PipelineStage): string | null {
  if (stage === record.stage) return null;
  if (record.saleStatus === "sold") return "Venda realizada fica na etapa Venda realizada. Mude o resultado na ficha para tirá-la daqui.";
  if (stage === "sold") return "Só vai para Venda realizada depois de marcar a venda como fechada na ficha.";
  if (stage === "lost" && record.saleStatus !== "not_sold") return "Para Não fechou, marque o resultado \"Não fechou\" e a objeção na ficha.";
  if (stage === "technical" && record.saleStatus !== "pending") return "Caso técnico vale só para atendimentos em andamento.";
  if (record.saleStatus === "not_sold" && stage !== "lost") return "Atendimento que não fechou fica em Não fechou. Mude o resultado na ficha para reabrir.";
  return null;
}

export default function ClientPipeline({ records, onEdit, onMove, locked = false }: Props) {
  const [dragging, setDragging] = useState<ClientRecord | null>(null);
  const [overStage, setOverStage] = useState<PipelineStage | null>(null);

  const canDrag = (record: ClientRecord) => !locked && record.canEdit && record.saleStatus !== "sold";

  const startDrag = (event: DragEvent<HTMLButtonElement>, record: ClientRecord) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(record.id));
    setDragging(record);
  };
  const endDrag = () => { setDragging(null); setOverStage(null); };

  const drop = (event: DragEvent<HTMLElement>, stage: PipelineStage) => {
    event.preventDefault();
    const record = dragging ?? records.find((item) => String(item.id) === event.dataTransfer.getData("text/plain"));
    endDrag();
    if (record && record.stage !== stage) onMove(record, stage);
  };

  return (
    <div className={`pipeline-board ${dragging ? "is-dragging" : ""}`}>
      {PIPELINE_STAGES.map((stage) => {
        const cards = records.filter((record) => record.stage === stage.value);
        const problem = dragging ? stageMoveProblem(dragging, stage.value) : null;
        const dropClass = !dragging || dragging.stage === stage.value ? "" : problem ? "drop-blocked" : overStage === stage.value ? "drop-over" : "drop-ok";
        return (
          <section
            className={`pipeline-column pipeline-column-${stage.value} ${dropClass}`}
            key={stage.value}
            onDragOver={(event) => { if (dragging && !problem) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setOverStage(stage.value); } }}
            onDragLeave={() => setOverStage((current) => (current === stage.value ? null : current))}
            onDrop={(event) => drop(event, stage.value)}
            title={problem ?? undefined}
            aria-label={`Etapa ${stageLabel(stage.value)}`}
          >
            <header className="pipeline-column-head">
              <span className={`stage-dot stage-${stage.color}`} />
              <h3>{stageLabel(stage.value)}</h3>
              <span className="column-count">{cards.length}</span>
            </header>
            {stage.value === "technical" && <p className="pipeline-column-note"><Wrench size={11} />A gerência da agência assume</p>}
            <div className="pipeline-cards">
              {cards.length === 0 ? <div className="pipeline-empty">{dragging && !problem && dragging.stage !== stage.value ? "Solte aqui" : "Nenhum atendimento"}</div> : cards.map((record) => (
                <button
                  className={`pipeline-card ${canDrag(record) ? "is-draggable" : ""} ${dragging?.id === record.id ? "is-dragged" : ""}`}
                  type="button"
                  key={record.id}
                  draggable={canDrag(record)}
                  onDragStart={(event) => startDrag(event, record)}
                  onDragEnd={endDrag}
                  onClick={() => onEdit(record)}
                  title={canDrag(record) ? "Arraste para mudar de etapa, ou clique para abrir" : "Clique para abrir"}
                >
                  <div className="pipeline-card-top">{canDrag(record) && <GripVertical size={13} className="drag-grip" />}<span className="client-avatar">{record.name.trim().charAt(0).toUpperCase()}</span><span className="client-ref">{record.reference}</span><ArrowRight size={14} /></div>
                  <strong className="pipeline-client-name">{record.name}</strong>
                  {(!record.isMine || record.lastRating || record.noteCount > 0) && <span className="card-badges">{!record.isMine && <span className="owner-tag">{record.ownerName}</span>}{record.lastRating ? <span className="card-rating" title="Última avaliação da liderança">★ {record.lastRating}</span> : null}{record.noteCount > 0 && <span className="card-notes" title="Cobranças e avaliações"><MessageSquare size={10} />{record.noteCount}</span>}</span>}
                  <div className="pipeline-card-meta"><span><UserRound size={13} />{record.isBankCustomer === "yes" ? "Cliente do banco" : record.isBankCustomer === "no" ? "Novo no banco" : "Vínculo pendente"}</span></div>
                  {record.stage === "technical" && <div className="pipeline-alert pipeline-alert-technical"><Wrench size={13} />{!record.isMine && record.canEdit ? "Sob sua responsabilidade" : "Com a gerência da agência"}</div>}
                  {record.interestedWithoutLimit && <div className="pipeline-alert"><CircleDollarSign size={14} />Interesse sem limite</div>}
                  {record.followUpDate && <div className="pipeline-card-meta"><span><CalendarClock size={13} />Retorno {new Date(`${record.followUpDate}T12:00:00`).toLocaleDateString("pt-BR")}</span></div>}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
