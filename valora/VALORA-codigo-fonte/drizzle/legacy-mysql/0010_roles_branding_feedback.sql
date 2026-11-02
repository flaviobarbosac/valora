CREATE TABLE `bug_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporter_open_id` varchar(64),
	`email` varchar(320),
	`category` varchar(40) NOT NULL,
	`description` text NOT NULL,
	`page_url` varchar(300),
	`user_agent` varchar(300),
	`technical_log` mediumtext,
	`status` enum('new','in_progress','resolved') NOT NULL DEFAULT 'new',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bug_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_positions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`level` enum('admin','manager','leader','member') NOT NULL DEFAULT 'member',
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_positions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_settings` (
	`company_id` int NOT NULL,
	`display_name` varchar(120),
	`primary_color` varchar(7),
	`dark_color` varchar(7),
	`accent_color` varchar(7),
	`logo_data_url` mediumtext,
	`role_labels` text,
	`stage_labels` text,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_settings_company_id` PRIMARY KEY(`company_id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_open_id` varchar(64) NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text,
	`link` varchar(200),
	`read_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `promotion_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`target_open_id` varchar(64) NOT NULL,
	`requested_by_open_id` varchar(64) NOT NULL,
	`to_position_id` int NOT NULL,
	`reason` text NOT NULL,
	`raise_note` varchar(200),
	`status` enum('pending_manager','pending_admin','approved','rejected','cancelled') NOT NULL DEFAULT 'pending_manager',
	`manager_open_id` varchar(64),
	`manager_note` text,
	`manager_at` timestamp,
	`admin_open_id` varchar(64),
	`admin_note` text,
	`admin_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `promotion_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `record_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`record_id` int NOT NULL,
	`author_open_id` varchar(64) NOT NULL,
	`kind` enum('cobranca','avaliacao','comentario') NOT NULL DEFAULT 'comentario',
	`rating` int,
	`body` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `record_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `company_members` ADD `position_id` int;--> statement-breakpoint
CREATE INDEX `company_positions_company_idx` ON `company_positions` (`company_id`);--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_open_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `promotion_requests_company_idx` ON `promotion_requests` (`company_id`,`status`);--> statement-breakpoint
CREATE INDEX `record_notes_record_idx` ON `record_notes` (`record_id`);