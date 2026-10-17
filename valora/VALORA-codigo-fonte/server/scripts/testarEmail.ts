/**
 * Testa o envio de e-mail (SMTP) com as configurações do .env e explica o erro, se houver.
 *
 *   pnpm email:teste --para voce@exemplo.com
 */
import "dotenv/config";
import nodemailer from "nodemailer";
import { parseArgs } from "node:util";
import { ENV } from "../_core/env";

function explain(error: unknown) {
  const info = error as { code?: string; responseCode?: number; message?: string };
  const message = info.message ?? String(error);
  if (info.responseCode === 525 || /unauthori[sz]ed ip/i.test(message)) {
    return "O provedor bloqueou o IP deste computador. No Brevo: Configurações › Segurança › IPs autorizados, adicione o IP público desta máquina (ou desative o bloqueio de IPs desconhecidos).";
  }
  if (info.code === "EAUTH" || info.responseCode === 535 || info.responseCode === 534) {
    if (/seu-login|seu-email|sua-chave/i.test(`${ENV.smtpUser} ${ENV.smtpPass}`)) {
      return "SMTP_USER ou SMTP_PASS ainda está com o texto de exemplo. Troque pelo seu login e pela sua chave de verdade.";
    }
    if (/brevo/i.test(ENV.smtpHost)) {
      return "O Brevo recusou o login. SMTP_USER deve ser o 'Login' da aba SMTP & API › SMTP (termina em @smtp-brevo.com) e SMTP_PASS a 'Chave SMTP' (xsmtpsib-...), não a chave de API nem a senha da conta.";
    }
    return "O servidor recusou o usuário ou a senha. No Gmail, use uma SENHA DE APP (16 letras, em https://myaccount.google.com/apppasswords), com a verificação em duas etapas ativa. A senha normal da conta não funciona.";
  }
  if (info.code === "ETIMEDOUT" || info.code === "ECONNECTION" || info.code === "ESOCKET" || info.code === "ECONNREFUSED") {
    return "Não foi possível conectar ao servidor de e-mail. Confira SMTP_HOST e SMTP_PORT (Gmail: smtp.gmail.com, 465 com SMTP_SECURE=true) e se o antivírus ou o firewall não bloqueiam a porta.";
  }
  if (/wrong version number|ssl/i.test(message)) {
    return "Porta e SMTP_SECURE não combinam: use 465 com SMTP_SECURE=true, ou 587 com SMTP_SECURE=false.";
  }
  if (info.code === "EENVELOPE" || info.responseCode === 553 || info.responseCode === 550) {
    return "O remetente (SMTP_FROM) ou o destinatário foi recusado. No Gmail, o SMTP_FROM deve usar o mesmo e-mail de SMTP_USER.";
  }
  return null;
}

async function main() {
  const { values } = parseArgs({ options: { para: { type: "string" } } });
  const to = values.para?.trim() || ENV.smtpUser;
  const missing = [!ENV.smtpHost && "SMTP_HOST", !ENV.smtpUser && "SMTP_USER", !ENV.smtpPass && "SMTP_PASS"].filter(Boolean);
  if (missing.length) {
    console.error(`Faltam no .env: ${missing.join(", ")}. Rode o configurar-email.ps1 ou preencha à mão.`);
    process.exit(1);
  }
  if (!to) { console.error("Informe o destinatário: pnpm email:teste --para voce@exemplo.com"); process.exit(1); }

  console.log(`Conectando a ${ENV.smtpHost}:${ENV.smtpPort} (${ENV.smtpSecure ? "SSL direto" : "STARTTLS"}) como ${ENV.smtpUser}...`);
  const transport = nodemailer.createTransport({
    host: ENV.smtpHost, port: ENV.smtpPort, secure: ENV.smtpSecure,
    auth: { user: ENV.smtpUser, pass: ENV.smtpPass },
    connectionTimeout: 15_000, greetingTimeout: 15_000,
  });
  try {
    await transport.verify();
    console.log("Conexão e login OK. Enviando e-mail de teste...");
    const info = await transport.sendMail({
      from: ENV.smtpFrom, to,
      subject: "Teste de e-mail do VALORA",
      text: "Se você recebeu esta mensagem, o envio de e-mails do VALORA está funcionando.",
    });
    console.log(`Enviado para ${to}. Resposta do servidor: ${info.response}`);
    console.log("Se não aparecer na caixa de entrada em 1 ou 2 minutos, confira o spam.");
  } catch (error) {
    console.error(`FALHOU: ${error instanceof Error ? error.message : String(error)}`);
    const hint = explain(error);
    if (hint) console.error(`Provável causa: ${hint}`);
    process.exit(1);
  }
}

void main();
