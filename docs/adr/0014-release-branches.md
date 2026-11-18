# ADR 0014: Collect changes on a release branch before they reach `main`

**Status:** accepted, 2026-11-16. **Decided by:** David Dieruf. Supersedes the branch rule in [ADR 0012](0012-work-on-main.md).

## Decision

- **Work collects on a release branch.** Each release cycle has one release branch, `release/<date>`, named for the day it is cut from `main` (for example `release/2026-11-16`). Epic and fix branches are cut from the current release branch, and their pull requests go into it.
- **`main` stays the default branch and the only branch that deploys.** A release reaches production through one pull request from the release branch into `main`, merged with a merge commit so each epic and fix keeps its own commit on `main`. Before merging it, run the **Plan** workflow and review its output, as the README describes.
- **The next cycle starts from `main`.** Once a release is merged, its branch is deleted and the next release branch is cut from `main`.
- **An urgent fix can go straight to `main`.** It branches from `main` and its pull request goes into `main`. `main` is then merged into the open release branch, so the fix is not lost or reverted by the next release.

## Why

Since ADR 0012, every merge into `main` has deployed to production on its own. That gave no point where finished work could be gathered, run together locally and tried before anyone saw it. The DUR-78 epic showed the gap: it was ready to merge, but it needed trying out alongside other changes before going live.

A release branch gives that point back without returning to the old `mvp` flow. Under ADR 0001, the release pull request held nothing back and was opened for each change. Here it is opened once per release, after the release branch has been tried.

It also matches the delivery pipeline, which cuts each epic's branch from the current release branch.

## Consequences

- When opening a pull request, choose the current release branch as its base. GitHub still offers `main` by default.
- CI's `check` runs on every pull request and on pushes to `main` and `release/**`. Only a push to `main` deploys.
- "Release:" pull requests return, one per release.
- Linear epics that say their branch is cut from `main` should say it is cut from the current release branch instead.
- Protecting `release/**` branches, such as requiring CI to pass before merging, is a repository setting and is not covered here.
