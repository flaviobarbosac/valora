import nodemailer, { type Transporter } from "nodemailer";
import { ENV } from "./env";

let transporter: Transporter | null = null;

export function isMailConfigured() {
  return Boolean(ENV.smtpHost && ENV.smtpFrom);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: ENV.smtpHost,
      port: ENV.smtpPort,
      secure: ENV.smtpSecure,
      auth: ENV.smtpUser ? { user: ENV.smtpUser, pass: ENV.smtpPass } : undefined,
    });
  }
  return transporter;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export type InviteEmail = {
  to: string;
  link: string;
  companyName: string;
  inviterName: string;
  roleLabel: string;
  placement: string | null;
  expiresAt: Date;
};

/** Sends the invitation. Returns false (never throws) when SMTP is missing or fails. */
export async function sendInviteEmail(invite: InviteEmail): Promise<boolean> {
  if (!isMailConfigured()) return false;
  const expires = invite.expiresAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const where = invite.placement ? ` (${invite.placement})` : "";
  const text = [
    `${invite.inviterName} convidou você para entrar na empresa ${invite.companyName} no VALORA como ${invite.roleLabel}${where}.`,
    "",
    `Para aceitar, abra o link: ${invite.link}`,
    "",
    `O convite vale até ${expires}. Se você não esperava este e-mail, pode ignorá-lo.`,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0f2140">
      <div style="background:#0b1f3a;padding:22px 26px;border-radius:12px 12px 0 0">
        <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:.08em">VALORA</span>
        <div style="color:#a9b8cd;font-size:10px;letter-spacing:.24em;margin-top:4px">PIPELINE BANCÁRIO</div>
      </div>
      <div style="border:1px solid #e3e8f0;border-top:0;padding:26px;border-radius:0 0 12px 12px">
        <p style="font-size:15px;margin:0 0 14px"><b>${escapeHtml(invite.inviterName)}</b> convidou você para entrar na empresa <b>${escapeHtml(invite.companyName)}</b> como <b>${escapeHtml(invite.roleLabel)}</b>${escapeHtml(where)}.</p>
        <p style="margin:24px 0"><a href="${escapeHtml(invite.link)}" style="background:#13315c;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">Aceitar convite</a></p>
        <p style="font-size:12px;color:#5d6f8a;margin:0 0 6px">Ou copie este endereço no navegador:<br><span style="word-break:break-all">${escapeHtml(invite.link)}</span></p>
        <p style="font-size:12px;color:#5d6f8a;margin:16px 0 0">O convite vale até ${expires}. Se você não esperava este e-mail, pode ignorá-lo.</p>
      </div>
    </div>`;
  try {
    await getTransporter().sendMail({
      from: ENV.smtpFrom,
      to: invite.to,
      subject: `Convite para ${invite.companyName} no VALORA`,
      text,
      html,
    });
    return true;
  } catch (error) {
    console.error("[Mail] Falha ao enviar convite:", error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Sends the 6-digit sign-up code. Returns false (never throws) when SMTP is
 * missing or fails. Without SMTP the code goes to the server log, so whoever
 * runs the app can still finish a sign-up while e-mail is being set up.
 */
export async function sendVerificationEmail(message: { to: string; name: string; code: string; validMinutes: number; purpose?: "verify" | "reset" }): Promise<boolean> {
  const reset = message.purpose === "reset";
  if (!isMailConfigured()) {
    console.warn(`[Mail] SMTP não configurado. Código ${reset ? "de nova senha" : "de verificação"} de ${message.to}: ${message.code}`);
    return false;
  }
  const firstName = message.name.trim().split(/\s+/)[0] || "Olá";
  const text = [
    reset ? `${firstName}, use este código para criar uma nova senha no VALORA:` : `${firstName}, use este código para confirmar seu e-mail no VALORA:`,
    "",
    message.code,
    "",
    `O código vale por ${message.validMinutes} minutos. ${reset ? "Se você não pediu para trocar a senha, ignore este e-mail: sua senha continua a mesma." : "Se você não criou uma conta no VALORA, ignore este e-mail."}`,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0f2140">
      <div style="background:#0b1f3a;padding:22px 26px;border-radius:12px 12px 0 0">
        <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:.08em">VALORA</span>
        <div style="color:#a9b8cd;font-size:10px;letter-spacing:.24em;margin-top:4px">PIPELINE BANCÁRIO</div>
      </div>
      <div style="border:1px solid #e3e8f0;border-top:0;padding:26px;border-radius:0 0 12px 12px">
        <p style="font-size:15px;margin:0 0 14px">${escapeHtml(firstName)}, use este código para ${reset ? "criar uma nova senha" : "confirmar seu e-mail"}:</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:.3em;margin:20px 0;color:#13315c">${escapeHtml(message.code)}</p>
        <p style="font-size:12px;color:#5d6f8a;margin:16px 0 0">O código vale por ${message.validMinutes} minutos. ${reset ? "Se você não pediu para trocar a senha, ignore este e-mail: sua senha continua a mesma." : "Se você não criou uma conta no VALORA, ignore este e-mail."}</p>
      </div>
    </div>`;
  try {
    await getTransporter().sendMail({ from: ENV.smtpFrom, to: message.to, subject: reset ? `Código para trocar sua senha do VALORA: ${message.code}` : `Seu código do VALORA: ${message.code}`, text, html });
    return true;
  } catch (error) {
    console.error("[Mail] Falha ao enviar código de verificação:", error instanceof Error ? error.message : error);
    console.warn(`[Mail] Código ${reset ? "de nova senha" : "de verificação"} de ${message.to} (não enviado): ${message.code}. Teste o SMTP com: pnpm email:teste`);
    return false;
  }
}
