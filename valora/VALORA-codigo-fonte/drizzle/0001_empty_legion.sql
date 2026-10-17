CREATE TABLE `client_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_open_id` varchar(64) NOT NULL,
	`reference` varchar(24) NOT NULL,
	`name` varchar(160) NOT NULL,
	`contact` varchar(100),
	`contact_date` date NOT NULL,
	`has_credit_limit` enum('yes','no','unknown') NOT NULL DEFAULT 'unknown',
	`sale_status` enum('sold','not_sold','pending') NOT NULL DEFAULT 'pending',
	`last_product_sold` varchar(160),
	`is_bank_customer` enum('yes','no','unknown') NOT NULL DEFAULT 'unknown',
	`objection` enum('no_limit','rate','installment','thinking','no_interest','documents','later','unreachable','other'),
	`objection_notes` text,
	`interested_without_limit` boolean NOT NULL DEFAULT false,
	`stage` enum('new','contacted','negotiation','awaiting_limit','sold','lost') NOT NULL DEFAULT 'new',
	`follow_up_date` date,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `client_records_reference_unique_idx` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE INDEX `client_records_owner_contact_date_idx` ON `client_records` (`owner_open_id`,`contact_date`);--> statement-breakpoint
CREATE INDEX `client_records_owner_stage_idx` ON `client_records` (`owner_open_id`,`stage`);