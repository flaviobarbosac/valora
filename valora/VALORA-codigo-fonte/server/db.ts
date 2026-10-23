import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { clientRecords, companyMembers, companyProducts, customers, notifications, promotionRequests, recordNotes, type InsertUser, type User, userGoals, userProfiles, userSettings, users } from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

/** `agencyCode` and `username` must already be normalized (see normalizeLoginId). */
export async function getUserByLogin(agencyCode: string, username: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db
    .select()
    .from(users)
    .where(and(eq(users.agencyCode, agencyCode), eq(users.username, username)))
    .limit(1);
  return result[0];
}

export async function listUsers() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(users).orderBy(asc(users.agencyCode), asc(users.username));
}

/** `emailVerified: false` leaves the account waiting for the e-mail code (self sign-up). */
export async function createUser(values: Pick<InsertUser, "openId" | "agencyCode" | "username" | "passwordHash" | "name" | "role"> & { email?: string | null; emailVerified: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const { emailVerified, ...rest } = values;
  await db.insert(users).values({ ...rest, loginMethod: "password", isActive: true, emailVerifiedAt: emailVerified ? new Date() : null });
}

/** Stores a new pending verification code (as a hash) and resets the attempt counter. */
export async function setEmailCode(openId: string, codeHash: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ emailCodeHash: codeHash, emailCodeExpiresAt: expiresAt, emailCodeAttempts: 0 }).where(eq(users.openId, openId));
}

export async function countEmailCodeAttempt(openId: string, attempts: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ emailCodeAttempts: attempts }).where(eq(users.openId, openId));
}

export async function markEmailVerified(openId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ emailVerifiedAt: new Date(), emailCodeHash: null, emailCodeExpiresAt: null, emailCodeAttempts: 0 }).where(eq(users.openId, openId));
}

/** Attaches login credentials to an existing user row (e.g. one created by the old Manus login). */
export async function setUserLogin(openId: string, values: { agencyCode: string; username: string; passwordHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ ...values, loginMethod: "password", isActive: true }).where(eq(users.openId, openId));
}

export async function setUserPassword(openId: string, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ passwordHash }).where(eq(users.openId, openId));
}

/** Used by the administrator script, who vouches for the new address. */
export async function setUserEmail(openId: string, email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ email, emailVerifiedAt: new Date(), emailCodeHash: null, emailCodeExpiresAt: null }).where(eq(users.openId, openId));
}

export async function setUserRole(openId: string, role: User["role"]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ role }).where(eq(users.openId, openId));
}

export async function setUserActive(openId: string, isActive: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ isActive }).where(eq(users.openId, openId));
}

/** Permanently removes the user and everything they own (records, goals, profile, company membership). */
export async function deleteUserAndData(openId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.transaction(async (tx) => {
    const owned = await tx.select({ id: clientRecords.id }).from(clientRecords).where(eq(clientRecords.ownerOpenId, openId));
    if (owned.length) await tx.delete(recordNotes).where(inArray(recordNotes.recordId, owned.map((row) => row.id)));
    await tx.delete(notifications).where(eq(notifications.userOpenId, openId));
    await tx.delete(clientRecords).where(eq(clientRecords.ownerOpenId, openId));
    await tx.delete(userGoals).where(eq(userGoals.ownerOpenId, openId));
    await tx.delete(userProfiles).where(eq(userProfiles.ownerOpenId, openId));
    await tx.update(promotionRequests).set({ status: "cancelled" })
      .where(and(eq(promotionRequests.targetOpenId, openId), inArray(promotionRequests.status, ["pending_manager", "pending_admin"])));
    await tx.delete(companyMembers).where(eq(companyMembers.userOpenId, openId));
    await tx.delete(customers).where(eq(customers.ownerOpenId, openId));
    await tx.delete(userSettings).where(eq(userSettings.ownerOpenId, openId));
    await tx.delete(companyProducts).where(and(isNull(companyProducts.companyId), eq(companyProducts.ownerOpenId, openId)));
    await tx.delete(users).where(eq(users.openId, openId));
  });
}

