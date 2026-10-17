import { UserPlus } from "lucide-react";
import { Link, useLocation } from "wouter";
import AuthLayout from "@/components/AuthLayout";
import SignupForm from "@/components/SignupForm";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect } from "react";

export default function Signup() {
  const [, navigate] = useLocation();
  const auth = useAuth();

  useEffect(() => {
    if (auth.user) navigate("/");
  }, [auth.user, navigate]);

  return (
    <AuthLayout>
      <span className="eyebrow"><UserPlus size={14} /> NOVA CONTA</span>
      <h2>Criar sua conta</h2>
      <p className="login-subtitle">Comece a trabalhar sozinho agora. Depois você pode criar uma empresa ou entrar na equipe de alguém por convite.</p>
      <SignupForm onDone={() => navigate("/")} />
      <p className="login-switch">Já tem conta? <Link href="/">Entrar</Link></p>
    </AuthLayout>
  );
}
