# ADR 0011: Develop and test in a dev container

**Status:** accepted, 2026-10-08. **Decided by:** David Dieruf. Extends [ADR 0004](0004-local-development.md).

## Decision

All local development and testing runs inside one dev container, defined in `.devcontainer/`. It pins the toolchain: the Node.js major, Terraform, the Playwright browser matching the installed `@playwright/test`, and the Linux build of the Workers runtime that Wrangler installs. CI runs in the same container. Running natively on a developer's machine is not supported.

ADR 0004 still holds inside the container: Wrangler's local mode emulates the Workers runtime, D1 and R2, with no Cloudflare account.

## Why

Durables is meant to be worked on by people other than its first developer, so getting started must not depend on what is already installed on their machine. On the first run of the scaffold, both failures came from the machine rather than the code: an outdated Visual C++ runtime crashed the Windows build of the Workers runtime, and a Playwright browser cache did not match the installed Playwright. A container makes the environment part of the repository, identical on Windows, macOS and Linux and in CI. The only prerequisites left are Docker and an editor that opens dev containers.

## Consequences

- The container pins the toolchain, not production. Fidelity to production still comes from the Wrangler version (which bundles the runtime) and `compatibility_date`, both pinned in `api/`.
- Installed packages and Wrangler's local D1 and R2 state live in Docker volumes rather than the source mount, so native binaries stay Linux-only and SQLite never sits on a host file share.
- Edits made outside the container raise no file events through a Windows or macOS mount, so file watchers poll (`CHOKIDAR_USEPOLLING`). This costs some CPU and keeps reloads working whichever side the edit comes from.
- Upgrading Node.js, Terraform or the base image is a change to `.devcontainer/`, reviewed like any other.
