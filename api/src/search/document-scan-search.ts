import { highestVersion } from "../domain/versioning/semver.js";
import type { ActivityVersion } from "../model/activity-version.js";
import type { CheckTag } from "../model/check.js";
import type { ActivitySearchFilters } from "../model/search.js";
import type { DocumentStore } from "../storage/document-store.js";
import type { SearchIndex } from "./search-index.js";

// Search with no index: every query lists every activity in the DocumentStore,
// loads its highest version, and tests the filters against `sdk` and `checks`.
// It never opens files itself; all document access goes through the store.

// POC-SHORTCUT: SC-015
export function documentScanSearch(store: DocumentStore): SearchIndex {
  return {
    async searchActivities(filters) {
      const activities = await store.listActivities();
      const docs = await Promise.all(
        activities.map(async ({ owner, name }) => {
          const version = highestVersion(await store.listActivityVersions(owner, name));
          return version ? store.getActivityVersion(owner, name, version) : null;
        }),
      );
      return docs.filter((doc): doc is ActivityVersion => doc !== null && matches(doc, filters));
    },
  };
}

function matches(doc: ActivityVersion, filters: ActivitySearchFilters): boolean {
  if (filters.sdk !== undefined && doc.sdk !== filters.sdk) return false;
  if (filters.idempotent && !isPresent(doc, "idempotency")) return false;
  if (filters.hasCompensation && !isPresent(doc, "compensation")) return false;
  return true;
}

/** Present, whether it was declared, detected or pattern-matched. */
function isPresent(doc: ActivityVersion, tag: CheckTag): boolean {
  return doc.checks.some((check) => check.tag === tag && check.status === "present");
}
