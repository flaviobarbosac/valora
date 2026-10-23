import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, Mail, RotateCw } from "lucide-react";
import { trpc } from "@/lib/trpc";

const RESEND_SECONDS = 60;

type Props = {
  defaultEmail?: string;
  onBack: () => void;
};

/** "Esqueci minha senha": a 6-digit code goes to the e-mail, then the person picks a new password and is signed in. */
export default function ForgotPassword({ defaultEmail = "", onBack }: Props) {
  const utils = trpc.useUtils();
  const request = trpc.auth.requestPasswordReset.useMutation();
  const reset = trpc.auth.resetPassword.useMutation();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(defaultEmail);
  const [mailConfigured, setMailConfigured] = useState(true);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  const message = (caught: unknown, fallback: string) => (caught instanceof Error && caught.message ? caught.message : fallback);

  const sendCode = async () => {
    setError("");
    setInfo("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Informe o e-mail da sua conta."); return false; }
    try {
      const result = await request.mutateAsync({ email: email.trim() });
      setMailConfigured(result.mailConfigured);
      setWait(RESEND_SECONDS);
      return true;
    } catch (caught) {
      setError(message(caught, "Não foi possível enviar o código."));
      return false;
    }
  };

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await sendCode()) setStep("code");
  };

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setInfo("");
    if (!/^\d{6}$/.test(code)) { setError("Digite os 6 números do código."); return; }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) { setError("A nova senha deve ter pelo menos 8 caracteres, com letras e números."); return; }
    if (password !== confirm) { setError("A confirmação não confere com a nova senha."); return; }
    try {
      const user = await reset.mutateAsync({ email: email.trim(), code, newPassword: password });
      utils.auth.me.setData(undefined, user);
      void utils.invalidate();
    } catch (caught) {
      setCode("");
      setError(message(caught, "Não foi possível trocar a senha."));
    }
  };

  if (step === "email") {
    return (
      <form className="login-form" onSubmit={(event) => void submitEmail(event)} noValidate>
        <div className="verify-email-box">
          <span className="verify-email-icon"><KeyRound size={20} /></span>
          <div>
            <strong>Esqueceu a senha?</strong>
            <p>Informe o e-mail da sua conta. Vamos enviar um código de 6 dígitos para você criar uma senha nova.</p>
          </div>
        </div>
        <label className="field">
          <span>E-mail</span>
          <span className="input-with-icon"><Mail size={16} /><input type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={320} value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} placeholder="voce@empresa.com.br" autoFocus /></span>
        </label>
        {error && <div className="form-error login-error" role="alert">{error}</div>}
        <button type="submit" className="button button-primary login-button" disabled={request.isPending}>
          {request.isPending ? <><LoaderCircle className="spin" size={17} />Enviando…</> : <>Enviar código <ArrowRight size={17} /></>}
        </button>
        <div className="verify-email-actions">
          <button type="button" className="link-button" onClick={onBack}><ArrowLeft size={14} />Voltar para o login</button>
        </div>
      </form>
    );
  }

  return (
    <form className="login-form" onSubmit={(event) => void submitCode(event)} noValidate>
      <div className="verify-email-box">
        <span className="verify-email-icon"><Mail size={20} /></span>
        <div>
          <strong>Confira seu e-mail</strong>
          <p>Se existir uma conta com <b>{email.trim()}</b>, enviamos um código de 6 dígitos. Ele vale por 15 minutos. Confira também a caixa de spam.</p>
        </div>
      </div>
      {!mailConfigured && <div className="notice notice-warning verify-email-warning" role="status">O envio de e-mails ainda não foi configurado neste servidor. Peça o código a quem administra o VALORA.</div>}
      <label className="field">
        <span>Código recebido</span>
        <input className="verify-code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} placeholder="000000" autoFocus />
      </label>
      <label className="field">
        <span>Nova senha</span>
        <span className="input-with-icon password-input"><LockKeyhole size={16} /><input type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8+ caracteres, letras e números" />
          <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </span>
      </label>
      <label className="field">
        <span>Repita a nova senha</span>
        <span className="input-with-icon"><LockKeyhole size={16} /><input type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={128} value={confirm} onChange={(event) => setConfirm(event.target.value)} /></span>
      </label>
      <p className="login-hint">Ao trocar a senha, você entra no VALORA e as sessões abertas em outros aparelhos são encerradas.</p>
      {error && <div className="form-error login-error" role="alert">{error}</div>}
      {info && <div className="form-success" role="status">{info}</div>}
      <button type="submit" className="button button-primary login-button" disabled={reset.isPending}>
        {reset.isPending ? <><LoaderCircle className="spin" size={17} />Salvando…</> : <>Salvar nova senha e entrar <ArrowRight size={17} /></>}
      </button>
      <div className="verify-email-actions">
        <button type="button" className="link-button" onClick={() => { setStep("email"); setCode(""); setError(""); }}><ArrowLeft size={14} />Trocar e-mail</button>
        <button type="button" className="link-button" disabled={wait > 0 || request.isPending} onClick={() => void sendCode().then((sent) => { if (sent) setInfo("Enviamos um código novo. Os anteriores deixam de valer."); })}>
          <RotateCw size={14} />{wait > 0 ? `Reenviar código em ${wait}s` : request.isPending ? "Enviando…" : "Reenviar código"}
        </button>
      </div>
    </form>
  );
}
