# @durables/schemas

The rules and shared lists that `api` and `web` both use. How to work in this package is in `packages/CONVENTIONS.md`.

This README covers one job: changing the categories and chips, and giving a listing its chips.

## Categories and chips

A **chip** is an integration, such as Stripe, or a workflow pattern, such as Saga. "Chip" is the internal word. Text a visitor reads always says "Filter" or "Filters".

A **category** groups chips. The site shows each category as a home page tile and as a heading in the filter sidebar, with its chips under it.

The list lives in `src/category.ts`, in `categories`. Its order is the order the site shows. Each category has:

- `name`, the heading and tile label
- `help`, the line under the heading
- `chips`, in the order they show under the heading

Two rules always hold:

- Every chip belongs to exactly one category.
- There is no All chip. A visitor turns single chips on and off.

The chips come from two lists:

- Integrations are in `integrations` in `src/listing.ts`. Detection in `api` finds them in a version's imports.
- Workflow patterns are in `patterns` in `src/category.ts`. The Workflow patterns category lists `patterns` as its chips. Detection never produces a pattern.

### Names the site doesn't know

The site matches a chip or category name to this list ignoring case and surrounding whitespace, so "stripe" and " Stripe " find Stripe. A name that matches nothing in the list is ignored. That holds for names stored on a listing and for names in a search address. A link with an unknown category shows every activity.

Nothing checks names before release. A misspelt chip in a migration is stored, then ignored, with no error. Migrations store names as written and compare them exactly, so the rename SQL below skips a listing holding "old name" when it looks for "Old name". Spell every name exactly as this list does.

Category names are never stored on a listing. Listings store chip names only.

## Adding a category

1. Add an entry to `categories` in `src/category.ts`, at the position it should show. Give it a `name`, a `help` line and its `chips`.
2. Move chips into it from other categories, or add new chips (see below). A chip stays in exactly one category.
3. Update the tests that list the categories (see [Checks](#checks)). `web` may also need work for the new tile and heading.

No migration is needed. Listings store chips, not categories, so a listing whose chips move shows under the new category from the same release.

## Renaming a category

1. Change its `name` in `categories`.
2. Update the tests that name it.

No migration is needed. An old link to `/search?category=<old name>` then carries an unknown name, so it shows every activity.

## Adding a chip

Decide which category the chip joins. Add it to that category's `chips` at the position it should show.

**An integration** also goes in three more places:

1. `integrations` in `src/listing.ts`.
2. `integrationPackages` in `api/src/checks/integrations.ts`, with the packages that imply it, so detection can report it.
3. The `api` and `web` tests that list the integrations or a category's chips.

**A workflow pattern** goes in `patterns` in `src/category.ts`. That adds it to the Workflow patterns category.

Adding a chip gives no listing that chip. Detection never writes chips to a listing. Give listings the new chip with a migration (see [Giving a listing chips](#giving-a-listing-chips)).

Adding an integration or pattern is story work. A story that changes this package also carries `surface:api` and `surface:web`.

## Renaming a chip

Renaming a chip that listings hold is an architect decision (`packages/CONVENTIONS.md`). Raise it as a question first.

A rename has two parts, and they ship in the same release:

1. Change the name in the list: in its category's `chips`, and in `integrations` or `patterns`. For an integration, change it in `integrationPackages` in `api/src/checks/integrations.ts` too. Update the tests that name it.
2. Add a migration that rewrites every listing holding the old name. Without it, those listings keep the old name, the site ignores it, and they drop out of that filter.

Make the migration as in [Making the migration](#making-the-migration). It mirrors `api/migrations/0002_amazon-s3-integration-name.sql`, applied to the listing's chips:

```sql
-- Renames the chip "Old name" to "New name" on every listing that has it. The other chips keep
-- their place. Listings without "Old name" are not touched.
UPDATE `listings`
SET `chips` = (
	SELECT json_group_array(
		CASE WHEN `value` = 'Old name' THEN 'New name' ELSE `value` END
		ORDER BY `key`
	)
	FROM json_each(`listings`.`chips`)
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`listings`.`chips`) WHERE `value` = 'Old name'
);
```

Removing a chip follows the same rules. Raise it first, and add a migration that takes it off the listings that hold it.

## Giving a listing chips

A listing's chips are stored on the listing, in the `chips` column of `listings`, as a JSON array of chip names. They apply to every version of the listing, including versions published later.

Only the operator's migrations write chips. Publishing writes none, so a new listing has no chips until a release gives it some. A listing with no chips still shows in search and browse without a filter.

Each migration:

- names the listings it changes, by handle and name
- fully overwrites each named listing's chips with the list it gives
- leaves every listing it does not name untouched
- is never edited once applied anywhere. To change a listing's chips again, add a new migration.
- takes effect at release

### Making the migration

From `api/`, run:

```sh
npx drizzle-kit generate --custom --name short-description
```

This creates an empty `api/migrations/NNNN_short-description.sql` and records it in `api/migrations/meta/_journal.json`. Commit both. Always pass a name.

Write one `UPDATE` per listing. Start the file with a comment saying what it does:

```sql
-- Gives acme/charge-card and acme/refund-charge their chips, replacing any they had. Listings
-- not named here keep theirs. On a database without these listings it changes no rows.
UPDATE `listings` SET `chips` = '["Stripe","Approval"]'
WHERE `handle` = 'acme' AND `name` = 'charge-card';

UPDATE `listings` SET `chips` = '["Stripe"]'
WHERE `handle` = 'acme' AND `name` = 'refund-charge';
```

- List every chip the listing should have. The new list replaces the old one, so a chip left out is removed.
- `'[]'` takes every chip off a listing.
- Write chip names exactly as the list spells them, in the list's order.
- Name only listings that exist. A handle and name that match nothing change nothing, without an error. That is also why the migration runs cleanly on empty local and e2e databases.

To apply it to your local database, run `npm run db:migrate:local --workspace api`.

### How it reaches the site

The migration goes into the current release branch by pull request, like any other change. When the release pull request merges into `main`, the deploy applies every new migration, before the new Worker version deploys. The listings show their new chips from then on.

## Checks

Before opening a pull request, run from the repository root:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

The tests that pin the list are in `api/src/checks/categories.test.ts` and `api/src/checks/integrations.test.ts`. They check the categories and their order, that every chip is in exactly one category, and that detection reports every integration and no pattern. A change to the list changes those tests in the same pull request.
