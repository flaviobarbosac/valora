import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  agencies, clientRecords, companyProducts, companySettings, customers, userProfiles, userSettings, users,
  type CompanyMember, type CompanyProduct,
} from "../drizzle/schema";
import { normalizePrefs, parseProductConfig, templateByKey, type ProductConfig, type WorkspacePrefs } from "@shared/pipeline";
import { getDb } from "./db";
import { getMembership } from "./orgDb";

async function db() {
  const conn = await getDb();
  if (!conn) throw new Error("Database is not available");
  return conn;
}

/**
 * The "espaço" a person works in: their company, or just themselves when they
 * work on their own. Products (pipelines) and preferences belong to it.
 */
export type Workspace =
  | { kind: "company"; companyId: number; member: CompanyMember }
  | { kind: "personal"; ownerOpenId: string };

export async function workspaceOf(openId: string): Promise<Workspace> {
  const member = await getMembership(openId);
  return member ? { kind: "company", companyId: member.companyId, member } : { kind: "personal", ownerOpenId: openId };
}

/** Company administrators shape the company's pipelines; independents shape their own. */
export const canEditWorkspace = (space: Workspace) => space.kind === "personal" || space.member.role === "admin";

const scopeWhere = (space: Workspace) =>
  space.kind === "company" ? eq(companyProducts.companyId, space.companyId) : and(isNull(companyProducts.companyId), eq(companyProducts.ownerOpenId, space.ownerOpenId));

export type Product = Omit<CompanyProduct, "config"> & { config: ProductConfig };
const toProduct = (row: CompanyProduct): Product => ({ ...row, config: parseProductConfig(row.config, row.template) });

export async function listProducts(space: Workspace): Promise<Product[]> {
  const rows = await (await db()).select().from(companyProducts).where(scopeWhere(space)).orderBy(asc(companyProducts.sortOrder), asc(companyProducts.id));
  return rows.map(toProduct);
}

export async function getProductsByIds(ids: number[]): Promise<Product[]> {
  if (!ids.length) return [];
  const rows = await (await db()).select().from(companyProducts).where(inArray(companyProducts.id, ids));
  return rows.map(toProduct);
}

/** A product of this workspace (never another company's). */
export async function getWorkspaceProduct(space: Workspace, id: number) {
  const [row] = await (await db()).select().from(companyProducts).where(and(eq(companyProducts.id, id), scopeWhere(space))).limit(1);
  return row ? toProduct(row) : undefined;
}

export async function createProduct(space: Workspace, values: { name: string; template: string; color: string | null; config?: ProductConfig }) {
  const conn = await db();
  const [{ count }] = await conn.select({ count: sql<number>`COUNT(*)` }).from(companyProducts).where(scopeWhere(space));
  const config = values.config ?? templateByKey(values.template).config;
  const [result] = await conn.insert(companyProducts).values({
    companyId: space.kind === "company" ? space.companyId : null,
    ownerOpenId: space.kind === "personal" ? space.ownerOpenId : null,
    name: values.name, template: values.template, color: values.color, config: JSON.stringify(config), sortOrder: Number(count),
  }).$returningId();
  return result.id;
}

export async function updateProduct(space: Workspace, id: number, values: { name: string; color: string | null; config: ProductConfig }) {
  await (await db()).update(companyProducts).set({ name: values.name, color: values.color, config: JSON.stringify(values.config) })
    .where(and(eq(companyProducts.id, id), scopeWhere(space)));
}

export async function deleteProduct(space: Workspace, id: number) {
  await (await db()).delete(companyProducts).where(and(eq(companyProducts.id, id), scopeWhere(space)));
}

/** Records per stage of a product: stages in use cannot be removed or change kind. */
export async function stageUsage(productId: number) {
  const rows = await (await db()).select({ stage: clientRecords.stage, count: sql<number>`COUNT(*)` }).from(clientRecords)
    .where(eq(clientRecords.productId, productId)).groupBy(clientRecords.stage);
  return new Map(rows.map((row) => [row.stage, Number(row.count)]));
}

/** Products used by the records of these owners (to draw a colleague's older pipeline). */
export async function productIdsOfOwners(ownerOpenIds: string[]) {
  if (!ownerOpenIds.length) return [];
  const rows = await (await db()).selectDistinct({ productId: clientRecords.productId }).from(clientRecords).where(inArray(clientRecords.ownerOpenId, ownerOpenIds));
  return rows.map((row) => row.productId).filter((id): id is number => id !== null);
}

