ALTER TABLE `users` ADD `bankId` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `username` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_bank_username_unique_idx` ON `users` (`bankId`,`username`);
