# e2e conventions

The rules for working in `e2e/`: the Playwright flow tests that drive the real site against the real local API, D1 and R2 (ADR 0004, 0011). Read with `web/CONVENTIONS.md`, whose accessibility rules this surface depends on.

## Status

- `tests/smoke.spec.ts` is bootstrap: two checks that the stack is up. Nothing in it is the shape of a real test.
- `playwright.config.ts` and `fixtures.ts` are real. The `webServer` block is how the stack starts, and every fixture starts here.

## Orientation

- Start at `fixtures.ts`, then `playwright.config.ts`. The first journey test becomes the reference shape, and is named here when it lands.

## Tooling is the style guide

- The shared tooling applies: Prettier, typescript-eslint, TypeScript 6 with `@tsconfig/strictest`. `npm run format:check`, `npm run lint` and `npm run typecheck` must pass. `no-floating-promises` is the rule that matters most here: an un-awaited assertion passes silently.
- Playwright 1.64, pinned with `@playwright/test`; the browser build is installed by the dev container to match it.

## Where things go

- Tests are `tests/<area>.spec.ts`, one file per feature area (`contribute`, `search`, `activity`, `legal`). Journeys that cross areas go in `tests/journeys.spec.ts`.
- Every fixture lives in `fixtures.ts`. Tests import `test` and `expect` from `../fixtures`, never from `@playwright/test`.
- Sample activity files live in `samples/`, as `.txt`, one per SDK, read with `fs.readFileSync` in the test that pastes them.
- No page objects. Locators are written in the test, by role, label or text.

## Tests

- **Every test is independent.** Its own context, its own data, no reliance on another test or on order. `test.describe.configure({ mode: "serial" })` is not used.
- **One level, flow tests, in Chromium.** Nothing is faked: the real site, API, D1, R2 and fake sign-in provider.
- **Journeys and small tests.** One test per Definition-of-done outcome walks the whole flow and is tagged `@journey`; everything else is a small test that creates its state through the API with the `request` fixture and tests one thing.
- **Data is created per test, with unique names.** Handles derive from the worker index, activity names from `testInfo.testId`. Nothing is cleaned up; the local stores are disposable.
- **Sign-in is per worker.** A worker-scoped fixture signs in once through the fake provider's page with a unique identity, saves the browser state, and every test in that worker reuses it. Tests that need an anonymous visitor opt out with an empty `storageState`.
- **Locators** are `getByRole` first, then `getByLabel` and `getByText`, chained or filtered until unique. A missing accessible name is fixed in `web`, not worked around.
- **Assertions** are the auto-retrying `expect(locator)` matchers, awaited. No `waitForTimeout`.
- **Accessibility:** every page a test lands on gets `await expectAccessible()`, which asserts no WCAG 2.1 A/AA violations and attaches axe's results to the report.
- **Rate limits:** publishing is limited to 10 per session per minute locally (ADR 0006). CI runs one worker; locally the default. A test that needs more than ten publishes signs in again.

## Configuration

- Playwright's own defaults for stability: on CI, two retries, one worker, `forbidOnly`; everywhere, trace on first retry and screenshot on failure. `webServer` reuses running servers only outside CI.
- `baseURL` is the Vite server. Tests reach the API through it, never on 8787 directly, so they see what a visitor sees. Only the `webServer` readiness probe talks to 8787.

## Dependencies

- **Approved packages:** `@playwright/test`, `@axe-core/playwright`.
- Adding any other package is an architect decision. Stop and raise it as a question; do not add it.

## Test levels

- **Commands:** `npm run e2e` at the root, or `npm test` in `e2e`. `npx playwright test --grep @journey` runs the journeys alone. `npx playwright show-report` opens the last report after a failure.
- Before handing back, run `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm run e2e`.
- **Deliberately not tested here:** anything a component test in `web` or an integration test in `api` can prove; browsers other than Chromium; visual appearance; the deployed site.
- **Owed by `web`:** the accessibility rules in its conventions, and an `h1` on every page, which is how a test knows it arrived.
- **Owed by `api`:** `/api/health`; the fake provider signing in as any identity named; the publish endpoints usable through the `request` fixture.

## Deliberately the specialist's call

- How a long journey is broken into `test.step` blocks, and their names.
- Which fixtures a test composes, as long as they live in `fixtures.ts`.
- The text of sample activity files in `samples/`.
- Which extra small tests to add beyond a story's acceptance criteria.

## Never in this codebase

1. `page.waitForTimeout`, or any sleep. Auto-retrying assertions and locators instead.
2. A CSS or XPath selector, or `getByTestId`, where a role, label or text locator exists. If the page has no accessible name, the fix is in `web`, not the test.
3. A test that depends on another test's data or order, or `test.describe.configure({ mode: "serial" })`.
4. A test that signs in with a fixed handle. Handles come from the worker index.
5. A sample activity edited to make detection pass. Samples are real code; if detection fails on real code, that's a finding.
6. `test.only` committed, which CI rejects anyway.
7. A test that reaches the deployed site, or any origin other than the two local servers.
8. An un-awaited assertion or action, which the lint rule rejects.
9. An axe violation excluded or a rule disabled without a comment naming the issue it tracks.
