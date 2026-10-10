# ADR 0009: Analytics and privacy

**Status:** accepted, 2026-10-08. **Decided by:** David Dieruf.

## Decision

- Site analytics are **Cloudflare Web Analytics**: aggregate page views and referrers, no cookies, no fingerprinting, no consent banner.
- Durables keeps the smallest data footprint it can: the identity fields from sign-in (ADR 0007), the content people publish, and server logs. Reports (a later increment) are anonymous. The Workflow Builder (a later increment) runs in the browser and sends nothing to the server.
- Counts the site already knows (publishes, versions) are taken from Durables' own data, not from the analytics tool.

## Why

The operator is an individual, and the site has no income. Collecting little limits what can leak, what must be disclosed, and what laws apply. A cookie-free tool avoids a consent banner entirely, and Cloudflare's is free and in the same account as hosting (ADR 0002).

## Consequences

- The Privacy page names Cloudflare as a recipient of visitor requests, and names each sign-in provider. It is written for a lawyer's review before launch.
- No third-party scripts are loaded on any page other than the analytics beacon. A Content-Security-Policy on every page (`web/public/_headers`) allows only our origin and the beacon's. The beacon is a snippet in `web/index.html`, with the site token that `infrastructure/` outputs; auto-injection is off. **Decided 2026-10-09.**
- Provider avatars are kept with the identity (ADR 0007) but not shown in the MVP; publishers appear by handle and initials, so no page requests a provider's image host.
- Any future addition that collects more (email notifications, for example) is a new decision, not an extension of this one.
