# ADR 0006: Edge caching and rate limits

**Status:** accepted, 2026-10-08. **Decided by:** David Dieruf.

## Decision

- Everything about a published version is **cached at Cloudflare's edge indefinitely**: its page, its document, its snippets. Versions never change, so the cache never has to be invalidated for them. Only the listing's mutable fields (the one-line description, and later removal and deprecation state) are served from the index and cached briefly.
- **Rate limits** apply per connection to the endpoints that do real work: publishing, the detection preview in the contribute flow (ADR 0008), and later fetching a linked file and reporting. Browsing and search are not rate-limited beyond Cloudflare's own protections.

## Why

Both keep cost bounded. Caching means most traffic to activity pages never reaches a Worker or a database. Rate limits stop one abuser or one bug from running up usage-based charges on the paid plan (ADR 0002).

## Consequences

- Pages for a version must be designed so the immutable part (code, detected facts, snippets) is separable from the small mutable part (description, status), or the mutable part is fetched separately by the page.
- Caching is implemented in `api`, not in Cloudflare rules: a Worker is the origin, so its responses reach the edge cache only through the Cache API. Version endpoints return only immutable fields, are stored through the Cache API and carry `Cache-Control: public, max-age=31536000, immutable`. Listing endpoints carry the mutable fields and `Cache-Control: public, max-age=0, s-maxage=60`, so the edge caches briefly and the browser always revalidates. An update returns the new value in its response and `web` keeps it, so the publisher sees the change right away; other visitors see it within the edge cache's lifetime. Search and browse responses are not cached at the edge or in the browser (`Cache-Control: no-store`): they are read from the D1 index on every request, so a changed description appears in search results right away (DUR-9). **Changed 2026-10-10.**
- Rate limits are Worker `ratelimit` bindings: declared with their limit and period in `api/wrangler.toml`, which `infrastructure/` reads when it defines the Worker, and applied by one call in the API's publish and detection-preview handlers. Cloudflare's zone-level rate-limiting rules were the original intent, but on a Free zone they allow one IP-only rule with a 10-second window, too coarse to be the limit and not worth a Pro plan for a site this size. A zone rule remains the escalation path if abuse appears. **Changed 2026-10-09.**
- Billing alerts (ADR 0002) are the backstop if either mechanism is misconfigured.

## Notes

- **2026-11-16, mutable fields per version.** [ADR 0015](0015-removal-deprecation-and-account-deletion.md) adds removal and deprecation state and moves the description to each version. All of them are still served with the listing under its short cache rules, never in the year-cached version response.
