import { useState } from "react";
import { Building2, CircleAlert, LoaderCircle, MailOpen } from "lucide-react";
import { Link, useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { COMPANY_ROLE_LABELS, COMPANY_ROLE_SCOPE } from "@shared/const";
import AuthLayout from "@/components/AuthLayout";
import { LoginForm } from "@/components/LoginScreen";
import SignupForm from "@/components/SignupForm";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Invite() {
  const { token = "" } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const auth = useAuth();
  const utils = trpc.useUtils();
  const preview = trpc.organization.previewInvite.useQuery({ token }, { retry: false, enabled: token.length >= 10 });
  const accept = trpc.organization.acceptInvite.useMutation();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [error, setError] = useState("");

  const finish = () => {
    void utils.invalidate();
    toast.success(`Bem-vindo à ${preview.data?.valid ? preview.data.companyName : "empresa"}!`);
    navigate("/");
  };

  const acceptNow = async () => {
    setError("");
    try {
      await accept.mutateAsync({ token });
      finish();
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Não foi possível aceitar o convite.");
    }
  };

  if (preview.isLoading || auth.loading) {
    return <AuthLayout><div className="invite-loading"><LoaderCircle className="spin" size={20} />Abrindo convite…</div></AuthLayout>;
  }

  const data = preview.data;
  if (!data || !data.valid) {
    return (
      <AuthLayout>
        <span className="eyebrow"><CircleAlert size={14} /> CONVITE</span>
        <h2>Convite indisponível</h2>
        <p className="login-subtitle">{data && !data.valid ? data.problem : "Este link de convite não é válido."}</p>
        <Link href="/" className="button button-primary login-button">Ir para o VALORA</Link>
      </AuthLayout>
    );
  }

  const where = [data.agencyName && `Agência ${data.agencyName}`, data.teamName && `Equipe ${data.teamName}`].filter(Boolean).join(" · ");
  const signedInEmail = auth.user?.email?.toLowerCase();
  const emailMismatch = Boolean(auth.user && signedInEmail && signedInEmail !== data.email);

  return (
    <AuthLayout>
      <span className="eyebrow"><MailOpen size={14} /> CONVITE</span>
      <h2>Entrar em {data.companyDisplayName || data.companyName}</h2>
      <div className="invite-card">
        <div className="invite-card-icon"><Building2 size={18} /></div>
        <div>
          <p><b>{data.inviterName}</b> convidou <b>{data.email}</b> como <b>{data.roleLabel}</b>.</p>
          {where && <p className="invite-where">{where}</p>}
          <p className="invite-scope">{COMPANY_ROLE_SCOPE[data.role]}</p>
          <p className="invite-expiry">Válido até {new Date(data.expiresAt).toLocaleDateString("pt-BR")}.</p>
        </div>
      </div>

      {auth.user ? (
        <>
          <p className="login-subtitle">Você está conectado como <b>{auth.user.email}</b>.</p>
          {emailMismatch && <div className="form-error login-error">Sua conta usa o e-mail {auth.user.email}, mas o convite foi enviado para {data.email}. Saia e entre com a conta certa, ou crie uma nova.</div>}
          {error && <div className="form-error login-error" role="alert">{error}</div>}
          <button type="button" className="button button-primary login-button" disabled={accept.isPending || emailMismatch} onClick={() => void acceptNow()}>
            {accept.isPending ? <><LoaderCircle className="spin" size={17} />Entrando na empresa…</> : "Aceitar convite"}
          </button>
          <p className="login-switch"><button type="button" className="link-button" onClick={() => void auth.logout()}>Usar outra conta</button></p>
        </>
      ) : (
        <>
          <div className="auth-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Criar conta</button>
            <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Já tenho conta</button>
          </div>
          {mode === "signup"
            ? <SignupForm inviteToken={token} lockedEmail={data.email} submitLabel="Criar conta e aceitar" onDone={finish} />
            : <><p className="login-subtitle">Entre e depois confirme o convite.</p><LoginForm onLogin={auth.login} loggingIn={auth.loggingIn} submitLabel="Entrar" defaultEmail={data.email} /></>}
        </>
      )}
    </AuthLayout>
  );
}
