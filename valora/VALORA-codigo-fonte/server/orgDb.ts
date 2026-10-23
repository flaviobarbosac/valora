import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import {
  agencies, clientRecords, companies, companyMembers, companyPositions, invitations, promotionRequests, teams, userGoals, userProfiles, users,
  type CompanyMember, type CompanyRole,
} from "../drizzle/schema";
import { getDb } from "./db";
import { averageRatingsByOwner, deleteCompanyFeatures, listPositions } from "./featuresDb";

async function db() {
  const conn = await getDb();
  if (!conn) throw new Error("Database is not available");
  return conn;
}

export async function getMembership(openId: string): Promise<CompanyMember | undefined> {
  const rows = await (await db()).select().from(companyMembers).where(eq(companyMembers.userOpenId, openId)).limit(1);
  return rows[0];
}

export async function getUserByEmail(email: string) {
  const rows = await (await db()).select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0];
}

/** Higher number = higher position. People never see records of someone at their own level or above. */
export const ROLE_RANK: Record<CompanyRole, number> = { member: 1, leader: 2, manager: 3, admin: 4 };

/** People below `member` in their own area: leader → team, manager → agency. */
async function peopleBelow(member: CompanyMember) {
  const scope =
    member.role === "manager" && member.agencyId ? and(eq(companyMembers.companyId, member.companyId), eq(companyMembers.agencyId, member.agencyId))
    : member.role === "leader" && member.teamId ? and(eq(companyMembers.companyId, member.companyId), eq(companyMembers.teamId, member.teamId))
    : null;
  if (!scope) return [];
  const rows = await (await db()).select({ openId: companyMembers.userOpenId, role: companyMembers.role }).from(companyMembers).where(scope);
  return rows.filter((row) => ROLE_RANK[row.role] < ROLE_RANK[member.role]).map((row) => row.openId);
}

/**
 * Owners whose client records `openId` may read: always their own, plus the
 * people *below* them in their area (leader → team members, manager → leaders
 * and members of the agency). Colleagues in the same position never see each
 * other's clients. Admins see no one else's clients — only the numbers in
 * `agencyPerformance`, without confidential client data.
 */
export async function visibleOwnerOpenIds(openId: string): Promise<string[]> {
  const member = await getMembership(openId);
  if (!member || member.role === "member" || member.role === "admin") return [openId];
  return Array.from(new Set([openId, ...(await peopleBelow(member))]));
}

/**
 * Owners whose "caso técnico" records `openId` may edit: a manager is
 * responsible for the technical cases of the people below them in their agency.
 */
export async function technicalCaseOwners(openId: string): Promise<Set<string>> {
  const member = await getMembership(openId);
  if (!member || member.role !== "manager") return new Set();
  return new Set(await peopleBelow(member));
}

/**
 * Month numbers per person, grouped by agency, with no client data: goals,
 * clients served, sales and open technical cases. Admin → every agency;
 * manager → their own agency.
 */
export async function agencyPerformance(companyId: number, month: string, onlyAgencyId: number | null, onlyTeamId: number | null = null) {
  const overview = await getCompanyOverview(companyId);
  if (!overview) return null;
  const members = overview.members
    .filter((row) => onlyAgencyId === null || row.agencyId === onlyAgencyId)
    .filter((row) => onlyTeamId === null || row.teamId === onlyTeamId);
  const ids = members.map((row) => row.openId);
  const conn = await db();
  const [counts, goals] = ids.length
    ? await Promise.all([
        conn
          .select({
            owner: clientRecords.ownerOpenId,
            served: sql<number>`SUM(CASE WHEN ${clientRecords.contactDate} LIKE ${`${month}-%`} THEN 1 ELSE 0 END)`,
            sold: sql<number>`SUM(CASE WHEN ${clientRecords.contactDate} LIKE ${`${month}-%`} AND ${clientRecords.saleStatus} = 'sold' THEN 1 ELSE 0 END)`,
            technical: sql<number>`SUM(CASE WHEN ${clientRecords.stage} = 'technical' THEN 1 ELSE 0 END)`,
          })
          .from(clientRecords)
          .where(inArray(clientRecords.ownerOpenId, ids))
          .groupBy(clientRecords.ownerOpenId),
        conn.select().from(userGoals).where(inArray(userGoals.ownerOpenId, ids)),
      ])
    : [[], []];
  const ratings = await averageRatingsByOwner(ids);
  const positions = await listPositions(companyId);
  const people = members.map((row) => {
    const count = counts.find((item) => item.owner === row.openId);
    const goal = goals.find((item) => item.ownerOpenId === row.openId);
    const rating = ratings.get(row.openId);
    return {
      openId: row.openId, name: row.name, role: row.role, agencyId: row.agencyId, teamId: row.teamId,
      positionName: positions.find((position) => position.id === row.positionId)?.name ?? null,
      averageRating: rating?.average ?? null, ratingCount: rating?.count ?? 0,
      served: Number(count?.served ?? 0), sold: Number(count?.sold ?? 0), technicalCases: Number(count?.technical ?? 0),
      contactTarget: goal?.monthlyContactTarget ?? 100, saleTarget: goal?.monthlySaleTarget ?? 20,
    };
  });
  const agencyList = onlyAgencyId === null ? overview.agencies : overview.agencies.filter((agency) => agency.id === onlyAgencyId);
  const teamList = overview.teams.filter((team) => (onlyAgencyId === null || team.agencyId === onlyAgencyId) && (onlyTeamId === null || team.id === onlyTeamId));
  return {
    company: { id: overview.company.id, name: overview.company.name },
    agencies: agencyList.map(({ id, name, productId }) => ({ id, name, productId })),
    teams: teamList.map(({ id, name, agencyId }) => ({ id, name, agencyId })),
    people,
  };
}