export async function touchUserSignIn(openId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.openId, openId));
}

/** Records owned by any of `ownerOpenIds`, each with the owner's display name. */
export async function listClientRecords(ownerOpenIds: string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (!ownerOpenIds.length) return [];
  const rows = await db
    .select({ record: clientRecords, ownerUserName: users.name, ownerDisplayName: userProfiles.displayName, ownerUsername: users.username })
    .from(clientRecords)
    .leftJoin(users, eq(users.openId, clientRecords.ownerOpenId))
    .leftJoin(userProfiles, eq(userProfiles.ownerOpenId, clientRecords.ownerOpenId))
    .where(inArray(clientRecords.ownerOpenId, ownerOpenIds))
    .orderBy(desc(clientRecords.contactDate), desc(clientRecords.createdAt));
  return rows.map(({ record, ownerUserName, ownerDisplayName, ownerUsername }) => ({
    ...record,
    ownerName: ownerDisplayName || ownerUserName || ownerUsername || "Sem nome",
  }));
}

export async function getClientRecord(ownerOpenId: string, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db
    .select()
    .from(clientRecords)
    .where(and(eq(clientRecords.id, id), eq(clientRecords.ownerOpenId, ownerOpenId)))
    .limit(1);
  return rows[0];
}

/** Any owner. Callers must check permission (see requireEditableRecord in routers.ts). */
export async function getClientRecordById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(clientRecords).where(eq(clientRecords.id, id)).limit(1);
  return rows[0];
}

export async function createClientRecord(
  ownerOpenId: string,
  values: Omit<typeof clientRecords.$inferInsert, "id" | "ownerOpenId">,
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [result] = await db.insert(clientRecords).values({ ...values, ownerOpenId }).$returningId();
  return result.id;
}

export async function updateClientRecord(
  ownerOpenId: string,
  id: number,
  values: Partial<Omit<typeof clientRecords.$inferInsert, "id" | "ownerOpenId" | "reference">>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db
    .update(clientRecords)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(clientRecords.id, id), eq(clientRecords.ownerOpenId, ownerOpenId)));
  return { success: true } as const;
}

export async function deleteClientRecord(ownerOpenId: string, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.transaction(async (tx) => {
    const [record] = await tx.select({ id: clientRecords.id }).from(clientRecords)
      .where(and(eq(clientRecords.id, id), eq(clientRecords.ownerOpenId, ownerOpenId))).limit(1);
    if (!record) return;
    // Cobranças and avaliações belong to the record and go with it.
    await tx.delete(recordNotes).where(eq(recordNotes.recordId, record.id));
    await tx.delete(clientRecords).where(eq(clientRecords.id, record.id));
  });
  return { success: true } as const;
}

export async function getOwnerGoals(ownerOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(userGoals).where(eq(userGoals.ownerOpenId, ownerOpenId)).limit(1);
  const goal = rows[0];
  return goal
    ? { monthlyContactTarget: goal.monthlyContactTarget, monthlySaleTarget: goal.monthlySaleTarget }
    : { monthlyContactTarget: 100, monthlySaleTarget: 20 };
}

export async function saveOwnerGoals(ownerOpenId: string, values: { monthlyContactTarget: number; monthlySaleTarget: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(userGoals).values({ ownerOpenId, ...values }).onDuplicateKeyUpdate({
    set: { ...values, updatedAt: new Date() },
  });
  return { success: true } as const;
}

export async function getOwnerProfile(ownerOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(userProfiles).where(eq(userProfiles.ownerOpenId, ownerOpenId)).limit(1);
  return rows[0] ?? null;
}

export async function saveOwnerProfile(ownerOpenId: string, values: { displayName: string; jobTitle: string; avatarDataUrl: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(userProfiles).values({ ownerOpenId, ...values }).onDuplicateKeyUpdate({
    set: { ...values, updatedAt: new Date() },
  });
  return { success: true } as const;
}
