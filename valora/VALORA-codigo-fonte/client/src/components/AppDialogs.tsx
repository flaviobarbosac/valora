import { createContext, useCallback, useContext, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Pencil, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// In-app replacements for window.prompt / window.confirm, which some browsers
// (including embedded ones) do not support and which cannot be styled.

type AskTextOptions = { title: string; label?: string; description?: string; initialValue?: string; confirmLabel?: string; minLength?: number; maxLength?: number };
type ConfirmOptions = { title: string; description?: string; confirmLabel?: string; danger?: boolean };

type Request =
  | ({ kind: "text"; resolve: (value: string | null) => void } & AskTextOptions)
  | ({ kind: "confirm"; resolve: (value: boolean) => void } & ConfirmOptions);

type Api = {
  /** Resolves to the trimmed text, or null when cancelled. */
  askText: (options: AskTextOptions) => Promise<string | null>;
  /** Resolves to true only when the person confirms. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const AppDialogContext = createContext<Api | null>(null);

export function useAppDialog() {
  const api = useContext(AppDialogContext);
  if (!api) throw new Error("useAppDialog must be used inside <AppDialogProvider>");
  return api;
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  // The last request stays rendered while the dialog animates out; changing the
  // content mid-animation can leave the closed dialog stuck over the page.
  const [request, setRequest] = useState<Request | null>(null);
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const pending = useRef<Request | null>(null);

  const finish = useCallback((result: string | null | boolean) => {
    const current = pending.current;
    pending.current = null;
    setVisible(false);
    if (!current) return;
    if (current.kind === "text") current.resolve(typeof result === "string" ? result : null);
    else current.resolve(result === true);
  }, []);

  const open = useCallback((next: Request) => {
    // A newer dialog cancels an older one that was still open.
    if (pending.current) finish(pending.current.kind === "text" ? null : false);
    pending.current = next;
    setText(next.kind === "text" ? next.initialValue ?? "" : "");
    setError("");
    setRequest(next);
    setVisible(true);
  }, [finish]);

  const api: Api = {
    askText: (options) => new Promise((resolve) => open({ kind: "text", resolve, ...options })),
    confirm: (options) => new Promise((resolve) => open({ kind: "confirm", resolve, ...options })),
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!request || !visible) return;
    if (request.kind === "confirm") { finish(true); return; }
    const value = text.trim();
    const min = request.minLength ?? 1;
    if (value.length < min) { setError(min > 1 ? `Use pelo menos ${min} caracteres.` : "Preencha este campo."); return; }
    finish(value);
  };

  const danger = request?.kind === "confirm" && request.danger;

  return (
    <AppDialogContext.Provider value={api}>
      {children}
      <Dialog open={visible} onOpenChange={(isOpen) => { if (!isOpen && visible) finish(request?.kind === "text" ? null : false); }}>
        <DialogContent className="client-dialog app-dialog">
          <DialogHeader className="dialog-heading">
            <div className={`dialog-icon ${danger ? "dialog-icon-danger" : ""}`}>{request?.kind === "text" ? <Pencil size={18} /> : <TriangleAlert size={18} />}</div>
            <div><DialogTitle>{request?.title}</DialogTitle>{request?.description ? <DialogDescription>{request.description}</DialogDescription> : <DialogDescription className="sr-only">{request?.title}</DialogDescription>}</div>
          </DialogHeader>
          <form className="client-form" onSubmit={submit}>
            {request?.kind === "text" && (
              <label className="field"><span>{request.label ?? "Nome"}</span><input autoFocus value={text} maxLength={request.maxLength ?? 120} onChange={(event) => { setText(event.target.value); setError(""); }} onFocus={(event) => event.target.select()} /></label>
            )}
            {error && <div className="form-error" role="alert">{error}</div>}
            <div className="form-actions">
              <button type="button" className="button button-ghost" onClick={() => finish(request?.kind === "text" ? null : false)}>Cancelar</button>
              <button type="submit" className={`button ${danger ? "button-danger" : "button-primary"}`} autoFocus={request?.kind === "confirm"}>{request?.confirmLabel ?? (request?.kind === "text" ? "Salvar" : "Confirmar")}</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppDialogContext.Provider>
  );
}
