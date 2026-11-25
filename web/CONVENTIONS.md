# web conventions

The rules for working in `web/`: the React site, built with Vite to static assets the Worker serves. Read with the ADRs in `docs/adr/`, the brand guide in `docs/`, and DUR-2's experience rules.

## Status

- Branch from the current release branch and open pull requests into it. Only the release pull request into `main` deploys (ADR 0014).
- `src/` is bootstrap code. `main.tsx`, `app/`, `lib/api-client.ts` and `styles/` show the wiring and are real; the home feature is a placeholder with nothing to copy.
- The tooling configuration is real: `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `test/`, and the `web` block in the root `eslint.config.mjs`.

## Orientation

- Start at `src/main.tsx`, then `src/app/app.tsx` (providers) and `src/app/router.ts` (routes).
- There is no reference feature yet. The first vertical slice's feature folder becomes the shape to mirror, and is named here when it lands.

## Tooling is the style guide

- The shared tooling applies: Prettier, typescript-eslint, TypeScript 6 with `@tsconfig/strictest`. `npm run format:check`, `npm run lint` and `npm run typecheck` must pass.
- On top, `web` lints with `eslint-plugin-react-hooks` (the Rules of React and the Compiler's rules), `eslint-plugin-react-refresh`, `eslint-plugin-jsx-a11y` (recommended), file and folder naming, and the feature-boundary rule.
- The React Compiler is on. `useMemo`, `useCallback` and `memo` are never written by hand; the lint rule rejects the import.
- Vite 8 with `@vitejs/plugin-react` 6 and the Compiler's Babel preset.

## Where things go

- **By feature.** `src/features/<name>/` holds everything one area needs: its route module, components, hooks, queries and CSS modules. Features are `home`, `search`, `activity`, `contribute`, `account` and `legal`; add one only for a new area.
- `src/components/` holds shared primitives (button, code block, dialog, field). A component moves here only once a second feature needs it.
- `src/lib/` holds shared non-UI code: the API client, Problem Details handling, the Shiki highlighter.
- `src/app/` holds the router and the providers. `src/styles/` holds `tokens.css` and `global.css`.
- **A feature never imports from another feature.** It imports from `@/components`, `@/lib` and `@/app` only. The lint rule enforces it for both `@/` and relative imports.
- The `@/` alias means `src/`. Cross-folder imports use it; imports within a feature are relative.
- **Every file and folder is kebab-case**: `code-block.tsx`, `use-search.ts`, `home-page.module.css`. The lint rule enforces it.
- **Named exports everywhere.** A route module exports React Router's fields by name (`Component`, `loader`, `ErrorBoundary`), so nothing in `web` has a default export.
- A file exports only components (and constants), as the Fast Refresh rule requires. Hooks and helpers get their own files.
- Tests sit next to the code: unit tests are `*.test.ts`, component tests are `*.test.tsx`.

## Components

- Function components only, always named. Props are typed with an `interface` named `<Component>Props`; `children` is `ReactNode`.
- Derived values are computed during render. State holds only what cannot be derived and is not a prop.
- `useEffect` is for syncing with something outside React. It is never used to fetch data, to react to a prop or state change, or to run user-triggered logic; those belong in Query, render, and event handlers.
- Context is for values a subtree needs that would otherwise drill through several levels. A context's hook throws when its provider is missing.
- `useReducer` when several handlers update the same state; actions are named for the user interaction.
- Keys come from the data's identity, never from the array index on a list that can reorder or filter.
- Composition over configuration: a component with many boolean props is split, or takes `children`.

## State

- **Server state is TanStack Query.** Everything that comes from the API, including the signed-in user, is a query or a mutation. A route's `loader` prefetches into the Query cache with `ensureQueryData`; the component reads with `useQuery` or `useSuspenseQuery`.
- **After a mutation, the response is written into the cache** with `setQueryData` for the resource it changed, so the publisher sees the change at once (ADR 0006). Other queries it affects are invalidated. A mutation never refetches the resource it just received.
- **The activity page is two queries:** the version (immutable, long-cached) and the listing (mutable). They are never merged into one request (ADR 0006).
- **The signed-in user is a query** of the session endpoint, which answers 200 with no user for an anonymous visitor. Being anonymous is not an error state.
- **The contribute wizard's draft** is a `useReducer` provided through context inside the contribute feature. The URL identifies the step. The draft is mirrored to `sessionStorage` so a reload keeps the pasted code, and is cleared on publish. Nothing else is stored in the browser.
- **URL state:** search text and filters live in the URL's search params and are parsed with Zod. The pagination cursor does not; a shared link opens page one.
- **Theme** follows `prefers-color-scheme`. There is no toggle and nothing is stored in the browser.
- No state library.

## Routing

- React Router 8 in data mode: `createBrowserRouter` in `src/app/router.ts`, one entry per route, every route `lazy`, so each feature is its own chunk.
- Route params arrive as strings and are parsed with Zod in the route module. An invalid param renders the not-found page.
- Links are `<Link>` and `<NavLink>`. Route `action`s are not used; forms are React actions (below), and a successful one calls `navigate()`.
- **Top-level routes are reserved words.** Activity pages live at `/:handle/:name`, so every other top-level path (`search`, `contribute`, `terms`, `privacy`, `security`, `api`, and any added later) is on the reserved-handle list in `@durables/schemas`. Adding a top-level route means adding it there.

## Data

- `src/lib/api-client.ts` holds the one `hc<AppType>("/")` instance. Nothing else calls `fetch`.
- Responses are read with Hono's `parseResponse`, which throws `DetailedError` on a non-2xx status. `src/lib/problem.ts` narrows it to a typed `ProblemDetails`, and that is what every query and mutation exposes as `error`.
- The UI branches on a Problem Details `type`, never on message text.
- Request bodies are typed by the API's `AppType`; no hand-written request or response types.

## Forms

- React 19's `<form action>` with `useActionState`. Fields are uncontrolled and read from `FormData` in the action.
- Each form validates with the Zod schema from `@durables/schemas` before calling the API, and shows the field errors inline. The API validates again; its 400 carries `errors: [{ field, message }]`, shown the same way. A 422 (two activities, unrecognised SDK) has no field and is shown as the step's message.
- The paste step is a `<textarea>` with a line-number gutter kept in step with its scroll position. No editor package.
- The wizard validates one step at a time, in that step's action, and only then dispatches to the draft reducer.
- Pending state comes from `useFormStatus` or the action's `isPending`, never from hand-written flags.

## Styling

- **CSS Modules**, one `<component>.module.css` beside each component, imported as `styles` and read with bracket access (`styles["headline"]`), which `noPropertyAccessFromIndexSignature` requires.
- **Every colour, font, size and radius is a token from `src/styles/tokens.css`.** Components use semantic tokens (`--bg`, `--fg`, `--surface`, `--accent`), not palette names, so the Cream theme works without changes.
- Dark first: Ink is the default and Cream applies under `prefers-color-scheme: light`. New work is checked in both.
- Flat colour only: no gradients, shadows or glows. Corners are `--radius-panel`, `--radius-control` and `--radius-tag`.
- Ember is never used as an error colour. Evaluation and status states use neutral colour and text.
- Fonts are self-hosted through `@fontsource` and loaded once in `global.css`. No request to Google Fonts.
- Global styles stop at `global.css`: element defaults and focus rings. Everything else is a module.

## Code display

- One `CodeBlock` component in `src/components/` renders every block of code: line numbers, a copy button with an accessible name, and the "copied" status region.
- Highlighting is Shiki, from `src/lib/highlighter.ts`: `shiki/core`, the JavaScript regex engine, and each language's grammar loaded on demand. Themes are built from the tokens.
- Published source is shown exactly as pasted. Durables-generated code (snippets, commands) arrives from the API already formatted; `web` never reindents or rewrites code.
- Copying uses `navigator.clipboard.writeText`. A rejected copy shows a message; it never fails silently.

## Accessibility

`e2e` locates elements by role and label, so these are requirements, not preferences:

- Semantic elements: `<button>`, `<a href>`, `<nav>`, `<main>`, `<h1>`–`<h3>` in order, `<dialog>`. Never a `div` or `span` with a click handler.
- Every form field has a `<label for>` association. Every icon-only button has an `aria-label` naming its action ("Copy install command").
- Dialogs are native `<dialog>` opened with `showModal()`, and focus returns to the opener on close.
- Each wizard step moves focus to its heading when it appears.
- Feedback such as "Copied" is announced through a `role="status"` region that exists in the initial markup.
- No request leaves the page except to our own origin and the Cloudflare analytics beacon (ADR 0009). `public/_headers` enforces it with a Content-Security-Policy on every page, and sets the other security headers. Pages never pass through the Worker, so this file is the only place page headers can be set.
- The beacon is the one third-party script: a `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "…"}'>` in `index.html`, with the token from `infrastructure`'s `site-token` output. The token is not a secret.
- Publishers are shown by handle and initials, never by a provider-hosted avatar, which would be a request to another origin.

