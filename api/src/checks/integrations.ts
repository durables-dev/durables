import type { Integration } from "@durables/schemas";
import type { NamedLineRef } from "./facts";

// "Integrates with" is what detection can tell from the code's imports (PM decision,
// 2026-10-08). A package on this list implies its integration. Any other package, including a
// plain HTTP client, implies none. Publishers don't enter integrations.

interface IntegrationPackages {
  readonly integration: Integration;
  /**
   * The dependency names detection reports for this integration's client libraries: package
   * names for Python and TypeScript, the namespace root of a `using` for .NET.
   */
  readonly packages: readonly string[];
}

/**
 * Each integration in the shared list and the packages that imply it, in the order a
 * listing's integrations are stored. Package names are matched without regard to case.
 */
export const integrationPackages: readonly IntegrationPackages[] = [
  {
    integration: "Amazon S3",
    packages: ["boto3", "@aws-sdk/client-s3"],
  },
  {
    integration: "Postgres",
    packages: ["psycopg", "psycopg2", "asyncpg", "pg", "Npgsql"],
  },
  {
    integration: "Slack",
    packages: ["slack_sdk", "@slack/web-api", "SlackNet"],
  },
  // "stripe" is also the Stripe.net package's .NET namespace root.
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
