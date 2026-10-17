CREATE TABLE `agencies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agencies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`created_by_open_id` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`user_open_id` varchar(64) NOT NULL,
	`role` enum('admin','manager','leader','member') NOT NULL DEFAULT 'member',
	`agency_id` int,
	`team_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `company_members_user_unique_idx` UNIQUE(`user_open_id`)
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('admin','manager','leader','member') NOT NULL DEFAULT 'member',
	`agency_id` int,
	`team_id` int,
	`token_hash` varchar(64) NOT NULL,
	`invited_by_open_id` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`accepted_at` timestamp,
	`revoked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `invitations_token_unique_idx` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`agency_id` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `teams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','super_admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
UPDATE `users` SET `role` = 'super_admin' WHERE `role` = 'admin';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','super_admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
UPDATE `users` SET `email` = NULL WHERE TRIM(`email`) = '';--> statement-breakpoint
UPDATE `users` SET `email` = LOWER(TRIM(`email`)) WHERE `email` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique_idx` UNIQUE(`email`);--> statement-breakpoint
CREATE INDEX `agencies_company_idx` ON `agencies` (`company_id`);--> statement-breakpoint
CREATE INDEX `company_members_company_idx` ON `company_members` (`company_id`);--> statement-breakpoint
CREATE INDEX `invitations_company_idx` ON `invitations` (`company_id`);--> statement-breakpoint
CREATE INDEX `teams_agency_idx` ON `teams` (`agency_id`);