import type { Integration } from "@durables/schemas";
import { sdkRegistry } from "../sdks/registry";
import type { Sdk } from "../sdks/sdk-list";
import type { NamedLineRef } from "./facts";

// "Integrates with" is what detection can tell from the code's imports (PM decision,
// 2026-10-08). A package on this list implies its integration. Any other package, including a
// plain HTTP client, implies none. Publishers don't enter integrations.

interface IntegrationPackages {
  readonly integration: Integration;
  /**
   * The integration keys of this integration's client libraries: package names for Python and
   * TypeScript, the namespace root of a `using` for .NET, and gem names for Ruby. A dependency implies the integration
   * when its SDK's normaliser gives one of these keys. Keys are compared without regard to case.
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
    packages: ["boto3", "@aws-sdk/client-s3", "aws-sdk-s3"],
  },
  {
    integration: "Postgres",
    packages: ["psycopg", "psycopg2", "asyncpg", "pg", "Npgsql"],
  },
  {
    integration: "Slack",
    packages: ["slack_sdk", "@slack/web-api", "SlackNet", "slack-ruby-client"],
  },
  // "stripe" is also the Stripe.net package's .NET namespace root and the Ruby gem.
  { integration: "Stripe", packages: ["stripe"] },
];

/**
 * The integrations an SDK's detected third-party imports imply, each once. Each dependency
 * goes through the SDK's normaliser first. The order is the order of `integrationPackages`,
 * whatever order the imports came in. Empty when no import implies an integration.
 */
export const integrationsFor = (
  sdk: Sdk,
  dependencies: readonly Pick<NamedLineRef, "name">[],
): Integration[] => {
  const { normaliseDependency } = sdkRegistry[sdk];
  const imported = new Set(
    dependencies.map(({ name }) => normaliseDependency(name)),
  );
  return integrationPackages
    .filter(({ packages }) =>
      packages.some((name) => imported.has(name.toLowerCase())),
    )
    .map(({ integration }) => integration);
};
