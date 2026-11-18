-- Gives every version with an empty description its listing's description (ADR 0015), before
-- the next migration removes the listing's description column. Until then, a first publish wrote
-- the description to the listing only, so a version published after migration 0004 has an empty
-- one. A version that already has a description keeps it.
UPDATE `versions`
SET `description` = (
	SELECT `listings`.`description`
	FROM `listings`
	WHERE `listings`.`handle` = `versions`.`handle` AND `listings`.`name` = `versions`.`name`
)
WHERE `description` = '';
