import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, UserRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import EmailVerification from "@/components/EmailVerification";

type Props = {
  /** When set, the account joins this invitation's company and the e-mail is locked. */
  inviteToken?: string;
  lockedEmail?: string;
  submitLabel?: string;
  onDone: () => void;
};

export default function SignupForm({ inviteToken, lockedEmail, submitLabel = "Criar minha conta", onDone }: Props) {
  const utils = trpc.useUtils();
  const signup = trpc.auth.signup.useMutation();
  const [form, setForm] = useState({ name: "", email: lockedEmail ?? "", password: "", confirm: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState<{ email: string; mailConfigured: boolean } | null>(null);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.trim()) {
      setError("Preencha seu nome e seu e-mail.");
      return;
    }
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
      setError("A senha deve ter pelo menos 8 caracteres, com letras e números.");
      return;
    }
    if (form.password !== form.confirm) {
      setError("A confirmação não confere com a senha.");
      return;
    }
    try {
      const result = await signup.mutateAsync({
        name: form.name, email: form.email, password: form.password,
        ...(inviteToken ? { inviteToken } : {}),
      });
      if (result.status === "verify_email") {
        setVerifying({ email: result.email, mailConfigured: result.mailConfigured });
        return;
      }
      utils.auth.me.setData(undefined, result.user);
      void utils.invalidate();
      onDone();
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Não foi possível criar a conta.");
    }
  };

  if (verifying) {
    return <EmailVerification email={verifying.email} mailConfigured={verifying.mailConfigured} onBack={() => { setVerifying(null); setForm((current) => ({ ...current, password: "", confirm: "" })); }} onVerified={onDone} />;
  }

  return (
    <form className="login-form" onSubmit={(event) => void submit(event)} noValidate>
      <label className="field">
        <span>Seu nome</span>
        <span className="input-with-icon"><UserRound size={16} /><input autoComplete="name" maxLength={100} value={form.name} onChange={set("name")} placeholder="Nome e sobrenome" autoFocus /></span>
      </label>
      <label className="field">
        <span>E-mail</span>
        <span className="input-with-icon"><Mail size={16} /><input type="email" autoComplete="email" maxLength={320} value={form.email} onChange={set("email")} readOnly={Boolean(lockedEmail)} placeholder="voce@empresa.com.br" /></span>
      </label>
      <label className="field">
        <span>Senha</span>
        <span className="input-with-icon password-input"><LockKeyhole size={16} /><input type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={128} value={form.password} onChange={set("password")} placeholder="8+ caracteres, letras e números" />
          <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </span>
      </label>
      <label className="field">
        <span>Repita a senha</span>
        <span className="input-with-icon"><LockKeyhole size={16} /><input type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={128} value={form.confirm} onChange={set("confirm")} /></span>
      </label>
      <p className="login-hint">Você vai entrar no VALORA com este e-mail e esta senha.</p>
      {error && <div className="form-error login-error" role="alert">{error}</div>}
      <button type="submit" className="button button-primary login-button" disabled={signup.isPending}>
        {signup.isPending ? <><LoaderCircle className="spin" size={17} />Criando conta…</> : <>{submitLabel} <ArrowRight size={17} /></>}
      </button>
    </form>
  );
}
