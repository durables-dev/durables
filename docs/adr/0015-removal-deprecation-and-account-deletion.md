# ADR 0015: Removal, deprecation and account deletion

**Status:** accepted, 2026-11-16. **Decided by:** David Dieruf. Adds to [ADR 0005](0005-data-stores.md), [ADR 0006](0006-caching-and-rate-limits.md) and [ADR 0007](0007-sign-in-and-accounts.md).

## Decision

- **Removal is recorded on the listing as who removed it, not as a yes/no flag.** A listing is either listed or removed by one of: the publisher, account deletion, or Durables (a later increment, for reported listings). Each way back clears only its own kind of removal:
  - **Return to search** and **publishing a new version** clear a publisher removal.
  - **Restoring the account** clears an account-deletion removal.
  - Nothing a publisher does clears a removal by Durables.
- **Removal covers the whole listing.** A removed listing is left out of search, browse (including search by publisher) and the sitemap, and its version pages tell search engines not to index them. Its pages and every version's address keep working.
- **Deprecation is recorded per version**, with a required reason and an optional replacement, which must be another version of the same listing. Undoing it deletes the record.
- **Both are mutable state in D1, kept apart from the immutable version.** Neither is written to a version's R2 object or returned by the version endpoint. Both are served with the listing's other mutable fields, under the listing's short cache rules (ADR 0006).
- **Deleting an account has a 30-day grace period.**
  - **When the publisher deletes it,** the account is marked pending deletion with the time it was asked for. Every listing that is listed at that moment is removed by account deletion, and the session ends. The account, its provider links and its handle are kept, so the handle can't be claimed and the same provider account is recognized if it signs in again.
  - **If that provider account signs in during the 30 days,** the publisher chooses **Restore** or **Start as a new user**.
    - **Restore** clears the pending mark and returns to search the listings removed by account deletion. Listings the publisher had removed themselves stay removed.
    - **Start as a new user** makes the deletion final at once, then continues to Contribute as someone with no account.
  - **After 30 days,** a scheduled job makes the deletion final: it deletes the account's provider links and adds its handle to the retired handles. The account, handle, listing and version rows stay, because published addresses keep resolving.

## Why

**Removal.** A listing will be removed for different reasons by different people, and each needs a different way back. A flag can't tell a publisher's choice from a maintainer's action, so a publisher could undo a removal for harm by publishing a new version. Recording who removed it lets each path clear only what it owns. Restore relies on the same record to put back exactly the listings that account deletion took out.

**Deprecation.** Versions never change once published (ADR 0005), and their pages are cached for a year (ADR 0006). A deprecation is added later and can be undone, so it can't live in the version's document or response. Keeping it with the listing's mutable fields reuses a path that already exists for the description.

**Grace period.** Recognizing a returning provider account forever would mean keeping its account ID after its owner asked to be deleted. That is the complaint the deletion promise exists to avoid, and hashing the ID wouldn't change it, because a hash still identifies the person. A bounded window covers the accidental case and keeps deletion honest.

## Consequences

- **What is kept, and for how long.** D1 holds only each provider link's provider and account ID. The name, email and avatar live only in the signed session cookie (`api/src/auth/auth.ts`), so ending the session at deletion removes them. During the grace period D1 keeps the provider links. Final deletion removes them.
- **The Privacy page must say so.** It should state that a deleted account can be restored by signing in within 30 days, that the provider account ID is kept until then, and that it is deleted afterward. Its "How long it's kept" and "Your choices" sections change. As of this record, the page also says Durables keeps the name, email and avatar, without saying they live only in the session. That wording should be checked in the same change.
- **A scheduled Worker.** The final-deletion job is a Cron Trigger on the api Worker, declared where `infrastructure/` defines the Worker (ADR 0003) and runnable locally through Wrangler (ADR 0004). It runs daily, finalizes every account whose deletion was asked for more than 30 days earlier, and does nothing for the rest. A deletion therefore becomes final up to a day after its 30 days are up.
- **Final deletion frees the provider account.** Once its link is deleted, the same provider account can sign in as a new person and choose a new handle. The retired handle can never be chosen again (ADR 0007).
- **Version pages read removal and deprecation from the listing.** The banners for "Removed by the publisher" and for a deprecated version come from the listing request the page already makes, not from the cached version response.
- **Search, browse and the sitemap filter on removal state.** The search index (ADR 0005) needs the removal state in the rows it reads.
- **A pending account can't act.** While deletion is pending, signing in with its provider account leads only to the Restore choice, so nothing can be published or changed under the handle until it is restored.
