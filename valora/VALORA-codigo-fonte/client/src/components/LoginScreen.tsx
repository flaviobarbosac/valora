import { useState, type FormEvent } from "react";
import { TRPCClientError } from "@trpc/client";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import AuthLayout from "@/components/AuthLayout";
import BugReportDialog from "@/components/BugReportDialog";
import EmailVerification from "@/components/EmailVerification";
import ForgotPassword from "@/components/ForgotPassword";
import type { LoginCredentials } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

type FormProps = {
  onLogin: (credentials: LoginCredentials) => Promise<unknown>;
  loggingIn: boolean;
  submitLabel?: string;
};

/** E-mail + password form, also used on the invitation page. */
export function LoginForm({ onLogin, loggingIn, submitLabel = "Entrar", defaultEmail = "", onForgotPassword }: FormProps & { defaultEmail?: string; onForgotPassword?: (email: string) => void }) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const mailQuery = trpc.system.mailStatus.useQuery(undefined, { enabled: verifying, retry: false });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Preencha o e-mail e a senha.");
      return;
    }
    try {
      await onLogin({ email, password });
    } catch (caught) {
      setPassword("");
      const code = caught instanceof TRPCClientError ? caught.data?.code : undefined;
      // Right password, e-mail never confirmed: the server just sent a code.
      if (code === "PRECONDITION_FAILED") { setVerifying(true); return; }
      setError(code === "UNAUTHORIZED" || code === "TOO_MANY_REQUESTS"
        ? caught instanceof Error ? caught.message : "Não foi possível entrar."
        : "Não foi possível entrar agora. Verifique a conexão e tente novamente.");
    }
  };

  if (verifying) {
    // Signed in once the code is right; the page then shows the app (or the invitation).
    return <EmailVerification email={email} mailConfigured={mailQuery.data?.mailConfigured ?? true} onBack={() => setVerifying(false)} onVerified={() => setVerifying(false)} />;
  }

  return (
    <form className="login-form" onSubmit={(event) => void submit(event)} noValidate>
      <label className="field">
        <span>E-mail</span>
        <span className="input-with-icon"><Mail size={16} /><input name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com.br" autoFocus /></span>
      </label>
      <label className="field">
        <span>Senha</span>
        <span className="input-with-icon password-input"><LockKeyhole size={16} /><input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" />
          <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} title={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </span>
      </label>
      {onForgotPassword && <p className="forgot-password-line"><button type="button" className="link-button" onClick={() => onForgotPassword(email)}>Esqueci minha senha</button></p>}
      {error && <div className="form-error login-error" role="alert">{error}</div>}
      <button type="submit" className="button button-primary login-button" disabled={loggingIn}>
        {loggingIn ? <><LoaderCircle className="spin" size={17} />Entrando…</> : <>{submitLabel} <ArrowRight size={17} /></>}
      </button>
    </form>
  );
}

export default function LoginScreen(props: FormProps) {
  const [bugOpen, setBugOpen] = useState(false);
  // E-mail typed so far, carried into "Esqueci minha senha"; null while on the login form.
  const [forgotEmail, setForgotEmail] = useState<string | null>(null);
  if (forgotEmail !== null) {
    return (
      <AuthLayout>
        <span className="eyebrow"><ShieldCheck size={14} /> NOVA SENHA</span>
        <h2>Recuperar acesso</h2>
        <p className="login-subtitle">Crie uma senha nova com um código enviado ao seu e-mail.</p>
        <ForgotPassword defaultEmail={forgotEmail} onBack={() => setForgotEmail(null)} />
      </AuthLayout>
    );
  }
  return (
    <AuthLayout>
      <span className="eyebrow"><ShieldCheck size={14} /> ACESSO RESTRITO</span>
      <h2>Entrar no VALORA</h2>
      <p className="login-subtitle">Entre com o seu e-mail e a sua senha.</p>
      <LoginForm {...props} onForgotPassword={(email) => setForgotEmail(email)} />
      <p className="login-switch">Ainda não tem conta? <Link href="/cadastro">Criar conta</Link></p>
      <p className="login-help"><button type="button" className="link-button" onClick={() => setBugOpen(true)}>Relatar um problema</button></p>
      <BugReportDialog open={bugOpen} onOpenChange={setBugOpen} signedIn={false} />
    </AuthLayout>
  );
}
