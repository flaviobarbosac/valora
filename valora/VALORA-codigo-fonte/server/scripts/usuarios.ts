/**
 * Gerenciamento de usuários do VALORA pela linha de comando. As pessoas são
 * identificadas pelo e-mail (o mesmo usado para entrar no app).
 *
 *   pnpm usuarios criar --email maria@banco.com --nome "Maria Silva" [--super-admin]
 *   pnpm usuarios promover --email maria@banco.com     (vira super administrador)
 *   pnpm usuarios rebaixar --email maria@banco.com     (volta a usuário comum)
 *   pnpm usuarios senha --email maria@banco.com
 *   pnpm usuarios desativar --email maria@banco.com
 *   pnpm usuarios ativar --email maria@banco.com
 *   pnpm usuarios listar
 *   pnpm usuarios definir-email --open-id <openId> --email maria@banco.com
 *   pnpm usuarios confirmar-email --email maria@banco.com   (libera quem não recebeu o código)
 *
 * Contas antigas, criadas antes do login por e-mail, também podem ser
 * encontradas com --agencia e --usuario (ex.: para definir o e-mail delas).
 * A senha é pedida no terminal (não aparece na tela nem fica no histórico).
 */
import "dotenv/config";
import { nanoid } from "nanoid";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { normalizeEmail, normalizeLoginId } from "@shared/const";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { getUserByEmail } from "../orgDb";
import { hashPassword, passwordPolicyError } from "../_core/password";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(message: string): never {
  console.error(`Erro: ${message}`);
  process.exit(1);
}

function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) fail("execute este comando em um terminal interativo para digitar a senha.");
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (text: string) => void };
    let prompted = false;
    output._writeToOutput = (text: string) => {
      if (!prompted) { process.stdout.write(text); prompted = true; }
      else if (text.includes("\n") || text.includes("\r")) process.stdout.write("\n");
      else process.stdout.write("*".repeat(text.length));
    };
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}

async function askNewPassword() {
  const password = await askHidden("Nova senha: ");
  const policyError = passwordPolicyError(password);
  if (policyError) fail(policyError);
  const confirmation = await askHidden("Repita a senha: ");
  if (password !== confirmation) fail("as senhas não conferem.");
  return hashPassword(password);
}

function emailFrom(value: string | undefined) {
  const email = normalizeEmail(value ?? "");
  if (!EMAIL_PATTERN.test(email)) fail("informe um --email válido.");
  return email;
}

type Values = { email?: string; agencia?: string; banco?: string; usuario?: string; "open-id"?: string };

/** Finds a person by --email, by --open-id, or (older accounts) by --agencia + --usuario. */
async function requireUser(values: Values): Promise<User> {
  let user: User | undefined;
  if (values["open-id"]) user = await db.getUserByOpenId(values["open-id"].trim());
  else if (values.agencia || values.banco || values.usuario) {
    user = await db.getUserByLogin(normalizeLoginId(values.agencia ?? values.banco ?? ""), normalizeLoginId(values.usuario ?? ""));
  } else user = await getUserByEmail(emailFrom(values.email));
  if (!user) fail("usuário não encontrado. Confira com: pnpm usuarios listar");
  return user;
}

async function main() {
  if (!process.env.DATABASE_URL) fail("DATABASE_URL não está definido no .env.");
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      email: { type: "string" },
      nome: { type: "string" },
      agencia: { type: "string" },
      banco: { type: "string" },
      usuario: { type: "string" },
      admin: { type: "boolean", default: false },
      "super-admin": { type: "boolean", default: false },
      "open-id": { type: "string" },
    },
  });
  const command = positionals[0];

  switch (command) {
    case "criar": {
      const email = emailFrom(values.email);
      if (await getUserByEmail(email)) fail(`já existe uma conta com o e-mail ${email}.`);
      const name = values.nome?.trim() || email.split("@")[0];
      const superAdmin = values["super-admin"] || values.admin;
      const passwordHash = await askNewPassword();
      // Created by whoever runs the server, who vouches for the e-mail.
      await db.createUser({ openId: nanoid(), agencyCode: null, username: null, passwordHash, name, email, role: superAdmin ? "super_admin" : "user", emailVerified: true });
      console.log(`Usuário criado: ${email} (${name})${superAdmin ? " como super administrador" : ""}.`);
      break;
    }
    case "senha": {
      const user = await requireUser(values);
      await db.setUserPassword(user.openId, await askNewPassword());
      console.log("Senha alterada. As sessões abertas desse usuário foram encerradas.");
      break;
    }
    case "promover":
    case "rebaixar": {
      const user = await requireUser(values);
      await db.setUserRole(user.openId, command === "promover" ? "super_admin" : "user");
      console.log(command === "promover" ? "Agora é super administrador." : "Agora é usuário comum.");
      break;
    }
    case "desativar":
    case "ativar": {
      const user = await requireUser(values);
      await db.setUserActive(user.openId, command === "ativar");
      console.log(command === "ativar" ? "Usuário reativado." : "Usuário desativado. Ele não consegue mais entrar.");
      break;
    }
    case "definir-email": {
      const { email: newEmail, ...lookup } = values;
      if (!lookup["open-id"] && !lookup.agencia && !lookup.banco && !lookup.usuario) fail("informe --open-id (ou --agencia e --usuario) para achar a conta.");
      const user = await requireUser(lookup);
      const email = emailFrom(newEmail);
      const owner = await getUserByEmail(email);
      if (owner && owner.openId !== user.openId) fail(`o e-mail ${email} já pertence a outra conta.`);
      await db.setUserEmail(user.openId, email);
      console.log(`${user.name ?? user.openId} agora entra com ${email}.`);
      break;
    }
    case "confirmar-email": {
      const user = await requireUser(values);
      if (user.emailVerifiedAt) { console.log("Esse e-mail já estava confirmado."); break; }
      await db.markEmailVerified(user.openId);
      console.log(`E-mail de ${user.email ?? user.openId} confirmado. A pessoa já pode entrar.`);
      break;
    }
    case "listar": {
      const rows = await db.listUsers();
      if (!rows.length) { console.log("Nenhum usuário cadastrado."); break; }
      console.table(rows.map((user) => ({
        email: user.email ?? "(sem e-mail: não consegue entrar)",
        nome: user.name ?? "",
        perfil: user.role === "super_admin" ? "super admin" : "usuário",
        ativo: user.isActive && Boolean(user.passwordHash) && Boolean(user.email) ? "sim" : "não",
        "e-mail confirmado": user.emailVerifiedAt ? "sim" : "não",
        openId: user.openId,
      })));
      break;
    }
    default:
      console.log("Comandos: criar, senha, promover, rebaixar, ativar, desativar, definir-email, confirmar-email, listar. Veja o README para exemplos.");
      process.exit(command ? 1 : 0);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => fail(error instanceof Error ? error.message : String(error)));
