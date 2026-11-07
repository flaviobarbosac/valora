import { useState, type DragEvent } from "react";
import { ArrowRight, BadgeCheck, CalendarClock, GripVertical, IdCard, MessageSquare, Wrench } from "lucide-react";
import { formatCustomValue } from "@shared/pipeline";
import type { ClientRecord } from "@/lib/client-types";
import { agree, cardFields, term, type Product } from "@/lib/workspace";

type Props = {
  /** The pipeline being shown. */
  product: Product;
  records: ClientRecord[];
  /** Clicking a card opens the customer's postcard. */
  onOpen: (record: ClientRecord) => void;
  /** Called when a card is dropped on another column. */
  onMove: (record: ClientRecord, stage: string) => void;
  /** "Ver como": nothing can be dragged. */
  locked?: boolean;
};

export default function ClientPipeline({ product, records, onOpen, onMove, locked = false }: Props) {
  const [dragging, setDragging] = useState<ClientRecord | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const stages = product.config.stages;
  const fields = cardFields(product);
  const firstStage = stages[0]?.key;
  // A record whose stage was removed from the pipeline shows in the first column.
  const columnOf = (record: ClientRecord) => (stages.some((stage) => stage.key === record.stage) ? record.stage : firstStage);

  const canDrag = (record: ClientRecord) => !locked && record.canEdit;

  const startDrag = (event: DragEvent<HTMLButtonElement>, record: ClientRecord) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(record.id));
    setDragging(record);
  };
  const endDrag = () => { setDragging(null); setOverStage(null); };

  const drop = (event: DragEvent<HTMLElement>, stage: string) => {
    event.preventDefault();
    const record = dragging ?? records.find((item) => String(item.id) === event.dataTransfer.getData("text/plain"));
    endDrag();
    if (record && record.stage !== stage) onMove(record, stage);
  };

  return (
    <div className={`pipeline-board ${dragging ? "is-dragging" : ""}`}>
      {stages.map((stage) => {
        const cards = records.filter((record) => columnOf(record) === stage.key);
        const dropClass = !dragging || dragging.stage === stage.key ? "" : overStage === stage.key ? "drop-over" : "drop-ok";
        return (
          <section
            className={`pipeline-column pipeline-column-${stage.kind} ${dropClass}`}
            key={stage.key}
            onDragOver={(event) => { if (dragging) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setOverStage(stage.key); } }}
            onDragLeave={() => setOverStage((current) => (current === stage.key ? null : current))}
            onDrop={(event) => drop(event, stage.key)}
            aria-label={`Etapa ${stage.label}`}
          >
            <header className="pipeline-column-head">
              <span className={`stage-dot stage-${stage.color}`} />
              <h3>{stage.label}</h3>
              <span className="column-count">{cards.length}</span>
            </header>
            {stage.kind === "handoff" && <p className="pipeline-column-note"><Wrench size={11} />A gerência da agência assume</p>}
            <div className="pipeline-cards">
              {cards.length === 0 ? <div className="pipeline-empty">{dragging && dragging.stage !== stage.key ? "Solte aqui" : `${agree("deal", "Nenhum")} ${term("deal", true)}`}</div> : cards.map((record) => {
                const shown = fields.filter((field) => record.customFields[field.key]).slice(0, 3);
                return (
                  <button
                    className={`pipeline-card ${canDrag(record) ? "is-draggable" : ""} ${dragging?.id === record.id ? "is-dragged" : ""}`}
                    type="button"
                    key={record.id}
                    draggable={canDrag(record)}
                    onDragStart={(event) => startDrag(event, record)}
                    onDragEnd={endDrag}
                    onClick={() => onOpen(record)}
                    title={canDrag(record) ? "Arraste para mudar de etapa, ou clique para abrir a ficha" : "Clique para abrir a ficha"}
                  >
                    <div className="pipeline-card-top">{canDrag(record) && <GripVertical size={13} className="drag-grip" />}<span className="client-avatar">{record.name.trim().charAt(0).toUpperCase()}</span><span className="client-ref">{record.reference}</span><ArrowRight size={14} /></div>
                    <strong className="pipeline-client-name">{record.name}</strong>
                    {(!record.isMine || record.lastRating || record.noteCount > 0 || record.customerId) && <span className="card-badges">{record.customerId ? <span className="card-registered" title={`${term("customer")} ${agree("customer", "cadastrado")}`}><IdCard size={10} />Cadastro</span> : null}{!record.isMine && <span className="owner-tag">{record.ownerName}</span>}{record.lastRating ? <span className="card-rating" title="Última avaliação da liderança">★ {record.lastRating}</span> : null}{record.noteCount > 0 && <span className="card-notes" title="Cobranças e avaliações"><MessageSquare size={10} />{record.noteCount}</span>}</span>}
                    {shown.map((field) => <div className="pipeline-card-meta" key={field.key}><span><b>{field.label}:</b> {formatCustomValue(field, record.customFields[field.key])}</span></div>)}
                    {stage.kind === "won" && record.lastProductSold && <div className="pipeline-card-meta"><span><BadgeCheck size={13} />{record.lastProductSold}</span></div>}
                    {stage.kind === "handoff" && <div className="pipeline-alert pipeline-alert-technical"><Wrench size={13} />{!record.isMine && record.canEdit ? "Sob sua responsabilidade" : "Com a gerência da agência"}</div>}
                    {record.followUpDate && <div className="pipeline-card-meta"><span><CalendarClock size={13} />Retorno {new Date(`${record.followUpDate}T12:00:00`).toLocaleDateString("pt-BR")}</span></div>}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
