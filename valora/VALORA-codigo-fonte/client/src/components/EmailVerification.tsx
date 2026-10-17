import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle, MailCheck, RotateCw } from "lucide-react";
import { trpc } from "@/lib/trpc";

const RESEND_SECONDS = 60;

type Props = {
  email: string;
  /** False when the server has no e-mail (SMTP) set up: the code only reaches the server log. */
  mailConfigured: boolean;
  onBack: () => void;
  onVerified: () => void;
};

/** Second step of a sign-up (or of a login with an unconfirmed e-mail): the 6-digit code. */
export default function EmailVerification({ email, mailConfigured, onBack, onVerified }: Props) {
  const utils = trpc.useUtils();
  const verify = trpc.auth.verifyEmail.useMutation();
  const resend = trpc.auth.resendEmailCode.useMutation();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [wait, setWait] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setInfo("");
    if (!/^\d{6}$/.test(code)) { setError("Digite os 6 números do código."); return; }
    try {
      const user = await verify.mutateAsync({ email, code });
      utils.auth.me.setData(undefined, user);
      void utils.invalidate();
      onVerified();
    } catch (caught) {
      setCode("");
      setError(caught instanceof Error && caught.message ? caught.message : "Não foi possível confirmar o código.");
    }
  };

  const sendAgain = async () => {
    setError("");
    try {
      await resend.mutateAsync({ email });
      setWait(RESEND_SECONDS);
      setInfo("Enviamos um código novo. Os códigos anteriores deixam de valer.");
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Não foi possível reenviar o código.");
    }
  };

  return (
    <form className="login-form" onSubmit={(event) => void submit(event)} noValidate>
      <div className="verify-email-box">
        <span className="verify-email-icon"><MailCheck size={20} /></span>
        <div>
          <strong>Confirme seu e-mail</strong>
          <p>Enviamos um código de 6 dígitos para <b>{email}</b>. Ele vale por 15 minutos. Confira também a caixa de spam.</p>
        </div>
      </div>
      {!mailConfigured && <div className="notice notice-warning verify-email-warning" role="status">O envio de e-mails ainda não foi configurado neste servidor. Peça o código a quem administra o VALORA.</div>}
      <label className="field">
        <span>Código de verificação</span>
        <input className="verify-code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} placeholder="000000" autoFocus aria-describedby="verify-code-help" />
      </label>
      <p id="verify-code-help" className="login-hint">Sua conta só pode ser usada depois de confirmar o e-mail.</p>
      {error && <div className="form-error login-error" role="alert">{error}</div>}
      {info && <div className="form-success" role="status">{info}</div>}
      <button type="submit" className="button button-primary login-button" disabled={verify.isPending || code.length !== 6}>
        {verify.isPending ? <><LoaderCircle className="spin" size={17} />Confirmando…</> : <>Confirmar e entrar <ArrowRight size={17} /></>}
      </button>
      <div className="verify-email-actions">
        <button type="button" className="link-button" onClick={onBack}><ArrowLeft size={14} />Voltar</button>
        <button type="button" className="link-button" disabled={wait > 0 || resend.isPending} onClick={() => void sendAgain()}>
          <RotateCw size={14} />{wait > 0 ? `Reenviar código em ${wait}s` : resend.isPending ? "Enviando…" : "Reenviar código"}
        </button>
      </div>
    </form>
  );
}
