import { findAccount } from "../db/accounts-repository.js";
import { formatActivityAddress } from "../domain/addresses/address.js";
import type { AccountRecord } from "../model/account.js";
import type { ActivitySearchFilters, ActivitySearchResponse, ActivitySummary } from "../model/search.js";
import { documentScanSearch } from "../search/document-scan-search.js";
import type { SearchIndex } from "../search/search-index.js";
import { documents } from "./documents.js";

let index: SearchIndex | null = null;

/** The one SearchIndex, built on the shared DocumentStore on first use. */
function searchIndex(): SearchIndex {
  if (!index) index = documentScanSearch(documents());
  return index;
}

/**
 * Step 8: a public read, with no signed-in user needed. Returns each matching
 * activity's default version, sorted by name, then owner, with its publisher
 * looked up in `accounts` for the Verified Publisher badge.
 */
export async function searchActivities(filters: ActivitySearchFilters): Promise<ActivitySearchResponse> {
  const docs = await searchIndex().searchActivities(filters);
  docs.sort((a, b) => compare(a.name, b.name) || compare(a.owner, b.owner));

  const accounts = new Map<string, Promise<AccountRecord | null>>();
  const accountFor = (handle: string) => {
    if (!accounts.has(handle)) accounts.set(handle, findAccount(handle));
    return accounts.get(handle)!;
  };

  const results = await Promise.all(
    docs.map(async (doc): Promise<ActivitySummary> => {
      const account = await accountFor(doc.owner);
      return {
        address: formatActivityAddress(doc.owner, doc.name, doc.version),
        owner: doc.owner,
        name: doc.name,
        version: doc.version,
        publishedAt: doc.publishedAt,
        sdk: doc.sdk,
        activityName: doc.detection.activityName.value,
        publisher: account
          ? { handle: account.handle, displayName: account.displayName, verified: account.verified }
          : { handle: doc.owner, displayName: doc.owner, verified: false },
        checks: doc.checks.map(({ tag, status, established }) => ({ tag, status, established })),
      };
    }),
  );

  return { filters, results };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