## Dependencies

- **Approved packages:**
  - `react`, `react-dom`, `react-router`
  - `@tanstack/react-query`
  - `hono` (the client only), `zod`, `@durables/schemas`
  - `shiki`
  - `@fontsource-variable/space-grotesk`, `@fontsource-variable/ibm-plex-sans`, `@fontsource/ibm-plex-mono`
  - for tests: `vitest`, `@vitest/browser-playwright`, `vitest-browser-react`, `msw`
- Adding any other package is an architect decision. Stop and raise it as a question; do not add it.
- Build, lint and test tooling (`vite`, the React plugin and Babel presets, ESLint plugins) is the architect's and is outside this list.

## Test levels

- **Unit tests** (`*.test.ts`) run in plain Vitest under Node: pure functions such as param parsing, Problem Details narrowing, and formatting helpers.
- **Component tests** (`*.test.tsx`) run in real Chromium through Vitest's browser mode, with `vitest-browser-react`'s `render` and locators (`getByRole`, `getByLabelText`).
  - Only the API is faked, with MSW handlers in `test/handlers.ts`; a test overrides them with `worker.use()`. An unhandled request to `/api` fails the test.
  - The router, Query and internal components are real. No module mocking.
  - Tests assert what a user sees and does, never component internals or state.
- **Commands:**
  - `npm test` in `web` runs both levels.
  - `npm run test:unit` and `npm run test:component` run one level alone.
  - The root `npm test` includes `web`.
