import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  bugReports, clientRecords, companyMembers, companyPositions, companySettings, notifications, promotionRequests,
  recordNotes, userProfiles, users, type CompanyRole, type PromotionStatus,
} from "../drizzle/schema";
import { getDb } from "./db";

async function db() {
  const conn = await getDb();
  if (!conn) throw new Error("Database is not available");
  return conn;
}

const parseMap = (value: string | null | undefined): Record<string, string> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

// ---------- Personalização ----------

export async function getCompanySettings(companyId: number) {
  const [row] = await (await db()).select().from(companySettings).where(eq(companySettings.companyId, companyId)).limit(1);
  return {
    displayName: row?.displayName ?? null,
    primaryColor: row?.primaryColor ?? null,
    darkColor: row?.darkColor ?? null,
    accentColor: row?.accentColor ?? null,
    logoDataUrl: row?.logoDataUrl ?? null,
    roleLabels: parseMap(row?.roleLabels),
    stageLabels: parseMap(row?.stageLabels),
  };
}

export type SettingsInput = {
  displayName: string | null; primaryColor: string | null; darkColor: string | null; accentColor: string | null;
  logoDataUrl: string | null; roleLabels: Record<string, string>; stageLabels: Record<string, string>;
};

export async function saveCompanySettings(companyId: number, values: SettingsInput) {
  const row = { ...values, roleLabels: JSON.stringify(values.roleLabels), stageLabels: JSON.stringify(values.stageLabels) };
  await (await db()).insert(companySettings).values({ companyId, ...row }).onDuplicateKeyUpdate({ set: row });
}

// ---------- Cargos ----------

export async function listPositions(companyId: number) {
  return (await db()).select().from(companyPositions).where(eq(companyPositions.companyId, companyId)).orderBy(asc(companyPositions.sortOrder), asc(companyPositions.id));
}

export async function getPosition(companyId: number, id: number) {
  const [row] = await (await db()).select().from(companyPositions).where(and(eq(companyPositions.id, id), eq(companyPositions.companyId, companyId))).limit(1);
  return row;
}

export async function createPosition(companyId: number, name: string, level: CompanyRole) {
  const existing = await listPositions(companyId);
  const [result] = await (await db()).insert(companyPositions).values({ companyId, name, level, sortOrder: existing.length }).$returningId();
  return result.id;
}

export async function updatePosition(companyId: number, id: number, values: { name: string; level: CompanyRole }) {
  await (await db()).update(companyPositions).set(values).where(and(eq(companyPositions.id, id), eq(companyPositions.companyId, companyId)));
}

/** True when someone has this cargo or a pending promotion points to it. */
export async function positionInUse(companyId: number, id: number) {
  const conn = await db();
  const [member] = await conn.select({ id: companyMembers.id }).from(companyMembers).where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.positionId, id))).limit(1);
  const [request] = await conn.select({ id: promotionRequests.id }).from(promotionRequests)
    .where(and(eq(promotionRequests.companyId, companyId), eq(promotionRequests.toPositionId, id), inArray(promotionRequests.status, ["pending_manager", "pending_admin"]))).limit(1);
  return Boolean(member || request);
}

/** Returns false when someone still has this cargo or a pending promotion points to it. */
export async function deletePositionIfUnused(companyId: number, id: number) {
  if (await positionInUse(companyId, id)) return false;
  const conn = await db();
  await conn.delete(companyPositions).where(and(eq(companyPositions.id, id), eq(companyPositions.companyId, companyId)));
  return true;
}

export async function setMemberPosition(companyId: number, openId: string, positionId: number | null) {
  await (await db()).update(companyMembers).set({ positionId }).where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userOpenId, openId)));
}

// ---------- Promoções ----------

export async function createPromotionRequest(values: {
  companyId: number; targetOpenId: string; requestedByOpenId: string; toPositionId: number; reason: string; raiseNote: string | null; status: PromotionStatus;
}) {
  const [result] = await (await db()).insert(promotionRequests).values(values).$returningId();
  return result.id;
}

export async function getPromotionRequest(companyId: number, id: number) {
  const [row] = await (await db()).select().from(promotionRequests).where(and(eq(promotionRequests.id, id), eq(promotionRequests.companyId, companyId))).limit(1);
  return row;
}

export async function hasOpenPromotion(companyId: number, targetOpenId: string) {
  const [row] = await (await db()).select({ id: promotionRequests.id }).from(promotionRequests)
    .where(and(eq(promotionRequests.companyId, companyId), eq(promotionRequests.targetOpenId, targetOpenId), inArray(promotionRequests.status, ["pending_manager", "pending_admin"]))).limit(1);
  return Boolean(row);
}

export async function listPromotionRequests(companyId: number) {
  return (await db()).select().from(promotionRequests).where(eq(promotionRequests.companyId, companyId)).orderBy(desc(promotionRequests.createdAt)).limit(200);
}

export async function decidePromotion(id: number, step: "manager" | "admin", values: { status: PromotionStatus; deciderOpenId: string; note: string | null }) {
  const set = step === "manager"
    ? { status: values.status, managerOpenId: values.deciderOpenId, managerNote: values.note, managerAt: new Date() }
    : { status: values.status, adminOpenId: values.deciderOpenId, adminNote: values.note, adminAt: new Date() };
  await (await db()).update(promotionRequests).set(set).where(eq(promotionRequests.id, id));
}

