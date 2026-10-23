import type { NamedLineRef } from "./facts";

// "Integrates with" is what detection can tell from the code's imports (PM decision,
// 2026-10-08). A package on this list implies its integration. Any other package, including a
// plain HTTP client, implies none. Publishers don't enter integrations.

/** An integration a listing can show, named as the listing shows it. */
export type Integration = "AWS S3" | "Postgres" | "Slack" | "Stripe";

interface IntegrationPackages {
  readonly integration: Integration;
  /** The package names detection reports for this integration's client libraries. */
  readonly packages: readonly string[];
}

/**
 * Each integration and the packages that imply it, in the order integrations are listed.
 * Package names are matched without regard to case.
 */
export const integrationPackages: readonly IntegrationPackages[] = [
  {
    integration: "AWS S3",
    packages: ["boto3", "@aws-sdk/client-s3", "AWSSDK.S3"],
  },
  {
    integration: "Postgres",
    packages: ["psycopg", "psycopg2", "asyncpg", "pg", "Npgsql"],
  },
  { integration: "Slack", packages: ["slack_sdk", "@slack/web-api"] },
  { integration: "Stripe", packages: ["stripe"] },
];

/**
 * The integrations the detected third-party imports imply, each once. The order is the order
 * of `integrationPackages`, whatever order the imports came in. Empty when no import implies
 * an integration.
 */
export const integrationsFor = (
  dependencies: readonly Pick<NamedLineRef, "name">[],
): Integration[] => {
  const imported = new Set(dependencies.map(({ name }) => name.toLowerCase()));
  return integrationPackages
    .filter(({ packages }) =>
      packages.some((name) => imported.has(name.toLowerCase())),
    )
    .map(({ integration }) => integration);
};
