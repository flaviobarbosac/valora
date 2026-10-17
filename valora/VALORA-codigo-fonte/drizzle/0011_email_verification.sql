ALTER TABLE `users` ADD `emailVerifiedAt` timestamp NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `emailCodeHash` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `emailCodeExpiresAt` timestamp NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `emailCodeAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Accounts that already exist were created by an administrator, an invitation or the demo: keep them able to sign in.
UPDATE `users` SET `emailVerifiedAt` = NOW() WHERE `emailVerifiedAt` IS NULL;