/** Applies an approved promotion atomically: new cargo, permission level and placement. */
export async function applyPromotion(id: number, companyId: number, targetOpenId: string, placement: { role: CompanyRole; agencyId: number | null; teamId: number | null; positionId: number }, admin: { openId: string; note: string | null }) {
  const conn = await db();
  await conn.transaction(async (tx) => {
    await tx.update(companyMembers).set(placement).where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userOpenId, targetOpenId)));
    await tx.update(promotionRequests).set({ status: "approved", adminOpenId: admin.openId, adminNote: admin.note, adminAt: new Date() }).where(eq(promotionRequests.id, id));
  });
}

// ---------- Avaliações e cobranças ----------

export async function addRecordNote(values: { recordId: number; authorOpenId: string; kind: "cobranca" | "avaliacao" | "comentario"; rating: number | null; body: string }) {
  const [result] = await (await db()).insert(recordNotes).values(values).$returningId();
  return result.id;
}

export async function listRecordNotes(recordId: number) {
  const rows = await (await db())
    .select({ note: recordNotes, name: users.name, displayName: userProfiles.displayName, email: users.email })
    .from(recordNotes)
    .leftJoin(users, eq(users.openId, recordNotes.authorOpenId))
    .leftJoin(userProfiles, eq(userProfiles.ownerOpenId, recordNotes.authorOpenId))
    .where(eq(recordNotes.recordId, recordId))
    .orderBy(asc(recordNotes.createdAt));
  return rows.map(({ note, name, displayName, email }) => ({ ...note, authorName: displayName || name || email || "Alguém" }));
}

/** Latest rating per record, for badges on cards. */
export async function latestRatings(recordIds: number[]) {
  if (!recordIds.length) return new Map<number, number>();
  const rows = await (await db()).select({ recordId: recordNotes.recordId, rating: recordNotes.rating, createdAt: recordNotes.createdAt })
    .from(recordNotes).where(and(inArray(recordNotes.recordId, recordIds), eq(recordNotes.kind, "avaliacao"))).orderBy(asc(recordNotes.createdAt));
  const map = new Map<number, number>();
  rows.forEach((row) => { if (row.rating) map.set(row.recordId, row.rating); });
  return map;
}

export async function noteCounts(recordIds: number[]) {
  if (!recordIds.length) return new Map<number, number>();
  const rows = await (await db()).select({ recordId: recordNotes.recordId }).from(recordNotes).where(inArray(recordNotes.recordId, recordIds));
  const map = new Map<number, number>();
  rows.forEach((row) => map.set(row.recordId, (map.get(row.recordId) ?? 0) + 1));
  return map;
}

/** Average evaluation per owner in a month, for the agency panel. */
export async function averageRatingsByOwner(ownerIds: string[]) {
  if (!ownerIds.length) return new Map<string, { average: number; count: number }>();
  const rows = await (await db())
    .select({ owner: clientRecords.ownerOpenId, rating: recordNotes.rating })
    .from(recordNotes).innerJoin(clientRecords, eq(clientRecords.id, recordNotes.recordId))
    .where(and(inArray(clientRecords.ownerOpenId, ownerIds), eq(recordNotes.kind, "avaliacao")));
  const sums = new Map<string, { total: number; count: number }>();
  rows.forEach((row) => { if (!row.rating) return; const current = sums.get(row.owner) ?? { total: 0, count: 0 }; sums.set(row.owner, { total: current.total + row.rating, count: current.count + 1 }); });
  return new Map(Array.from(sums.entries()).map(([owner, value]) => [owner, { average: Math.round((value.total / value.count) * 10) / 10, count: value.count }]));
}

// ---------- Avisos ----------

export async function notify(userOpenIds: string[], values: { title: string; body?: string | null; link?: string | null }) {
  const unique = Array.from(new Set(userOpenIds.filter(Boolean)));
  if (!unique.length) return;
  await (await db()).insert(notifications).values(unique.map((userOpenId) => ({ userOpenId, title: values.title.slice(0, 200), body: values.body ?? null, link: values.link ?? null })));
}

export async function listNotifications(userOpenId: string) {
  return (await db()).select().from(notifications).where(eq(notifications.userOpenId, userOpenId)).orderBy(desc(notifications.createdAt)).limit(30);
}

export async function markNotificationsRead(userOpenId: string, ids: number[] | "all") {
  const conn = await db();
  const base = and(eq(notifications.userOpenId, userOpenId), isNull(notifications.readAt));
  await conn.update(notifications).set({ readAt: new Date() }).where(ids === "all" ? base : and(base, inArray(notifications.id, ids.length ? ids : [-1])));
}

// ---------- Relatos de erro ----------

export async function createBugReport(values: { reporterOpenId: string | null; email: string | null; category: string; description: string; pageUrl: string | null; userAgent: string | null; technicalLog: string | null }) {
  const [result] = await (await db()).insert(bugReports).values(values).$returningId();
  return result.id;
}

export async function listBugReports() {
  const rows = await (await db())
    .select({ report: bugReports, name: users.name })
    .from(bugReports).leftJoin(users, eq(users.openId, bugReports.reporterOpenId))
    .orderBy(desc(bugReports.createdAt)).limit(300);
  return rows.map(({ report, name }) => ({ ...report, reporterName: name }));
}

export async function setBugStatus(id: number, status: "new" | "in_progress" | "resolved") {
  await (await db()).update(bugReports).set({ status }).where(eq(bugReports.id, id));
}

export async function deleteCompanyFeatures(companyId: number) {
  const conn = await db();
  await conn.delete(promotionRequests).where(eq(promotionRequests.companyId, companyId));
  await conn.delete(companyPositions).where(eq(companyPositions.companyId, companyId));
  await conn.delete(companySettings).where(eq(companySettings.companyId, companyId));
}
