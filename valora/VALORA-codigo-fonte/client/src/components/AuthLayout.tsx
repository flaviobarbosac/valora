import type { ReactNode } from "react";
import ValoraLogo from "@/components/ValoraLogo";

/** Navy brand panel on the left, white content panel on the right (login, sign-up, invitations). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="login-screen">
      <section className="login-brand-panel" aria-hidden="true">
        <ValoraLogo variant="dark" size="large" />
        <div className="login-brand-copy">
          <h1>Clareza em cada<br /><em>oportunidade.</em></h1>
          <p>Organize atendimentos, acompanhe o próximo passo e veja seu pipeline de vendas, do jeito do seu negócio — sozinho ou com toda a sua equipe.</p>
        </div>
        <p className="login-brand-footer">VALORA <span>·</span> PIPELINE DE VENDAS</p>
      </section>
      <section className="login-form-panel">
        <div className="login-card">
          <div className="login-mobile-brand"><ValoraLogo /></div>
          {children}
        </div>
      </section>
    </main>
  );
}