export async function productUsage(productId: number) {
  const conn = await db();
  const [[records], [agencyRows]] = await Promise.all([
    conn.select({ count: sql<number>`COUNT(*)` }).from(clientRecords).where(eq(clientRecords.productId, productId)),
    conn.select({ count: sql<number>`COUNT(*)` }).from(agencies).where(eq(agencies.productId, productId)),
  ]);
  return { records: Number(records.count), agencies: Number(agencyRows.count) };
}

/**
 * The product whose pipeline a person works with: their agency's product,
 * else the first product of the company (or of the independent person).
 * With `create`, a workspace with no product gets one from the basic template.
 */
export async function productForUser(openId: string, create = false): Promise<Product | undefined> {
  const space = await workspaceOf(openId);
  if (space.kind === "company" && space.member.agencyId) {
    const [agency] = await (await db()).select({ productId: agencies.productId }).from(agencies).where(eq(agencies.id, space.member.agencyId)).limit(1);
    const product = agency?.productId ? await getWorkspaceProduct(space, agency.productId) : undefined;
    if (product) return product;
  }
  const [first] = await listProducts(space);
  if (first || !create) return first;
  const template = templateByKey(null);
  const id = await createProduct(space, { name: template.name, template: template.key, color: template.color });
  return getWorkspaceProduct(space, id);
}

// ---------- Preferências ----------

export async function getPrefs(space: Workspace): Promise<WorkspacePrefs> {
  const conn = await db();
  const raw = space.kind === "company"
    ? (await conn.select({ prefs: companySettings.prefs }).from(companySettings).where(eq(companySettings.companyId, space.companyId)).limit(1))[0]?.prefs
    : (await conn.select({ prefs: userSettings.prefs }).from(userSettings).where(eq(userSettings.ownerOpenId, space.ownerOpenId)).limit(1))[0]?.prefs;
  try {
    return normalizePrefs(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizePrefs({});
  }
}

export async function savePrefs(space: Workspace, prefs: WorkspacePrefs) {
  const conn = await db();
  const value = JSON.stringify(prefs);
  if (space.kind === "company") await conn.insert(companySettings).values({ companyId: space.companyId, prefs: value }).onDuplicateKeyUpdate({ set: { prefs: value } });
  else await conn.insert(userSettings).values({ ownerOpenId: space.ownerOpenId, prefs: value }).onDuplicateKeyUpdate({ set: { prefs: value } });
}

// ---------- Clientes cadastrados ----------

export type CustomerValues = Omit<typeof customers.$inferInsert, "id" | "ownerOpenId" | "createdAt" | "updatedAt">;

export async function listCustomers(ownerOpenIds: string[]) {
  if (!ownerOpenIds.length) return [];
  const conn = await db();
  const joined = await conn.select({ customer: customers, ownerUserName: users.name, ownerDisplayName: userProfiles.displayName }).from(customers)
    .leftJoin(users, eq(users.openId, customers.ownerOpenId))
    .leftJoin(userProfiles, eq(userProfiles.ownerOpenId, customers.ownerOpenId))
    .where(inArray(customers.ownerOpenId, ownerOpenIds)).orderBy(asc(customers.name));
  const rows = joined.map(({ customer, ownerUserName, ownerDisplayName }) => ({ ...customer, ownerName: ownerDisplayName || ownerUserName || "Sem nome" }));
  const counts = rows.length
    ? await conn.select({ customerId: clientRecords.customerId, count: sql<number>`COUNT(*)` }).from(clientRecords)
      .where(inArray(clientRecords.customerId, rows.map((row) => row.id))).groupBy(clientRecords.customerId)
    : [];
  return rows.map((row) => ({ ...row, dealCount: Number(counts.find((item) => item.customerId === row.id)?.count ?? 0) }));
}

export async function getCustomer(id: number) {
  const [row] = await (await db()).select().from(customers).where(eq(customers.id, id)).limit(1);
  return row;
}

export async function createCustomer(ownerOpenId: string, values: CustomerValues) {
  const [result] = await (await db()).insert(customers).values({ ...values, ownerOpenId }).$returningId();
  return result.id;
}

export async function updateCustomer(ownerOpenId: string, id: number, values: CustomerValues) {
  await (await db()).update(customers).set(values).where(and(eq(customers.id, id), eq(customers.ownerOpenId, ownerOpenId)));
}

/** Removes the registry entry; the atendimentos stay, just unlinked. */
export async function deleteCustomer(ownerOpenId: string, id: number) {
  const conn = await db();
  await conn.transaction(async (tx) => {
    const [row] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.id, id), eq(customers.ownerOpenId, ownerOpenId))).limit(1);
    if (!row) return;
    await tx.update(clientRecords).set({ customerId: null }).where(eq(clientRecords.customerId, id));
    await tx.delete(customers).where(eq(customers.id, id));
  });
}
