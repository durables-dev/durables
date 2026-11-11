CREATE TABLE `listings` (
	`handle` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	PRIMARY KEY(`handle`, `name`),
	FOREIGN KEY (`handle`) REFERENCES `handles`(`handle`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `versions` (
	`handle` text NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`title` text NOT NULL,
	`sdk` text NOT NULL,
	`integrations` text NOT NULL,
	`published_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`handle`, `name`, `version`),
	FOREIGN KEY (`handle`,`name`) REFERENCES `listings`(`handle`,`name`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "versions_sdk" CHECK(sdk in ('Python', 'TypeScript', '.NET'))
);
