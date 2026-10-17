import { useState, type FormEvent } from "react";
import { BellRing, LoaderCircle, MessageSquare, Send, Star } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Kind = "cobranca" | "avaliacao" | "comentario";
const KIND_LABEL: Record<Kind, string> = { cobranca: "Cobrança", avaliacao: "Avaliação", comentario: "Comentário" };

/**
 * Feedback on a client record. Leaders and managers can charge ("cobrar") the
 * person who served the client, evaluate the service (1–5 stars) or comment;
 * the owner sees it in the bell and can reply.
 */
export default function RecordNotes({ recordId, canReview, isMine, readOnly }: { recordId: number; canReview: boolean; isMine: boolean; readOnly: boolean }) {
  const utils = trpc.useUtils();
  const notes = trpc.features.notes.useQuery({ recordId }, { retry: false });
  const add = trpc.features.addNote.useMutation();
  const [kind, setKind] = useState<Kind>(canReview ? "cobranca" : "comentario");
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const canWrite = !readOnly && (canReview || isMine);
  const kinds: Kind[] = canReview ? ["cobranca", "avaliacao", "comentario"] : ["comentario"];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await add.mutateAsync({ recordId, kind, rating: kind === "avaliacao" ? rating : null, body });
      setBody(""); setRating(0);
      await Promise.all([utils.features.notes.invalidate({ recordId }), utils.clients.list.invalidate()]);
      toast.success(kind === "cobranca" ? "Cobrança enviada. A pessoa foi avisada." : kind === "avaliacao" ? "Avaliação registrada." : "Mensagem enviada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar.");
    }
  };

  return (
    <section className="record-notes">
      <div className="form-section-title"><span>{canReview ? "Acompanhamento da liderança" : "Retornos da liderança"}</span><i /></div>
      {notes.isLoading ? <p className="record-notes-empty"><LoaderCircle className="spin" size={14} />Carregando…</p>
        : !notes.data?.length ? <p className="record-notes-empty">{canReview ? "Nenhuma cobrança ou avaliação ainda. Use o campo abaixo para cobrar ou avaliar este atendimento." : "Nenhum retorno da liderança sobre este atendimento."}</p>
        : <ul className="record-notes-list">{notes.data.map((note) => (
          <li key={note.id} className={`note-${note.kind}`}>
            <span className="note-head"><b>{note.authorName}</b><span className={`note-kind kind-${note.kind}`}>{KIND_LABEL[note.kind]}</span>{note.rating ? <span className="note-stars">{"★".repeat(note.rating)}{"☆".repeat(5 - note.rating)}</span> : null}<time>{new Date(note.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></span>
            <p>{note.body}</p>
          </li>
        ))}</ul>}
      {canWrite && (
        <div className="record-notes-form">
          {kinds.length > 1 && <div className="view-mode note-kinds" role="tablist" aria-label="Tipo de retorno">
            {kinds.map((item) => <button key={item} type="button" role="tab" aria-selected={kind === item} className={kind === item ? "active" : ""} onClick={() => setKind(item)}>{item === "cobranca" ? <BellRing size={12} /> : item === "avaliacao" ? <Star size={12} /> : <MessageSquare size={12} />}{item === "cobranca" ? "Cobrar" : item === "avaliacao" ? "Avaliar" : "Comentar"}</button>)}
          </div>}
          {kind === "avaliacao" && <div className="star-picker" role="radiogroup" aria-label="Nota do atendimento">{[1, 2, 3, 4, 5].map((value) => (
            <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} de 5`} className={value <= rating ? "on" : ""} onClick={() => setRating(value)}><Star size={20} /></button>
          ))}</div>}
          <div className="note-input">
            <textarea rows={2} maxLength={1000} value={body} onChange={(event) => setBody(event.target.value)} placeholder={kind === "cobranca" ? "Ex.: Você marcou retorno com o cliente ontem. Ligou? Atualize o atendimento, por favor." : kind === "avaliacao" ? "O que foi bem e o que pode melhorar neste atendimento?" : isMine ? "Responda à liderança…" : "Escreva um comentário…"} />
            <button type="button" className="button button-primary" disabled={add.isPending || body.trim().length < 2 || (kind === "avaliacao" && !rating)} onClick={(event) => void submit(event)}><Send size={14} />{kind === "cobranca" ? "Cobrar" : "Enviar"}</button>
          </div>
        </div>
      )}
    </section>
  );
}
