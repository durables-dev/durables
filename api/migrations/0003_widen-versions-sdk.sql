-- Widens the versions_sdk check to every SDK Temporal officially supports, in Temporal's order.
-- SQLite cannot alter a CHECK, so the table is rebuilt: create the new table, copy every row,
-- drop the old table, rename the new one. Every column, default, the primary key and the
-- foreign key to listings are kept exactly as migration 0001 created them. Only the check
-- changes. ADR 0003 counts this rebuild as additive.
--
-- D1 always enforces foreign keys and ignores PRAGMA foreign_keys, so the checks are deferred
-- to the end of the migration instead.
PRAGMA defer_foreign_keys = true;
--> statement-breakpoint
CREATE TABLE `__new_versions` (
	`handle` text NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`title` text NOT NULL,
	`sdk` text NOT NULL,
	`integrations` text NOT NULL,
	`published_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`handle`, `name`, `version`),
	FOREIGN KEY (`handle`,`name`) REFERENCES `listings`(`handle`,`name`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "versions_sdk" CHECK(sdk in ('Go', 'Java', 'Python', 'TypeScript', '.NET', 'Ruby', 'PHP', 'Rust'))
);
--> statement-breakpoint
INSERT INTO `__new_versions` (`handle`, `name`, `version`, `title`, `sdk`, `integrations`, `published_at`)
SELECT `handle`, `name`, `version`, `title`, `sdk`, `integrations`, `published_at` FROM `versions`;
--> statement-breakpoint
DROP TABLE `versions`;
--> statement-breakpoint
ALTER TABLE `__new_versions` RENAME TO `versions`;
