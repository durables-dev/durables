# web conventions (PoC)

This is a proof of concept. These conventions cover structure only. They are
rewritten if the PoC graduates.

Stack: TypeScript, React, Vite, React Router, `@monaco-editor/react`, npm
with its own `web/package.json`.

## Layering

Top to bottom:

1. `src/pages/`: one component per URL. Composes features. No fetch calls.
2. `src/features/<feature>/`: the components and hooks for one part of the
   UI. The features are:
   - `paste-editor`
   - `detection-panel`
   - `declaration-form`
   - `readme-editor`
   - `listing`
   - `snippet-tabs`
   - `evaluation-report`
   - `group-editor`
   - `search`
3. `src/components/`: shared presentational pieces (`CopyButton`, `Badge`,
   `Tabs`, `code/CodeView`). No API calls, no knowledge of any feature.
4. `src/api/`: the only place that calls `fetch`. One file per resource
   (`activities.ts`, `groups.ts`, `search.ts`), with types in
   `src/api/types.ts`.

Calls go downward only. Pages call features. Features call components and
`src/api/`. A feature never imports another feature. Anything two features
need moves to `src/components/`.

### Routing

All routes are declared in `src/routes.tsx`. Paths mirror Durables addresses:

| URL                              | Route pattern                   | Page                   |
| -------------------------------- | ------------------------------- | ---------------------- |
| `/publish`                       | `/publish`                      | paste, declare, README |
| `/groups/new`                    | `/groups/new`                   | group editor           |
| `/search`                        | `/search`                       | search                 |
| `/<owner>/<name>@<version>`      | `/:owner/:nameAtVersion`        | activity listing       |
| `/<owner>/groups/<name>@<version>` | `/:owner/groups/:nameAtVersion` | group listing          |

React Router cannot match a param inside part of a segment, so the whole
`<name>@<version>` segment is one param. Pages split it with `parseAddress()`
from `src/lib/address.ts` and nowhere else. An address without `@<version>`
opens the default version.

`src/lib/` holds pure helpers with no React and no fetch calls. Any layer may
import it.

### Monaco

`src/components/code/CodeView.tsx` is the only wrapper around
`@monaco-editor/react`. Every piece of code on the site renders through it:
the paste editor, the group editor, the evidence view with highlighted lines,
and the snippet tabs (read-only). Nothing else imports Monaco.

## Boundaries

web owns the UI only. It reaches api only over HTTP, through `src/api/`,
using the contract in the epic's API map. `src/api/types.ts` is written from
the API map. It is never imported from `api/`.

All of these run in api, and web only displays their results: detection,
pattern checks, snippet generation, version suggestion, group resolution and
import merging. The group editor sends the pasted addresses to api and
renders the resolved file it gets back.

In development the client calls relative `/api/...` paths. `vite.config.ts`
proxies `/api` to `VITE_API_TARGET` (default `http://localhost:3000`) and
strips the `/api` prefix.

### Stubs

| Faked             | Where in web                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| Accounts, sign-in | a user switcher in the header, backed by `src/auth/CurrentUserProvider.tsx` and `useCurrentUser()`, standing in for a real session. The `src/api/` client adds the `X-Durables-User` header from it. |
| Search            | filters are sent to api. web does no filtering of its own.                                                     |
| Verified badge    | web displays the field api returns. Nothing more.                                                              |

## Naming

- Component files: PascalCase (`SnippetTabs.tsx`). Hooks: `useThing.ts`.
- Directories and non-component modules: kebab-case.
- Named exports only. No default exports.
- Styles: CSS Modules, colocated (`SnippetTabs.module.css`). No UI component
  library.
- New UI goes in `src/features/<feature>/`.
- A new URL adds `src/pages/<Name>Page.tsx` and one line in `src/routes.tsx`.

## Tests

Tests are optional on this PoC; the demo gate verifies it. If you write one:

- Vitest with React Testing Library, colocated as `<File>.test.tsx`.
- Run with `npm test` in `web/` (`vitest run`).

## Shortcuts

Every shortcut is marked where it lives, with a comment in the file's own
syntax:

    POC-SHORTCUT: SC-###

and has a row in the project's shortcut ledger. A marker with no row, or a
row with no marker, is a defect. Prefer a stub behind a real interface over a
real integration anything on the faked-by-design list names.

## Never

- Call `fetch` outside `src/api/`, or import from `api/`.
- Reimplement api logic in the browser: detection, pattern checks, snippets,
  group resolution, or versioning.
- Import Monaco outside `src/components/code/CodeView.tsx`.
- Call Claude or any other AI or LLM.
- Add a dependency without naming it in the hand-back.
