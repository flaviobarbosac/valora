import { useEffect, useState, type FormEvent } from "react";
import { TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  deleting: boolean;
  /** Resolves to an error message, or null when the account was deleted. */
  onConfirm: (password: string) => Promise<string | null>;
};

export default function DeleteAccountDialog({ open, onOpenChange, username, deleting, onConfirm }: Props) {
  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setUnderstood(false);
    setError("");
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!password) {
      setError("Digite sua senha para confirmar.");
      return;
    }
    const message = await onConfirm(password);
    if (message) {
      setError(message);
      setPassword("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!deleting) onOpenChange(next); }}>
      <DialogContent className="client-dialog delete-account-dialog">
        <DialogHeader className="dialog-heading">
          <div className="dialog-icon dialog-icon-danger"><TriangleAlert size={19} /></div>
          <div><DialogTitle>Excluir conta</DialogTitle><DialogDescription>Esta ação é permanente e não pode ser desfeita.</DialogDescription></div>
        </DialogHeader>
        <form className="client-form account-settings-form" onSubmit={(event) => void submit(event)}>
          <div className="delete-account-warning">
            <strong>Serão apagados para sempre:</strong>
            <ul>
              <li>todos os seus atendimentos e clientes registrados;</li>
              <li>suas metas e seu perfil (nome, cargo e foto);</li>
              <li>seu acesso como <b>{username}</b>.</li>
            </ul>
            <p>Se quiser guardar os atendimentos, use <b>Exportar</b> antes de continuar.</p>
          </div>
          <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
          <label className="field"><span>Digite sua senha para confirmar</span><input type="password" autoComplete="current-password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} disabled={deleting} /></label>
          <label className="delete-account-check"><input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} disabled={deleting} /><span>Entendo que a conta e os dados não poderão ser recuperados.</span></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="form-actions">
            <button type="button" className="button button-ghost" onClick={() => onOpenChange(false)} disabled={deleting}>Cancelar</button>
            <button type="submit" className="button button-danger" disabled={!understood || deleting}>{deleting ? "Excluindo…" : "Excluir minha conta"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
