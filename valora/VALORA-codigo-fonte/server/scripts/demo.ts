/**
 * Cria (ou recria) um banco de demonstração com uma conta para cada cargo,
 * clientes em todas as etapas do pipeline, metas, cobranças, avaliações,
 * casos técnicos e um pedido de promoção em andamento.
 *
 *   pnpm demo [--arquivo contas-demo.txt]
 *
 * Todas as contas usam o domínio @banco-demo.com.br e a mesma senha, gravada no
 * arquivo indicado (nunca impressa no terminal). Rodar de novo apaga e recria tudo.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { nanoid } from "nanoid";
import { inArray, like } from "drizzle-orm";
import {
  agencies, clientRecords, companies, companyMembers, companyPositions, companySettings, notifications,
  promotionRequests, recordNotes, teams, userGoals, userProfiles, users, companyProducts, customers, type CompanyRole,
} from "../../drizzle/schema";
import { templateByKey, type ProductConfig } from "@shared/pipeline";
import { getDb } from "../db";
import { hashPassword } from "../_core/password";

const DOMAIN = "banco-demo.com.br";
const COMPANY = "Banco Exemplo S.A.";

type Person = { key: string; name: string; email: string; role: CompanyRole; agency: "centro" | "norte" | null; team: "azul" | "verde" | "sol" | null; position: string; job: string };

const PEOPLE: Person[] = [
  { key: "admin", name: "Roberto Almeida", email: `diretoria@${DOMAIN}`, role: "admin", agency: null, team: null, position: "Diretor", job: "Diretor comercial" },
  { key: "gerCentro", name: "Fernanda Lima", email: `gerente.centro@${DOMAIN}`, role: "manager", agency: "centro", team: null, position: "Gerente de agência", job: "Gerente da Agência Centro" },
  { key: "gerNorte", name: "Paulo Souza", email: `gerente.norte@${DOMAIN}`, role: "manager", agency: "norte", team: null, position: "Gerente de agência", job: "Gerente da Agência Norte" },
  { key: "liderAzul", name: "Carla Mendes", email: `lider.azul@${DOMAIN}`, role: "leader", agency: "centro", team: "azul", position: "Supervisor", job: "Supervisora da Equipe Azul" },
  { key: "liderVerde", name: "Diego Rocha", email: `lider.verde@${DOMAIN}`, role: "leader", agency: "centro", team: "verde", position: "Supervisor", job: "Supervisor da Equipe Verde" },
  { key: "liderSol", name: "Juliana Prado", email: `lider.sol@${DOMAIN}`, role: "leader", agency: "norte", team: "sol", position: "Supervisor", job: "Supervisora da Equipe Sol" },
  { key: "bruno", name: "Bruno Costa", email: `usuario@${DOMAIN}`, role: "member", agency: "centro", team: "azul", position: "Atendente", job: "Atendente de crédito" },
  { key: "aline", name: "Aline Santos", email: `aline.santos@${DOMAIN}`, role: "member", agency: "centro", team: "azul", position: "Consultor Sênior", job: "Consultora sênior" },
  { key: "marcos", name: "Marcos Vieira", email: `marcos.vieira@${DOMAIN}`, role: "member", agency: "centro", team: "verde", position: "Atendente", job: "Atendente de crédito" },
  { key: "patricia", name: "Patrícia Gomes", email: `patricia.gomes@${DOMAIN}`, role: "member", agency: "centro", team: "verde", position: "Atendente", job: "Atendente de crédito" },
  { key: "rafael", name: "Rafael Nunes", email: `rafael.nunes@${DOMAIN}`, role: "member", agency: "norte", team: "sol", position: "Atendente", job: "Corretor de seguros" },
  { key: "sofia", name: "Sofia Martins", email: `sofia.martins@${DOMAIN}`, role: "member", agency: "norte", team: "sol", position: "Consultor Sênior", job: "Corretora sênior de seguros" },
];

const CLIENT_NAMES = [
  "Antônio Pereira", "Beatriz Oliveira", "Carlos Eduardo Silva", "Daniela Ramos", "Eduardo Fernandes", "Fabiana Teixeira", "Gustavo Barbosa",
  "Helena Cardoso", "Igor Moreira", "Joana Ribeiro", "Lucas Azevedo", "Mariana Castro", "Nelson Araújo", "Olívia Monteiro", "Pedro Henrique Lopes",
  "Raquel Duarte", "Sérgio Batista", "Tatiane Freitas", "Vinícius Correia", "Yasmin Rezende", "Wagner Pinto", "Larissa Campos", "Otávio Farias",
  "Priscila Moura", "Renato Siqueira", "Simone Vasconcelos", "Thiago Brandão", "Úrsula Medeiros", "Valéria Nogueira", "Zeca Andrade",
];
// Agência Centro vende crédito; Agência Norte vende seguros (cada agência tem o seu produto e pipeline).
const AGENCY_PRODUCTS = {
  centro: { name: "Crédito consignado", template: "credito" },
  norte: { name: "Seguros", template: "seguros" },
} as const;
const SOLD_ITEMS = {
  centro: ["Consignado INSS", "Empréstimo pessoal", "Cartão consignado", "Portabilidade", "Refinanciamento"],
  norte: ["Seguro auto", "Seguro de vida", "Seguro residencial"],
};
const CLASSES: Record<string, string> = {
  "Consignado INSS": "Empréstimo consignado", "Empréstimo pessoal": "Empréstimo pessoal", "Cartão consignado": "Cartão consignado / saque",
  Portabilidade: "Refinanciamento / portabilidade", Refinanciamento: "Refinanciamento / portabilidade",
};
const STREETS = ["Rua das Flores", "Av. Paulista", "Rua XV de Novembro", "Rua da Consolação", "Av. Brasil", "Rua Augusta", "Rua Oscar Freire"];
const DISTRICTS = ["Centro", "Bela Vista", "Jardins", "Pinheiros", "Moema", "Santana", "Tatuapé"];

// Deterministic pseudo-random numbers so every run builds the same story.
let seed = 42;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
const iso = (daysAgo: number) => { const date = new Date(); date.setDate(date.getDate() - daysAgo); return date.toISOString().slice(0, 10); };
const phone = () => `(11) 9${Math.floor(1000 + rand() * 8999)}-${Math.floor(1000 + rand() * 8999)}`;

/** `open` is the position among the product's "em andamento" stages; reasons are product reason keys. */
type RecordPlan = { kind: "won" | "lost" | "open"; open?: number; reason?: { centro: string; norte: string }; followUp?: number | null };
const PLANS: RecordPlan[] = [
  { kind: "won" }, { kind: "won" },
  { kind: "open", open: 2, followUp: 2 }, { kind: "open", open: 1, followUp: 0 },
  { kind: "open", open: 0, followUp: null }, { kind: "open", open: 3, followUp: 6 },
  { kind: "lost", reason: { centro: "rate", norte: "preco" } }, { kind: "lost", reason: { centro: "thinking", norte: "vai_pensar" }, followUp: -2 },
  { kind: "open", open: 1, reason: { centro: "later", norte: "retornar" }, followUp: null }, { kind: "open", open: 2, followUp: -1 },
];

