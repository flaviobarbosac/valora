import { useEffect, useState, type FormEvent } from "react";
import { Bug, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { technicalSnapshot } from "@/lib/errorLog";
import { trpc } from "@/lib/trpc";

const CATEGORIES = [
  { value: "erro", label: "Algo deu erro ou não funciona" },
  { value: "lentidao", label: "Está lento ou travando" },
  { value: "visual", label: "Algo aparece errado na tela" },
  { value: "sugestao", label: "Sugestão de melhoria" },
  { value: "outro", label: "Outro assunto" },
] as const;

type Props = { open: boolean; onOpenChange: (open: boolean) => void; signedIn: boolean };

export default function BugReportDialog({ open, onOpenChange, signedIn }: Props) {
  const report = trpc.features.reportBug.useMutation();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["value"]>("erro");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [includeTech, setIncludeTech] = useState(true);
  const [showTech, setShowTech] = useState(false);
  const [tech, setTech] = useState("");

  useEffect(() => {
    if (!open) return;
    setTech(technicalSnapshot());
    setShowTech(false);
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const result = await report.mutateAsync({
        category, description, email: signedIn || !email.trim() ? null : email.trim(),
        pageUrl: `${window.location.pathname}${window.location.search}`.slice(0, 300),
        userAgent: navigator.userAgent.slice(0, 300),
        technicalLog: includeTech ? tech : null,
      });
      toast.success(`Obrigado! Seu relato #${result.id} foi enviado ao suporte.`);
      setDescription(""); setEmail(""); setCategory("erro");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o relato.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="client-dialog app-dialog bug-dialog">
        <DialogHeader className="dialog-heading">
          <div className="dialog-icon"><Bug size={18} /></div>
          <div><DialogTitle>Relatar erro</DialogTitle><DialogDescription>Conte o que aconteceu. O relato vai para o suporte do VALORA.</DialogDescription></div>
        </DialogHeader>
        <form className="client-form" onSubmit={(event) => void submit(event)}>
          <label className="field"><span>Tipo</span><select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>{CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="field"><span>O que aconteceu?</span><textarea required minLength={10} maxLength={5000} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: Cliquei em Salvar atendimento e apareceu uma mensagem de erro. Eu estava na tela Pipeline." /></label>
          {!signedIn && <label className="field"><span>Seu e-mail para resposta <small>(opcional)</small></span><input type="email" maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
          <label className="delete-account-check"><input type="checkbox" checked={includeTech} onChange={(event) => setIncludeTech(event.target.checked)} /><span>Enviar informações técnicas (página, tamanho da tela e últimos erros). Não inclui dados de clientes.</span></label>
          {includeTech && <button type="button" className="link-button tech-toggle" onClick={() => setShowTech((current) => !current)}><ChevronDown size={13} className={showTech ? "open" : ""} />{showTech ? "Esconder" : "Ver"} o que será enviado</button>}
          {includeTech && showTech && <pre className="tech-preview">{tech}</pre>}
          <div className="form-actions"><button type="button" className="button button-ghost" onClick={() => onOpenChange(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={report.isPending || description.trim().length < 10}>{report.isPending ? "Enviando…" : "Enviar relato"}</button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
