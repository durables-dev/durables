-- Renames the integration "AWS S3" to "Amazon S3" in each version's stored list. The other
-- integrations keep their place. Rows without "AWS S3" are not touched, so running it again
-- changes nothing.
UPDATE `versions`
SET `integrations` = (
	SELECT json_group_array(
		CASE WHEN `value` = 'AWS S3' THEN 'Amazon S3' ELSE `value` END
		ORDER BY `key`
	)
	FROM json_each(`versions`.`integrations`)
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`versions`.`integrations`) WHERE `value` = 'AWS S3'
);
