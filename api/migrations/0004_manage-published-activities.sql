-- Adds the storage for managing published activities (ADR 0015):
--   - each version's current description, copied from its listing;
--   - each version's What changed note and the version it was based on, empty for existing versions;
--   - who removed a listing from search, empty for every existing listing;
--   - a deprecation record per version, apart from the version row;
--   - when an account's deletion was asked for, empty for every existing account.
--
-- Every change adds a column or a table, so no table is rebuilt and no existing value changes.
-- The listing's description column stays until nothing reads it.
ALTER TABLE `accounts` ADD `deletion_requested_at` integer;
--> statement-breakpoint
ALTER TABLE `listings` ADD `removed_by` text CONSTRAINT "listings_removed_by" CHECK(removed_by in ('publisher', 'account-deletion', 'durables'));
--> statement-breakpoint
ALTER TABLE `versions` ADD `description` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `versions` ADD `what_changed` text;
--> statement-breakpoint
ALTER TABLE `versions` ADD `based_on` text;
--> statement-breakpoint
-- Every listing has exactly one version as of ADR 0015. Each version takes its listing's
-- description, which is never null.
UPDATE `versions`
SET `description` = (
	SELECT `listings`.`description`
	FROM `listings`
	WHERE `listings`.`handle` = `versions`.`handle` AND `listings`.`name` = `versions`.`name`
);
--> statement-breakpoint
CREATE TABLE `version_deprecations` (
	`handle` text NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`reason` text NOT NULL,
	`replacement` text,
	PRIMARY KEY(`handle`, `name`, `version`),
	FOREIGN KEY (`handle`,`name`,`version`) REFERENCES `versions`(`handle`,`name`,`version`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`handle`,`name`,`replacement`) REFERENCES `versions`(`handle`,`name`,`version`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "version_deprecations_replacement" CHECK(replacement <> version)
);
