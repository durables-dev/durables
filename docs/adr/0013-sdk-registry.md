# ADR 0013: The SDK registry

**Status:** proposed, 2026-11-13. **Decided by:** pending. Amends [ADR 0008](0008-detection-and-checks.md).

## Decision

- **Web holds nothing SDK-specific.** Package names, highlight languages, activity file names, and the Runs as and Worker requirements wording all come from the api. This applies to every SDK, including Python, TypeScript and .NET. Web imports no SDK list or type. It receives SDK names in api responses and from the SDK catalog.
- **Every SDK's specifics live in one place in the api: the SDK registry** (`api/src/sdks/`). Each SDK has one entry, which holds:
  - its recognition patterns
  - its detector
  - its snippet generator and templates
  - its standard-library check
  - its dependency normaliser
  - its display profile

  The entry type makes every capability required. The registry is keyed by the api's own SDK list (`api/src/sdks/sdk-list.ts`), so an SDK with a missing piece does not compile. Detection and integration matching use what the entry declares, not copies of it.

- **Identification is one generic function** that runs over every entry. It returns:
  - the SDK
  - how the SDK was established
  - the names of the patterns that matched

  When several SDKs match and nothing decides between them, it returns "ambiguous". When none match, it returns "not identified". Its answer never depends on the order SDKs are listed in.

- **The SDK catalog endpoint** (`GET /api/sdks`) publishes each entry's display profile in chip order. It carries the listing read's short cache, `Cache-Control: public, max-age=0, s-maxage=60` ([ADR 0006](0006-caching-and-rate-limits.md)), not the version read's immutable header. A profile can change when wording is corrected, so it must not be cached as immutable.
- **Amendments to ADR 0008:**
  - A fact can also be **inferred**: the SDK is recognised from the language and the function's shape, with no Temporal marker.
  - A publisher may **declare** the SDK. The api then runs that SDK's detector itself. It still never accepts detection results from the client.
  - The api still runs all detection, at check time and at publish time.
- **A later AI identifier** plugs in as another way to identify the SDK, recorded with the reserved _AI-reviewed_ tier. The registry and fact provenance are the seams for it. Nothing in this record adds AI.

## Why

Durables is widening from three SDKs to every SDK Temporal officially supports (Go, Java, Python, TypeScript, .NET, Ruby, PHP and Rust). Before this record, an SDK's specifics were spread across the api and web:

- detectors and their list order in `checks/`
- the activity file name in `snippets/labels.ts`
- a `switch` over SDKs in the snippet generator
- the package name and highlight language in web

Adding one SDK meant edits in each of those places, and nothing caught a missed one. A single typed entry per SDK turns "add an SDK" into one change that the compiler checks.

Identification used to prefer whichever SDK was listed first when several matched. With eight SDKs, some marker shapes overlap (Java's and PHP's `@ActivityInterface`, for example), so list order would quietly decide the answer. Returning "ambiguous" makes the overlap visible and lets the publisher choose.

## Consequences

- Adding an SDK is one registry entry and its name in the api's SDK list.
- Integration matching goes through each SDK's dependency normaliser.
- A paste with activity markers from two SDKs is no longer resolved by list order. Until declaring an SDK is available, the check refuses it as not a Temporal activity. After that, it asks the publisher to choose.
- Web reads SDK display details from the catalog endpoint. The version response keeps carrying the activity file name, so published pages are unchanged.
- An SDK listed in the registry can't also be refused as unaccepted. Each SDK story removes its SDK from the unaccepted list when it adds the entry.