function stageFor(config: ProductConfig, plan: RecordPlan) {
  if (plan.kind !== "open") return config.stages.find((stage) => stage.kind === plan.kind)!;
  const open = config.stages.filter((stage) => stage.kind === "open");
  return open[Math.min(plan.open ?? 0, open.length - 1)];
}

async function main() {
  const { values } = parseArgs({ options: { arquivo: { type: "string" } } });
  const outFile = resolve(values.arquivo ?? "contas-demo.txt");
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL não está definido no .env.");

  // 1. Remove a demonstração anterior.
  const oldUsers = await db.select({ openId: users.openId }).from(users).where(like(users.email, `%@${DOMAIN}`));
  const oldIds = oldUsers.map((row) => row.openId);
  if (oldIds.length) {
    const oldMembers = await db.select({ companyId: companyMembers.companyId }).from(companyMembers).where(inArray(companyMembers.userOpenId, oldIds));
    const companyIds = Array.from(new Set(oldMembers.map((row) => row.companyId)));
    const oldRecords = await db.select({ id: clientRecords.id }).from(clientRecords).where(inArray(clientRecords.ownerOpenId, oldIds));
    if (oldRecords.length) await db.delete(recordNotes).where(inArray(recordNotes.recordId, oldRecords.map((row) => row.id)));
    await db.delete(clientRecords).where(inArray(clientRecords.ownerOpenId, oldIds));
    await db.delete(notifications).where(inArray(notifications.userOpenId, oldIds));
    await db.delete(userGoals).where(inArray(userGoals.ownerOpenId, oldIds));
    await db.delete(userProfiles).where(inArray(userProfiles.ownerOpenId, oldIds));
    await db.delete(customers).where(inArray(customers.ownerOpenId, oldIds));
    if (companyIds.length) {
      await db.delete(companyProducts).where(inArray(companyProducts.companyId, companyIds));
      for (const table of [promotionRequests, companyPositions, companyMembers, teams, agencies] as const) await db.delete(table).where(inArray(table.companyId, companyIds));
      await db.delete(companySettings).where(inArray(companySettings.companyId, companyIds));
      await db.delete(companies).where(inArray(companies.id, companyIds));
    }
    await db.delete(users).where(inArray(users.openId, oldIds));
  }

  // 2. Contas.
  const password = `Demo${randomBytes(4).toString("hex")}9`;
  const passwordHash = await hashPassword(password);
  const ids = Object.fromEntries(PEOPLE.map((person) => [person.key, nanoid()])) as Record<string, string>;
  await db.insert(users).values(PEOPLE.map((person) => ({ openId: ids[person.key], name: person.name, email: person.email, passwordHash, role: "user" as const, loginMethod: "password", isActive: true, emailVerifiedAt: new Date() })));
  await db.insert(userProfiles).values(PEOPLE.map((person) => ({ ownerOpenId: ids[person.key], displayName: person.name, jobTitle: person.job })));

  // 3. Empresa, agências, equipes, cargos.
  const [company] = await db.insert(companies).values({ name: COMPANY, createdByOpenId: ids.admin }).$returningId();
  await db.insert(companySettings).values({ companyId: company.id, displayName: "Banco Exemplo", roleLabels: JSON.stringify({ leader: "Supervisor de equipe" }), stageLabels: "{}" });
  const productOf = {} as Record<"centro" | "norte", { id: number; config: ProductConfig }>;
  for (const [index, key] of (["centro", "norte"] as const).entries()) {
    const template = templateByKey(AGENCY_PRODUCTS[key].template);
    const [row] = await db.insert(companyProducts).values({ companyId: company.id, name: AGENCY_PRODUCTS[key].name, template: template.key, color: template.color, config: JSON.stringify(template.config), sortOrder: index }).$returningId();
    productOf[key] = { id: row.id, config: template.config };
  }
  const [centro] = await db.insert(agencies).values({ companyId: company.id, name: "Agência Centro", productId: productOf.centro.id }).$returningId();
  const [norte] = await db.insert(agencies).values({ companyId: company.id, name: "Agência Norte", productId: productOf.norte.id }).$returningId();
  const agencyId = { centro: centro.id, norte: norte.id };
  const [azul] = await db.insert(teams).values({ companyId: company.id, agencyId: centro.id, name: "Equipe Azul" }).$returningId();
  const [verde] = await db.insert(teams).values({ companyId: company.id, agencyId: centro.id, name: "Equipe Verde" }).$returningId();
  const [sol] = await db.insert(teams).values({ companyId: company.id, agencyId: norte.id, name: "Equipe Sol" }).$returningId();
  const teamId = { azul: azul.id, verde: verde.id, sol: sol.id };
  const positionDefs: [string, CompanyRole][] = [["Atendente", "member"], ["Consultor Sênior", "member"], ["Supervisor", "leader"], ["Gerente de agência", "manager"], ["Diretor", "admin"]];
  const positionId: Record<string, number> = {};
  for (const [index, [name, level]] of positionDefs.entries()) {
    const [row] = await db.insert(companyPositions).values({ companyId: company.id, name, level, sortOrder: index }).$returningId();
    positionId[name] = row.id;
  }
  await db.insert(companyMembers).values(PEOPLE.map((person) => ({
    companyId: company.id, userOpenId: ids[person.key], role: person.role, positionId: positionId[person.position],
    agencyId: person.agency ? agencyId[person.agency] : null, teamId: person.team ? teamId[person.team] : null,
  })));
  await db.insert(userGoals).values(PEOPLE.filter((person) => person.role === "member" || person.role === "leader").map((person) => ({
    ownerOpenId: ids[person.key], monthlyContactTarget: person.role === "leader" ? 25 : 40, monthlySaleTarget: person.role === "leader" ? 5 : 8,
  })));

  // 4. Atendimentos de quem atende (usuários e líderes).
  let reference = 1000;
  let clientIndex = 0;
  const recordIds: Record<string, number[]> = {};
  for (const person of PEOPLE.filter((item) => item.role === "member" || item.role === "leader")) {
    const plans = person.role === "leader" ? PLANS.slice(0, 5) : [...PLANS, ...PLANS.slice(0, 2 + Math.floor(rand() * 3))];
    recordIds[person.key] = [];
    const agency = person.agency ?? "centro";
    const product = productOf[agency];
    for (const [index, plan] of plans.entries()) {
      const daysAgo = index < 3 ? Math.floor(rand() * 4) : 3 + Math.floor(rand() * 28);
      const technical = agency === "centro" && person.role === "member" && index === 4;
      const stage = technical ? product.config.stages.find((item) => item.kind === "handoff")! : stageFor(product.config, plan);
      const item = stage.kind === "won" ? pick(SOLD_ITEMS[agency]) : null;
      const reason = plan.reason?.[agency] ?? (stage.key === "awaiting_limit" ? "no_limit" : null);
      const fields: Record<string, string> = agency === "centro"
        ? {
            limite: stage.key === "awaiting_limit" ? "Não tem limite" : stage.kind === "won" ? "Sim, tem limite" : pick(["Sim, tem limite", "Ainda não verificado"]),
            cliente_banco: pick(["Sim, já é cliente", "Ainda não é cliente", "Não informado"]),
            ...(stage.key === "awaiting_limit" ? { interesse_sem_limite: "sim" } : {}),
            ...(item ? { classe: CLASSES[item] } : {}),
          }
        : {
            tipo_seguro: item ? item.replace("Seguro ", "").replace(/^./, (letter) => letter.toUpperCase()) : pick(["Auto", "Vida", "Residencial"]),
            premio: String(Math.round(800 + rand() * 4200)),
            ...(rand() > 0.5 ? { vencimento: iso(-Math.floor(rand() * 60)) } : {}),
          };
      const name = CLIENT_NAMES[clientIndex++ % CLIENT_NAMES.length];
      const contact = phone();
      // Os primeiros clientes de cada pessoa já estão cadastrados (Clientes cadastrados).
      const customerId = index < 4
        ? (await db.insert(customers).values({
            ownerOpenId: ids[person.key], name, phone: contact, email: `${name.split(" ")[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}@exemplo.com.br`,
            address: `${pick(STREETS)}, ${100 + Math.floor(rand() * 1900)}`, district: pick(DISTRICTS), city: "São Paulo", state: "SP",
            zip: `0${Math.floor(1000 + rand() * 8999)}-${Math.floor(100 + rand() * 899)}`,
            birthDate: iso(365 * (25 + Math.floor(rand() * 40))), notes: index === 0 ? "Prefere contato por WhatsApp à tarde." : null,
          }).$returningId())[0].id
        : null;
      const [row] = await db.insert(clientRecords).values({
        ownerOpenId: ids[person.key], reference: `VLR-DEMO-${reference++}`, name, contact, contactDate: iso(daysAgo),
        saleStatus: stage.kind === "won" ? "sold" : stage.kind === "lost" ? "not_sold" : "pending", lastProductSold: item,
        objection: reason, objectionNotes: reason === "thinking" || reason === "vai_pensar" ? "Vai conversar com a família antes de decidir." : null,
        stage: stage.key, productId: product.id, customerId, customFields: JSON.stringify(fields),
        followUpDate: plan.followUp === undefined || plan.followUp === null ? null : iso(-plan.followUp),
      }).$returningId();
      recordIds[person.key].push(row.id);
    }
  }

  // 5. Cobranças, avaliações e respostas.
  const note = async (recordId: number, author: string, kind: "cobranca" | "avaliacao" | "comentario", body: string, rating: number | null = null) => {
    await db.insert(recordNotes).values({ recordId, authorOpenId: ids[author], kind, rating, body });
  };
  await note(recordIds.bruno[3], "liderAzul", "cobranca", "Bruno, o retorno deste cliente era para hoje. Já ligou? Atualize o atendimento, por favor.");
  await note(recordIds.bruno[3], "bruno", "comentario", "Liguei agora há pouco, ele pediu para retornar amanhã de manhã.");
  await note(recordIds.bruno[0], "gerCentro", "avaliacao", "Ótima condução da venda e documentação completa.", 5);
  await note(recordIds.aline[0], "liderAzul", "avaliacao", "Venda bem feita. Lembre de oferecer o seguro junto.", 4);
  await note(recordIds.marcos[2], "liderVerde", "cobranca", "Marcos, essa negociação está parada. Qual o próximo passo?");
  await note(recordIds.patricia[1], "gerCentro", "avaliacao", "Bom atendimento, mas faltou registrar o produto com detalhes.", 3);
  await note(recordIds.rafael[0], "liderSol", "avaliacao", "Excelente! Cliente elogiou o atendimento.", 5);
  await note(recordIds.sofia[9] ?? recordIds.sofia[0], "gerNorte", "cobranca", "Sofia, retorno atrasado. Me avise quando falar com o cliente.");

  // 6. Pedido de promoção em andamento (líder → gerente) e um histórico aprovado.
  await db.insert(promotionRequests).values([
    { companyId: company.id, targetOpenId: ids.bruno, requestedByOpenId: ids.liderAzul, toPositionId: positionId["Consultor Sênior"], reason: "Bruno bateu a meta de vendas nos últimos 3 meses e ajuda os colegas novos.", raiseNote: "Reajuste de 10%", status: "pending_manager" },
    { companyId: company.id, targetOpenId: ids.aline, requestedByOpenId: ids.liderAzul, toPositionId: positionId["Consultor Sênior"], reason: "Aline é referência em consignado na agência.", raiseNote: "Nova faixa salarial", status: "approved", managerOpenId: ids.gerCentro, managerNote: "De acordo.", managerAt: new Date(Date.now() - 20 * 86_400_000), adminOpenId: ids.admin, adminNote: "Aprovado. Parabéns!", adminAt: new Date(Date.now() - 18 * 86_400_000) },
  ]);

  // 7. Avisos no sino.
  await db.insert(notifications).values([
    { userOpenId: ids.bruno, title: "Carla Mendes cobrou o atendimento de " + CLIENT_NAMES[3], body: "Bruno, o retorno deste cliente era para hoje. Já ligou?", link: `/?atendimento=${recordIds.bruno[3]}` },
    { userOpenId: ids.bruno, title: "Fernanda Lima avaliou o atendimento de " + CLIENT_NAMES[0] + ": ★★★★★", body: "Ótima condução da venda e documentação completa.", link: `/?atendimento=${recordIds.bruno[0]}` },
    { userOpenId: ids.gerCentro, title: "Pedido de promoção: Bruno Costa para Consultor Sênior", body: "Bruno bateu a meta de vendas nos últimos 3 meses e ajuda os colegas novos.", link: "/?tela=promocoes" },
    { userOpenId: ids.liderAzul, title: "Bruno Costa respondeu sobre " + CLIENT_NAMES[3], body: "Liguei agora há pouco, ele pediu para retornar amanhã de manhã.", link: `/?atendimento=${recordIds.bruno[3]}` },
  ]);

  // 8. Arquivo com as contas (a senha não aparece no terminal).
  const lines = [
    "CONTAS DE DEMONSTRAÇÃO DO VALORA — Banco Exemplo S.A.",
    "Uso local, para conhecer a tela de cada cargo. Todas usam a mesma senha.",
    "",
    `Endereço: http://localhost:3000`,
    `Senha (todas as contas): ${password}`,
    "",
    ...PEOPLE.map((person) => `${person.position.padEnd(20)} ${person.name.padEnd(17)} ${person.email}`),
    "",
    "Sugestões para explorar:",
    "  diretoria@...       → Agências (clique numa agência), Promoções, Minha empresa, Personalizar",
    "  gerente.centro@...  → Minha agência, Pipeline da agência, pedido de promoção do Bruno para aprovar",
    "  lider.azul@...      → Minha equipe (peça promoções), Pipeline da equipe, cobrar e avaliar atendimentos",
    "  usuario@...         → os próprios atendimentos, lembretes no sino e cobranças da liderança",
    "",
    "Para recriar tudo do zero: pnpm demo",
  ];
  writeFileSync(outFile, `﻿${lines.join("\r\n")}\r\n`, "utf8");
  console.log(`Demonstração criada: ${PEOPLE.length} contas e ${Object.values(recordIds).flat().length} atendimentos.`);
  console.log(`Logins e senha gravados em: ${outFile}`);
}

main().then(() => process.exit(0)).catch((error) => { console.error("Erro:", error instanceof Error ? error.message : error); process.exit(1); });
