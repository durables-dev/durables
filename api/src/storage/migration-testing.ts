import { env } from "cloudflare:workers";
import { inject } from "vitest";
import { seedAccount } from "./seed";
import { Storage, type NewListing } from "./storage";

// Test-only helpers for the migration integration tests, which write rows the old way and run a
// migration's own statements again. Never import this from a route.

/** The migration whose name starts with the given prefix, as the setup file applied it. */
export const migration = (prefix: string) => {
  const found = inject("d1Migrations").find(({ name }) =>
    name.startsWith(prefix),
  );
  if (found === undefined) {
    throw new Error(`Migration ${prefix} is missing.`);
  }
  return found;
};

/**
 * Runs a migration's statements in one batch, as Wrangler runs a migration file, and returns
 * how many rows each statement changed.
 */
export const runMigration = async (prefix: string): Promise<number[]> => {
  const results = await env.DB.batch(
    migration(prefix).queries.map((query) => env.DB.prepare(query)),
  );
  return results.map(({ meta }) => meta.changes);
};

/** A listing and its first version, published the way publishing stores them, under a name no other test uses. */
export const storedListing = async ({
  sdk = "Python",
  integrations = [],
}: {
  sdk?: NewListing["sdk"];
  integrations?: string[];
} = {}): Promise<NewListing> => {
  const listing: NewListing = {
    handle: (await seedAccount(env.DB)).handle,
    name: `activity-${crypto.randomUUID().slice(0, 8)}`,
    version: "1.0.0",
    title: "Upload report",
    description: "Uploads a CSV report and returns where it is.",
    sdk,
    integrations,
  };
  await new Storage(env.DB, env.DOCUMENTS).createListing(listing);
  return listing;
};
