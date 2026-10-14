CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `handles` (
	`handle` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `handles_account_id_unique` ON `handles` (`account_id`);--> statement-breakpoint
CREATE TABLE `provider_accounts` (
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`account_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`provider`, `provider_account_id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "provider_accounts_provider" CHECK(provider in ('github', 'gitlab', 'google', 'microsoft'))
);
--> statement-breakpoint
CREATE TABLE `retired_handles` (
	`handle` text PRIMARY KEY NOT NULL,
	`retired_at` integer DEFAULT (unixepoch()) NOT NULL
);
