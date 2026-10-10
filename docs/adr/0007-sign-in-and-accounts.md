# ADR 0007: Sign-in and accounts

**Status:** accepted, 2026-10-08. **Decided by:** David Dieruf.

## Decision

- Sign-in is through **GitHub, GitLab, Google or Microsoft**, presented equally. There are no passwords and no email sign-in.
- In the MVP, sign-in asks each provider for **identity only**: name, email, avatar and the provider's account ID. No repository, organization or other scopes are requested until the increment that adds linked files and provenance.
- Provider **tokens are used during the sign-in exchange and never stored**. Durables keeps a session of its own and the identity fields above.
- An account exists only once its first activity is published. A **handle** is chosen then, is personal, and can never be changed or reissued.
- One provider account can belong to only one Durables account.

## Why

Durables exists to publish activities, so accounts exist only for publishers, and identity is all the MVP needs from a provider. Asking for the minimum keeps the consent screens short and the data footprint small (ADR 0009). Not storing tokens removes the most damaging thing the site could leak. Permanent handles are what make addresses permanent.

## Consequences

- Session handling, the provider exchange and the identity record sit behind one auth interface in `api`, so adding scopes later (for provenance) or a backup sign-in (later increment) is an extension, not a rewrite.
- The four providers need four OAuth applications registered, with their client secrets supplied at deploy time (ADR 0003).
- Locally, sign-in needs a fake provider (ADR 0004).
- Because the account is created at first publish, the session carries the provider identity and the chosen handle until then. The handle is not reserved by choosing it; if someone else publishes under it first, the publish fails with a conflict and the publisher chooses again.
- Retired handles are kept in D1 forever, so a deleted or abandoned handle can never be claimed again.
