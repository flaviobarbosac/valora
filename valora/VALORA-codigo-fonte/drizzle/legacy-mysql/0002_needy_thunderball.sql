CREATE TABLE `user_goals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_open_id` varchar(64) NOT NULL,
	`monthly_contact_target` int NOT NULL DEFAULT 100,
	`monthly_sale_target` int NOT NULL DEFAULT 20,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_goals_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_goals_owner_unique_idx` UNIQUE(`owner_open_id`)
);
