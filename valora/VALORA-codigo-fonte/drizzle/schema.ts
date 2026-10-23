import {
  boolean,
  date,
  index,
  mediumtext,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Usuários do VALORA. O login é feito com ID do banco + ID de usuário + senha.
 * `openId` é o identificador interno e imutável do usuário: todos os registros
 * (atendimentos, metas e perfil) apontam para ele em `owner_open_id`.
 */
export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    /** System-wide role. Company roles live in `company_members`. */
    role: mysqlEnum("role", ["user", "super_admin"]).default("user").notNull(),
    agencyCode: varchar("agencyCode", { length: 20 }),
    username: varchar("username", { length: 64 }),
    passwordHash: varchar("passwordHash", { length: 255 }),
    isActive: boolean("isActive").default(true).notNull(),
    /** Null until the person types the code sent to their e-mail. Unverified accounts cannot sign in. */
    emailVerifiedAt: timestamp("emailVerifiedAt"),
    /** HMAC of the pending 6-digit verification code (never the code itself). */
    emailCodeHash: varchar("emailCodeHash", { length: 64 }),
    emailCodeExpiresAt: timestamp("emailCodeExpiresAt"),
    emailCodeAttempts: int("emailCodeAttempts").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  (table) => ({
    agencyUsernameUniqueIdx: uniqueIndex("users_agency_username_unique_idx").on(table.agencyCode, table.username),
    emailUniqueIdx: uniqueIndex("users_email_unique_idx").on(table.email),
  }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Stage keys come from the record's product (company_products.config). The
 * stage "technical" (caso técnico) hands the case to the managers of the owner's agency.
 */
export type ClientStage = string;

export const clientRecords = mysqlTable(
  "client_records",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerOpenId: varchar("owner_open_id", { length: 64 }).notNull(),
    reference: varchar("reference", { length: 24 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    contact: varchar("contact", { length: 100 }),
    contactDate: date("contact_date", { mode: "string" }).notNull(),
    /** Kept in step with the stage kind: won → sold, lost → not_sold, otherwise pending. */
    saleStatus: mysqlEnum("sale_status", ["sold", "not_sold", "pending"]).default("pending").notNull(),
    lastProductSold: varchar("last_product_sold", { length: 160 }),
    /** Loss reason key, from the product's reasons. */
    objection: varchar("objection", { length: 40 }),
    objectionNotes: text("objection_notes"),
    stage: varchar("stage", { length: 40 }).default("new").notNull(),
    followUpDate: date("follow_up_date", { mode: "string" }),
    /** "Lembrar depois": the 3-day call reminder stays quiet until this day. */
    remindAfter: date("remind_after", { mode: "string" }),
    /** The product (pipeline) this atendimento belongs to. */
    productId: int("product_id"),
    /** Registered customer (Clientes cadastrados), when linked. */
    customerId: int("customer_id"),
    /** JSON map of the product's extra fields. */
    customFields: text("custom_fields"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    ownerContactDateIdx: index("client_records_owner_contact_date_idx").on(table.ownerOpenId, table.contactDate),
    ownerStageIdx: index("client_records_owner_stage_idx").on(table.ownerOpenId, table.stage),
    referenceUniqueIdx: uniqueIndex("client_records_reference_unique_idx").on(table.reference),
  }),
);

export type ClientRecord = typeof clientRecords.$inferSelect;
export type InsertClientRecord = typeof clientRecords.$inferInsert;

export const userGoals = mysqlTable(
  "user_goals",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerOpenId: varchar("owner_open_id", { length: 64 }).notNull(),
    monthlyContactTarget: int("monthly_contact_target").notNull().default(100),
    monthlySaleTarget: int("monthly_sale_target").notNull().default(20),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({ ownerUniqueIdx: uniqueIndex("user_goals_owner_unique_idx").on(table.ownerOpenId) }),
);

export type UserGoals = typeof userGoals.$inferSelect;


export const userProfiles = mysqlTable(
  "user_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerOpenId: varchar("owner_open_id", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    jobTitle: varchar("job_title", { length: 100 }).notNull().default(""),
    avatarDataUrl: mediumtext("avatar_data_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({ ownerUniqueIdx: uniqueIndex("user_profiles_owner_unique_idx").on(table.ownerOpenId) }),
);

export type UserProfile = typeof userProfiles.$inferSelect;

// Organization: empresa › agência › equipe. A user belongs to at most one company.
export const COMPANY_ROLES = ["admin", "manager", "leader", "member"] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  createdByOpenId: varchar("created_by_open_id", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Company = typeof companies.$inferSelect;

export const agencies = mysqlTable(
  "agencies",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    /** What the agency sells: its pipeline comes from this product. */
    productId: int("product_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({ companyIdx: index("agencies_company_idx").on(table.companyId) }),
);

export type Agency = typeof agencies.$inferSelect;

export const teams = mysqlTable(
  "teams",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id").notNull(),
    agencyId: int("agency_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({ agencyIdx: index("teams_agency_idx").on(table.agencyId) }),
);

export type Team = typeof teams.$inferSelect;

/**
 * Who belongs to which company, with which role. `agencyId` is required for
 * managers and is kept equal to the team's agency when `teamId` is set.
 */
export const companyMembers = mysqlTable(
  "company_members",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id").notNull(),
    userOpenId: varchar("user_open_id", { length: 64 }).notNull(),
    role: mysqlEnum("role", COMPANY_ROLES).default("member").notNull(),
    agencyId: int("agency_id"),
    teamId: int("team_id"),
    /** Custom job title (cargo) defined by the company; `role` stays the permission level. */
    positionId: int("position_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userUniqueIdx: uniqueIndex("company_members_user_unique_idx").on(table.userOpenId),
    companyIdx: index("company_members_company_idx").on(table.companyId),
  }),
);

export type CompanyMember = typeof companyMembers.$inferSelect;

export const invitations = mysqlTable(
  "invitations",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id").notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    role: mysqlEnum("role", COMPANY_ROLES).default("member").notNull(),
    agencyId: int("agency_id"),
    teamId: int("team_id"),
    /** SHA-256 of the token sent by e-mail; the token itself is never stored. */
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    invitedByOpenId: varchar("invited_by_open_id", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    tokenUniqueIdx: uniqueIndex("invitations_token_unique_idx").on(table.tokenHash),
    companyIdx: index("invitations_company_idx").on(table.companyId),
  }),
);

export type Invitation = typeof invitations.$inferSelect;

/** Company look and wording: colors, logo, display name and custom labels (JSON maps). */
export const companySettings = mysqlTable("company_settings", {
  companyId: int("company_id").primaryKey(),
  displayName: varchar("display_name", { length: 120 }),
  primaryColor: varchar("primary_color", { length: 7 }),
  darkColor: varchar("dark_color", { length: 7 }),
  accentColor: varchar("accent_color", { length: 7 }),
  logoDataUrl: mediumtext("logo_data_url"),
  /** { admin?: string, manager?: string, leader?: string, member?: string } */
  roleLabels: text("role_labels"),
  /** Legacy stage names; stages are now named in each product. */
  stageLabels: text("stage_labels"),
  /** JSON WorkspacePrefs (shared/pipeline.ts): wording, customer fields, reminders. */
  prefs: text("prefs"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type CompanySettings = typeof companySettings.$inferSelect;

/** Cargos: job titles a company creates, each tied to a permission level. */
export const companyPositions = mysqlTable(
  "company_positions",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id").notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    level: mysqlEnum("level", COMPANY_ROLES).default("member").notNull(),
    sortOrder: int("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({ companyIdx: index("company_positions_company_idx").on(table.companyId) }),
);

export type CompanyPosition = typeof companyPositions.$inferSelect;

export const PROMOTION_STATUSES = ["pending_manager", "pending_admin", "approved", "rejected", "cancelled"] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

/** Promotion asked by a leader (or manager), approved by the agency manager and then by an admin. */
export const promotionRequests = mysqlTable(
  "promotion_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id").notNull(),
    targetOpenId: varchar("target_open_id", { length: 64 }).notNull(),
    requestedByOpenId: varchar("requested_by_open_id", { length: 64 }).notNull(),
    toPositionId: int("to_position_id").notNull(),
    reason: text("reason").notNull(),
    raiseNote: varchar("raise_note", { length: 200 }),
    status: mysqlEnum("status", PROMOTION_STATUSES).default("pending_manager").notNull(),
    managerOpenId: varchar("manager_open_id", { length: 64 }),
    managerNote: text("manager_note"),
    managerAt: timestamp("manager_at"),
    adminOpenId: varchar("admin_open_id", { length: 64 }),
    adminNote: text("admin_note"),
    adminAt: timestamp("admin_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({ companyIdx: index("promotion_requests_company_idx").on(table.companyId, table.status) }),
);

export type PromotionRequest = typeof promotionRequests.$inferSelect;

export const RECORD_NOTE_KINDS = ["cobranca", "avaliacao", "comentario"] as const;

/** Feedback on a client record: a charge ("cobrança"), an evaluation with a 1–5 rating, or a comment/reply. */
export const recordNotes = mysqlTable(
  "record_notes",
  {
    id: int("id").autoincrement().primaryKey(),
    recordId: int("record_id").notNull(),
    authorOpenId: varchar("author_open_id", { length: 64 }).notNull(),
    kind: mysqlEnum("kind", RECORD_NOTE_KINDS).default("comentario").notNull(),
    rating: int("rating"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({ recordIdx: index("record_notes_record_idx").on(table.recordId) }),
);

export type RecordNote = typeof recordNotes.$inferSelect;

/** In-app notifications shown in the bell (charges, evaluations, promotion steps). */
export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userOpenId: varchar("user_open_id", { length: 64 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body"),
    /** In-app path, e.g. "/?atendimento=12" or "/?tela=promocoes". */
    link: varchar("link", { length: 200 }),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({ userIdx: index("notifications_user_idx").on(table.userOpenId, table.readAt) }),
);

export type Notification = typeof notifications.$inferSelect;

export const BUG_STATUSES = ["new", "in_progress", "resolved"] as const;

/** "Relatar erro": problems reported by people using the app. */
export const bugReports = mysqlTable("bug_reports", {
  id: int("id").autoincrement().primaryKey(),
  reporterOpenId: varchar("reporter_open_id", { length: 64 }),
  email: varchar("email", { length: 320 }),
  category: varchar("category", { length: 40 }).notNull(),
  description: text("description").notNull(),
  pageUrl: varchar("page_url", { length: 300 }),
  userAgent: varchar("user_agent", { length: 300 }),
  technicalLog: mediumtext("technical_log"),
  status: mysqlEnum("status", BUG_STATUSES).default("new").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type BugReport = typeof bugReports.$inferSelect;

/**
 * Products a company sells (or an independent person, with `ownerOpenId`), each
 * with its own pipeline: stages, extra fields, loss reasons and item catalog.
 */
export const companyProducts = mysqlTable(
  "company_products",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id"),
    ownerOpenId: varchar("owner_open_id", { length: 64 }),
    name: varchar("name", { length: 80 }).notNull(),
    /** Template it started from (shared/pipeline.ts). */
    template: varchar("template", { length: 30 }).default("generico").notNull(),
    color: varchar("color", { length: 7 }),
    /** JSON ProductConfig. */
    config: mediumtext("config").notNull(),
    sortOrder: int("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    companyIdx: index("company_products_company_idx").on(table.companyId),
    ownerIdx: index("company_products_owner_idx").on(table.ownerOpenId),
  }),
);

export type CompanyProduct = typeof companyProducts.$inferSelect;

/** Clientes cadastrados: the customer registry, owned by whoever registered them. */
export const customers = mysqlTable(
  "customers",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerOpenId: varchar("owner_open_id", { length: 64 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    document: varchar("document", { length: 32 }),
    phone: varchar("phone", { length: 40 }),
    email: varchar("email", { length: 320 }),
    birthDate: date("birth_date", { mode: "string" }),
    address: varchar("address", { length: 200 }),
    district: varchar("district", { length: 100 }),
    city: varchar("city", { length: 100 }),
    state: varchar("state", { length: 40 }),
    zip: varchar("zip", { length: 16 }),
    notes: text("notes"),
    /** JSON map of the workspace's extra customer fields. */
    customFields: text("custom_fields"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({ ownerIdx: index("customers_owner_idx").on(table.ownerOpenId) }),
);

export type Customer = typeof customers.$inferSelect;

/** Preferences of people who work on their own (companies use company_settings.prefs). */
export const userSettings = mysqlTable("user_settings", {
  ownerOpenId: varchar("owner_open_id", { length: 64 }).primaryKey(),
  prefs: text("prefs"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
