# packages conventions

The rules for working in `packages/`: the shared TypeScript packages that `api` and `web` both import. They hold for every package here; `@durables/schemas` is the only one today. Read with `api/CONVENTIONS.md` and `web/CONVENTIONS.md`, whose code runs these packages, and the ADRs in `docs/adr/`.

## Status

- Branch from the current release branch and open pull requests into it. Only the release pull request into `main` deploys (ADR 0014).
- `packages/schemas` is real precedent, all of it.

## Orientation

- Start at `packages/schemas/src/index.ts`, the package's public surface. `packages/schemas/src/listing.ts` is the shape to mirror.

## Tooling is the style guide

- The shared tooling applies: Prettier, typescript-eslint, TypeScript 6 with `@tsconfig/strictest`. `npm run format:check`, `npm run lint` and `npm run typecheck` must pass.

## What a package holds

- A package holds only what both `api` and `web` use, and nothing that depends on where it runs:
  - validation schemas, and the limits and patterns behind them
  - the user-facing wording for each rule, so the API's 400s and the site's inline errors say the same thing
  - shared value lists that both surfaces store or show, such as the integrations list
  - small pure functions over those values, such as `compareVersionNumbers` and `checkHandleRule`
- Something only one surface uses stays in that surface.
- Nothing SDK-specific. Per-SDK knowledge lives in `api`'s SDK registry.

## Where things go

- A package is `packages/<name>/`, named `@durables/<name>`: private, an ES module, exporting its TypeScript source from `./src/index.ts` with no build step, with a `tsconfig.json` that extends the root `tsconfig.base.json` and a `typecheck` script.
- One file per resource under `src/`, named in kebab-case: `handle.ts`, `listing.ts`.
- `index.ts` re-exports every public name explicitly. The list is the package's public surface.
- Names follow one pattern:
  - the schema is `<field>Schema`
  - its limits are `<field>MaxLength` and `<field>MinLength`
  - its pattern is `<field>Pattern`
  - its wording is `<field>EmptyMessage`, `<field>TooLongMessage` and `<field>FormatMessage`
  - wording that names a value is a function, such as `handleTakenMessage(handle)`
- Every export has a doc comment that states its rule in plain words, such as "1 to 160 characters once leading and trailing whitespace is trimmed."

## Writing a rule

- Zod 4, with wording given through the `error` option.
- Emptiness is checked first, with `abort: true`, so an empty value gets the empty wording and nothing else.
- Free text is trimmed: titles, descriptions, reasons, What changed notes. The parsed value is the trimmed text, so whitespace alone counts as empty.
- Identifiers are never trimmed or lowercased: handles, names in the address, version numbers. Uppercase is refused, so what is stored is exactly what the publisher typed.
- A limit is written once, as its named constant. Wording interpolates the constant: `` `Use at most ${listingTitleMaxLength} characters.` ``

## Changing a rule stored data depends on

- Stored data is checked against these rules on every read: `web` resolves each activity address through `handleSchema` and `listingNameSchema`, listings store integration names exactly as the list spells them, handles are permanent (ADR 0007) and published versions never change (ADR 0005).
- Widening is story work: a new schema, a new integration, a new reserved word no one holds, a looser limit.
- Anything that could make stored data fail a rule is an architect decision: renaming or removing an integration, tightening a limit or pattern, reserving a word someone holds. The story stops and raises it as a question. If it is approved, the same epic carries the `api` migration for the stored data.

## Dependencies

- `zod` is the only dependency, declared as a peer.
- Adding any other dependency is an architect decision, because a package's code runs inside both `api` and `web`. Stop and raise it as a question; do not add it.

## Test levels

- A package has no tests of its own. A rule is tested where it is applied: an `api` test for the request it validates and the wording it returns, a `web` test for the inline error.
- A story that changes a package also carries `surface:api` and `surface:web` for the code and tests that use the change.
- **Commands:** the root `npm test` runs the consumers' tests. Before handing back, run `npm run format:check`, `npm run lint`, `npm run typecheck` (which includes every package), `npm test` and `npm run build`.
- **Owed to `api` and `web`:** the exports in `index.ts` are the contract. Renaming or removing one changes `api` and `web` in the same story; the root typecheck enforces it.

## Deliberately the specialist's call

- How a file is organised inside, and private helpers that are not exported.
- The wording of doc comments.
- A limit or wording that the story and its map do not give: pick one consistent with its neighbours and flag it in the pull request. Wording the map gives is never changed.

## Never in this codebase

1. An import from `api`, `web`, the Workers runtime, the DOM, or a `node:` module.
2. Anything only one surface uses, or anything SDK-specific.
3. As story work, a change that could fail stored data: renaming or removing an integration, tightening a limit or pattern, or reserving a word someone holds.
4. `export *`, or an export without a doc comment.
5. A limit written twice: a number repeated in wording instead of interpolated from its constant.
6. An identifier trimmed or lowercased, instead of refused.
7. A dependency other than `zod`, or a build step. Packages export their source.
8. An inline `eslint-disable` without a comment explaining why, or a weakened lint or compiler setting.
