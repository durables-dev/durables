# ADR 0012: Work on `main` now the site is live

**Status:** accepted, 2026-11-12. **Decided by:** David Dieruf. Supersedes the branch rule in [ADR 0001](0001-fresh-start.md). The branch rule is superseded by [ADR 0014](0014-release-branches.md): work now collects on a release branch before it reaches `main`.

## Decision

`main` is the only long-lived branch and the default branch. Work branches from `main` and pull requests go into `main`. Merging a pull request into `main` deploys it to production.

The `mvp` branch is deleted. The `p-o-c` branch is deleted too, although ADR 0001 said it would stay as history; its last commit was `70a6e18`.

## Why

ADR 0001 built the MVP on `mvp` so that `main` stayed empty until the first release. Durables went live on durables.dev, and after launch each change was going into `mvp` and then straight on to `main` through a separate release pull request. The second step added a pull request per change and protected nothing: the release was never held back or batched. The proof of concept has served its purpose, and its record lives in the Linear project (P-POC-145 and its issues).

## Consequences

- Every merge into `main` is a production deploy. Review the pull request and the **Plan** workflow's output before merging, as the README describes.
- CI runs on every pull request and on pushes to `main`, which now covers all work. The workflows needed no change.
- There are no "Release:" pull requests any more.
- The rest of ADR 0001 still holds: nothing from the proof of concept is reused.