- Before handing back, run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.
- **Deliberately not tested here:**
  - Page-to-page flows and anything needing the real API. They live in `e2e/`.
  - The API's behaviour, which `api` tests.
  - That the edge serves cached responses.
- **Owed to `e2e`:** the accessibility rules above, and stable headings on every page, since `e2e` finds pages by their `h1`. `e2e` also scans every page it lands on with axe for WCAG 2.1 A/AA violations; a violation is fixed here, never excluded there.

## Deliberately the specialist's call

- How a component is split into smaller components, and what they are called.
- Whether a hook or helper stays private to its file or gets its own file within the feature.
- Class names inside a component's CSS module.
- Which component tests to add beyond the story's acceptance criteria.
- Loading and empty-state wording, where the design does not give it.

## Never in this codebase

1. A class component.
2. `useMemo`, `useCallback` or `memo` written by hand. The Compiler does it.
3. Fetching in `useEffect`. Server data goes through TanStack Query.
4. An import from another feature's folder.
5. A package that isn't on the approved list.
6. A colour, font or radius that isn't a token from `tokens.css`. No gradients or shadows.
7. A request to any origin other than our own, except the analytics beacon.
8. An interactive element without an accessible name, or a form field without a label.
9. A `div` or `span` with a click handler where a `button` or `a` belongs.
10. Published source reformatted or reindented for display.
11. Array index as `key` on a list that can reorder or filter.
12. State that mirrors a prop, or stores something derivable from other state.
13. `dangerouslySetInnerHTML`, except the one place Shiki's output is rendered.
14. An `eslint-disable` without a comment explaining why, or a weakened lint or compiler setting.
15. A star rating, count or any other popularity signal (DUR-2).
