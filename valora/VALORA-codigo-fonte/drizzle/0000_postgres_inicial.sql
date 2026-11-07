CREATE TABLE "agencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"product_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bug_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_open_id" varchar(64),
	"email" varchar(320),
	"category" varchar(40) NOT NULL,
	"description" text NOT NULL,
	"page_url" varchar(300),
	"user_agent" varchar(300),
	"technical_log" text,
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_open_id" varchar(64) NOT NULL,
	"reference" varchar(24) NOT NULL,
	"name" varchar(160) NOT NULL,
	"contact" varchar(100),
	"contact_date" date NOT NULL,
	"sale_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"last_product_sold" varchar(160),
	"objection" varchar(40),
	"objection_notes" text,
	"stage" varchar(40) DEFAULT 'new' NOT NULL,
	"follow_up_date" date,
	"remind_after" date,
	"product_id" integer,
	"customer_id" integer,
	"custom_fields" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"created_by_open_id" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"user_open_id" varchar(64) NOT NULL,
	"role" varchar(20) DEFAULT 'member' NOT NULL,
	"agency_id" integer,
	"team_id" integer,
	"position_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" varchar(80) NOT NULL,
	"level" varchar(20) DEFAULT 'member' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"owner_open_id" varchar(64),
	"name" varchar(80) NOT NULL,
	"template" varchar(30) DEFAULT 'generico' NOT NULL,
	"color" varchar(7),
	"config" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"company_id" integer PRIMARY KEY NOT NULL,
	"display_name" varchar(120),
	"primary_color" varchar(7),
	"dark_color" varchar(7),
	"accent_color" varchar(7),
	"logo_data_url" text,
	"role_labels" text,
	"stage_labels" text,
	"prefs" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_open_id" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"document" varchar(32),
	"phone" varchar(40),
	"email" varchar(320),
	"birth_date" date,
	"address" varchar(200),
	"district" varchar(100),
	"city" varchar(100),
	"state" varchar(40),
	"zip" varchar(16),
	"notes" text,
	"custom_fields" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"email" varchar(320) NOT NULL,
	"role" varchar(20) DEFAULT 'member' NOT NULL,
	"agency_id" integer,
	"team_id" integer,
	"token_hash" varchar(64) NOT NULL,
	"invited_by_open_id" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_open_id" varchar(64) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"link" varchar(200),
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"target_open_id" varchar(64) NOT NULL,
	"requested_by_open_id" varchar(64) NOT NULL,
	"to_position_id" integer NOT NULL,
	"reason" text NOT NULL,
	"raise_note" varchar(200),
	"status" varchar(20) DEFAULT 'pending_manager' NOT NULL,
	"manager_open_id" varchar(64),
	"manager_note" text,
	"manager_at" timestamp,
	"admin_open_id" varchar(64),
	"admin_note" text,
	"admin_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"record_id" integer NOT NULL,
	"author_open_id" varchar(64) NOT NULL,
	"kind" varchar(20) DEFAULT 'comentario' NOT NULL,
	"rating" integer,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"agency_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_open_id" varchar(64) NOT NULL,
	"monthly_contact_target" integer DEFAULT 100 NOT NULL,
	"monthly_sale_target" integer DEFAULT 20 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_open_id" varchar(64) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"job_title" varchar(100) DEFAULT '' NOT NULL,
	"avatar_data_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"owner_open_id" varchar(64) PRIMARY KEY NOT NULL,
	"prefs" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"agencyCode" varchar(20),
	"username" varchar(64),
	"passwordHash" varchar(255),
	"isActive" boolean DEFAULT true NOT NULL,
	"emailVerifiedAt" timestamp,
	"emailCodeHash" varchar(64),
	"emailCodeExpiresAt" timestamp,
	"emailCodeAttempts" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE INDEX "agencies_company_idx" ON "agencies" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "client_records_owner_contact_date_idx" ON "client_records" USING btree ("owner_open_id","contact_date");--> statement-breakpoint
CREATE INDEX "client_records_owner_stage_idx" ON "client_records" USING btree ("owner_open_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "client_records_reference_unique_idx" ON "client_records" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "company_members_user_unique_idx" ON "company_members" USING btree ("user_open_id");--> statement-breakpoint
CREATE INDEX "company_members_company_idx" ON "company_members" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_positions_company_idx" ON "company_positions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_products_company_idx" ON "company_products" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_products_owner_idx" ON "company_products" USING btree ("owner_open_id");--> statement-breakpoint
CREATE INDEX "customers_owner_idx" ON "customers" USING btree ("owner_open_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_unique_idx" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_company_idx" ON "invitations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_open_id","read_at");--> statement-breakpoint
CREATE INDEX "promotion_requests_company_idx" ON "promotion_requests" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "record_notes_record_idx" ON "record_notes" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "teams_agency_idx" ON "teams" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_goals_owner_unique_idx" ON "user_goals" USING btree ("owner_open_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_profiles_owner_unique_idx" ON "user_profiles" USING btree ("owner_open_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_agency_username_unique_idx" ON "users" USING btree ("agencyCode","username");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique_idx" ON "users" USING btree ("email");