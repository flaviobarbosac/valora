ALTER TABLE `users` RENAME COLUMN `bankId` TO `agencyCode`;--> statement-breakpoint
ALTER TABLE `users` RENAME INDEX `users_bank_username_unique_idx` TO `users_agency_username_unique_idx`;
