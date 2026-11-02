CREATE TABLE `user_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_open_id` varchar(64) NOT NULL,
	`display_name` varchar(100) NOT NULL,
	`job_title` varchar(100) NOT NULL DEFAULT '',
	`avatar_data_url` mediumtext,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_profiles_owner_unique_idx` UNIQUE(`owner_open_id`)
);