export async function getCompanyOverview(companyId: number) {
  const conn = await db();
  const [company] = await conn.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!company) return null;
  const [agencyRows, teamRows, memberRows] = await Promise.all([
    conn.select().from(agencies).where(eq(agencies.companyId, companyId)).orderBy(asc(agencies.name)),
    conn.select().from(teams).where(eq(teams.companyId, companyId)).orderBy(asc(teams.name)),
    conn
      .select({
        openId: companyMembers.userOpenId,
        role: companyMembers.role,
        agencyId: companyMembers.agencyId,
        teamId: companyMembers.teamId,
        name: users.name,
        displayName: userProfiles.displayName,
        email: users.email,
        agencyCode: users.agencyCode,
        username: users.username,
        isActive: users.isActive,
        positionId: companyMembers.positionId,
        joinedAt: companyMembers.createdAt,
      })
      .from(companyMembers)
      .innerJoin(users, eq(users.openId, companyMembers.userOpenId))
      .leftJoin(userProfiles, eq(userProfiles.ownerOpenId, companyMembers.userOpenId))
      .where(eq(companyMembers.companyId, companyId)),
  ]);
  const members = memberRows
    .map(({ displayName, name, ...row }) => ({ ...row, name: displayName || name || row.username || "Sem nome" }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { company, agencies: agencyRows, teams: teamRows, members };
}

export async function listPendingInvitations(companyId: number) {
  return (await db())
    .select({
      id: invitations.id, email: invitations.email, role: invitations.role,
      agencyId: invitations.agencyId, teamId: invitations.teamId,
      expiresAt: invitations.expiresAt, createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(and(eq(invitations.companyId, companyId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date())))
    .orderBy(asc(invitations.createdAt));
}

export async function createCompanyWithAdmin(openId: string, name: string) {
  const conn = await db();
  return conn.transaction(async (tx) => {
    const [result] = await tx.insert(companies).values({ name, createdByOpenId: openId }).$returningId();
    await tx.insert(companyMembers).values({ companyId: result.id, userOpenId: openId, role: "admin" });
    return result.id;
  });
}

export async function renameCompany(companyId: number, name: string) {
  await (await db()).update(companies).set({ name }).where(eq(companies.id, companyId));
}

/** Removes the company with its structure, invitations and memberships. Users and their records stay. */
export async function deleteCompany(companyId: number) {
  const conn = await db();
  await conn.transaction(async (tx) => {
    await tx.delete(invitations).where(eq(invitations.companyId, companyId));
    await tx.delete(companyMembers).where(eq(companyMembers.companyId, companyId));
    await tx.delete(teams).where(eq(teams.companyId, companyId));
    await tx.delete(agencies).where(eq(agencies.companyId, companyId));
    await tx.delete(companies).where(eq(companies.id, companyId));
  });
  await deleteCompanyFeatures(companyId);
}

export async function getAgency(companyId: number, agencyId: number) {
  const rows = await (await db()).select().from(agencies).where(and(eq(agencies.id, agencyId), eq(agencies.companyId, companyId))).limit(1);
  return rows[0];
}

export async function getTeam(companyId: number, teamId: number) {
  const rows = await (await db()).select().from(teams).where(and(eq(teams.id, teamId), eq(teams.companyId, companyId))).limit(1);
  return rows[0];
}

export async function createAgency(companyId: number, name: string, productId: number | null = null) {
  await (await db()).insert(agencies).values({ companyId, name, productId });
}

export async function setAgencyProduct(companyId: number, agencyId: number, productId: number | null) {
  await (await db()).update(agencies).set({ productId }).where(and(eq(agencies.id, agencyId), eq(agencies.companyId, companyId)));
}

export async function renameAgency(companyId: number, agencyId: number, name: string) {
  await (await db()).update(agencies).set({ name }).where(and(eq(agencies.id, agencyId), eq(agencies.companyId, companyId)));
}

/** Returns false when the agency still has teams or people. */
export async function deleteAgencyIfEmpty(companyId: number, agencyId: number) {
  const conn = await db();
  const [team] = await conn.select({ id: teams.id }).from(teams).where(eq(teams.agencyId, agencyId)).limit(1);
  const [member] = await conn.select({ id: companyMembers.id }).from(companyMembers).where(eq(companyMembers.agencyId, agencyId)).limit(1);
  if (team || member) return false;
  await conn.transaction(async (tx) => {
    await tx.update(invitations).set({ revokedAt: new Date() }).where(and(eq(invitations.agencyId, agencyId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
    await tx.delete(agencies).where(and(eq(agencies.id, agencyId), eq(agencies.companyId, companyId)));
  });
  return true;
}

export async function createTeam(companyId: number, agencyId: number, name: string) {
  await (await db()).insert(teams).values({ companyId, agencyId, name });
}

export async function renameTeam(companyId: number, teamId: number, name: string) {
  await (await db()).update(teams).set({ name }).where(and(eq(teams.id, teamId), eq(teams.companyId, companyId)));
}

/** Returns false when the team still has people. */
export async function deleteTeamIfEmpty(companyId: number, teamId: number) {
  const conn = await db();
  const [member] = await conn.select({ id: companyMembers.id }).from(companyMembers).where(eq(companyMembers.teamId, teamId)).limit(1);
  if (member) return false;
  await conn.transaction(async (tx) => {
    await tx.update(invitations).set({ revokedAt: new Date() }).where(and(eq(invitations.teamId, teamId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
    await tx.delete(teams).where(and(eq(teams.id, teamId), eq(teams.companyId, companyId)));
  });
  return true;
}

export type Placement = { role: CompanyRole; agencyId: number | null; teamId: number | null };

export async function addMember(companyId: number, openId: string, placement: Placement) {
  await (await db()).insert(companyMembers).values({ companyId, userOpenId: openId, ...placement });
}

export async function updateMember(companyId: number, openId: string, placement: Placement) {
  const conn = await db();
  const where = and(eq(companyMembers.companyId, companyId), eq(companyMembers.userOpenId, openId));
  const [current] = await conn.select({ positionId: companyMembers.positionId }).from(companyMembers).where(where).limit(1);
  // A cargo belongs to one permission level; when the level changes, an old cargo would no longer match.
  let clearPosition = false;
  if (current?.positionId) {
    const [position] = await conn.select({ level: companyPositions.level }).from(companyPositions).where(eq(companyPositions.id, current.positionId)).limit(1);
    clearPosition = !position || position.level !== placement.role;
  }
  await conn.update(companyMembers).set(clearPosition ? { ...placement, positionId: null } : placement).where(where);
}

export async function removeMember(companyId: number, openId: string) {
  const conn = await db();
  await conn.transaction(async (tx) => {
    await cancelOpenPromotionsFor(tx, companyId, openId);
    await tx.delete(companyMembers).where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userOpenId, openId)));
  });
}

/** Someone who leaves the company can no longer be promoted in it. */
async function cancelOpenPromotionsFor(tx: Pick<Awaited<ReturnType<typeof db>>, "update">, companyId: number, openId: string) {
  await tx.update(promotionRequests).set({ status: "cancelled" }).where(and(
    eq(promotionRequests.companyId, companyId), eq(promotionRequests.targetOpenId, openId),
    inArray(promotionRequests.status, ["pending_manager", "pending_admin"]),
  ));
}

export async function countMembers(companyId: number, role?: CompanyRole) {
  const rows = await (await db())
    .select({ id: companyMembers.id })
    .from(companyMembers)
    .where(role ? and(eq(companyMembers.companyId, companyId), eq(companyMembers.role, role)) : eq(companyMembers.companyId, companyId));
  return rows.length;
}

export async function createInvitation(values: {
  companyId: number; email: string; placement: Placement; tokenHash: string; invitedByOpenId: string; expiresAt: Date;
}) {
  const conn = await db();
  const { placement, ...rest } = values;
  return conn.transaction(async (tx) => {
    // Only the newest invitation for an e-mail stays valid.
    await tx.update(invitations).set({ revokedAt: new Date() })
      .where(and(eq(invitations.companyId, values.companyId), eq(invitations.email, values.email), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
    const [result] = await tx.insert(invitations).values({ ...rest, ...placement }).$returningId();
    return result.id;
  });
}

export async function getInvitationByTokenHash(tokenHash: string) {
  const rows = await (await db()).select().from(invitations).where(eq(invitations.tokenHash, tokenHash)).limit(1);
  return rows[0];
}

export async function getInvitation(companyId: number, id: number) {
  const rows = await (await db()).select().from(invitations).where(and(eq(invitations.id, id), eq(invitations.companyId, companyId))).limit(1);
  return rows[0];
}

export async function replaceInvitationToken(id: number, tokenHash: string, expiresAt: Date) {
  await (await db()).update(invitations).set({ tokenHash, expiresAt }).where(eq(invitations.id, id));
}

export async function revokeInvitation(companyId: number, id: number) {
  await (await db()).update(invitations).set({ revokedAt: new Date() })
    .where(and(eq(invitations.id, id), eq(invitations.companyId, companyId), isNull(invitations.acceptedAt)));
}

/** Joins the user to the invitation's company and marks it used, atomically. */
export async function acceptInvitation(invitationId: number, openId: string, email: string | null) {
  const conn = await db();
  await conn.transaction(async (tx) => {
    const [invite] = await tx.select().from(invitations).where(eq(invitations.id, invitationId)).limit(1);
    if (!invite || invite.acceptedAt || invite.revokedAt) throw new Error("INVITE_USED");
    await tx.insert(companyMembers).values({
      companyId: invite.companyId, userOpenId: openId, role: invite.role, agencyId: invite.agencyId, teamId: invite.teamId,
    });
    await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, invitationId));
    if (email) await tx.update(users).set({ email }).where(and(eq(users.openId, openId), isNull(users.email)));
  });
}

export async function getInvitationContext(invite: { companyId: number; agencyId: number | null; teamId: number | null; invitedByOpenId: string }) {
  const conn = await db();
  const [company] = await conn.select({ name: companies.name }).from(companies).where(eq(companies.id, invite.companyId)).limit(1);
  const [agency] = invite.agencyId ? await conn.select({ name: agencies.name }).from(agencies).where(eq(agencies.id, invite.agencyId)).limit(1) : [];
  const [team] = invite.teamId ? await conn.select({ name: teams.name }).from(teams).where(eq(teams.id, invite.teamId)).limit(1) : [];
  const [inviter] = await conn
    .select({ name: users.name, displayName: userProfiles.displayName, agencyCode: users.agencyCode })
    .from(users).leftJoin(userProfiles, eq(userProfiles.ownerOpenId, users.openId))
    .where(eq(users.openId, invite.invitedByOpenId)).limit(1);
  return {
    companyName: company?.name ?? "",
    agencyName: agency?.name ?? null,
    teamName: team?.name ?? null,
    inviterName: inviter?.displayName || inviter?.name || "Administrador",
    inviterAgencyCode: inviter?.agencyCode ?? null,
  };
}

/** Super administrator view: everyone, with their company placement. */
export async function listAllUsersWithPlacement() {
  const conn = await db();
  const rows = await conn
    .select({
      openId: users.openId, name: users.name, displayName: userProfiles.displayName, email: users.email,
      agencyCode: users.agencyCode, username: users.username, systemRole: users.role, isActive: users.isActive,
      hasPassword: users.passwordHash, emailVerifiedAt: users.emailVerifiedAt, lastSignedIn: users.lastSignedIn, createdAt: users.createdAt,
      companyName: companies.name, companyRole: companyMembers.role, agencyName: agencies.name, teamName: teams.name,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.ownerOpenId, users.openId))
    .leftJoin(companyMembers, eq(companyMembers.userOpenId, users.openId))
    .leftJoin(companies, eq(companies.id, companyMembers.companyId))
    .leftJoin(agencies, eq(agencies.id, companyMembers.agencyId))
    .leftJoin(teams, eq(teams.id, companyMembers.teamId))
    .orderBy(asc(users.agencyCode), asc(users.username));
  return rows.map(({ displayName, name, hasPassword, emailVerifiedAt, ...row }) => ({
    ...row, name: displayName || name || row.username || "Sem nome",
    emailVerified: Boolean(emailVerifiedAt), canSignIn: Boolean(hasPassword) && Boolean(emailVerifiedAt) && row.isActive,
  }));
}

export async function listCompaniesSummary() {
  const conn = await db();
  const rows = await conn.select({ id: companies.id, name: companies.name, createdAt: companies.createdAt }).from(companies).orderBy(asc(companies.name));
  if (!rows.length) return [];
  const members = await conn.select({ companyId: companyMembers.companyId }).from(companyMembers).where(inArray(companyMembers.companyId, rows.map((row) => row.id)));
  return rows.map((row) => ({ ...row, memberCount: members.filter((member) => member.companyId === row.id).length }));
}
