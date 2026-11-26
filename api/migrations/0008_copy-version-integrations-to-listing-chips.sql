-- Gives every listing its highest version's integrations as its chips, before publishing stops
-- writing integrations on versions. The highest version is ordered as browse orders it: each of
-- the major, minor and patch numbers compares as a number, so 1.10.0 is above 1.9.0. A listing
-- whose highest version has no integrations gets an empty list. On an empty database it changes
-- no rows.
UPDATE `listings`
SET `chips` = coalesce((
	SELECT `versions`.`integrations`
	FROM `versions`
	WHERE `versions`.`handle` = `listings`.`handle` AND `versions`.`name` = `listings`.`name`
	ORDER BY
		cast(`versions`.`version` AS integer) DESC,
		cast(substr(`versions`.`version`, instr(`versions`.`version`, '.') + 1) AS integer) DESC,
		cast(substr(substr(`versions`.`version`, instr(`versions`.`version`, '.') + 1), instr(substr(`versions`.`version`, instr(`versions`.`version`, '.') + 1), '.') + 1) AS integer) DESC,
		`versions`.`version` DESC
	LIMIT 1
), '[]');
