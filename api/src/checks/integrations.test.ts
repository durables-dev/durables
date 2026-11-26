import { integrationSchema, integrations, patterns } from "@durables/schemas";
import { describe, expect, it } from "vitest";
import { registeredSdks } from "../sdks/registry";
import { sdks } from "../sdks/sdk-list";
import { integrationPackages, integrationsFor } from "./integrations";
import { checkCode } from "./pipeline";

/** Detected dependencies with the given names, each on its own line. */
const imports = (...names: string[]) =>
  names.map((name, index) => ({ name, line: index + 1 }));

describe("the shared integration list", () => {
  it("holds the four service chips, then the four AI provider chips", () => {
    expect(integrations).toEqual([
      "Stripe",
      "Amazon S3",
      "Postgres",
      "Slack",
      "OpenAI",
      "Anthropic Claude",
      "Google Gemini",
      "Amazon Bedrock",
      "Redis",
      "Amazon SQS",
      "Ollama",
      "Cohere",
      "Groq",
      "xAI Grok",
    ]);
  });

  it("is what detection can report, each integration once", () => {
    const detectable = integrationPackages.map(
      ({ integration }) => integration,
    );
    expect(detectable).toHaveLength(integrations.length);
    expect(new Set(detectable)).toEqual(new Set(integrations));
  });

  it("names S3 only as Amazon S3", () => {
    expect(integrations).not.toContain("AWS S3");
  });

  it("detects no workflow pattern", () => {
    const detectable: readonly string[] = integrationPackages.map(
      ({ integration }) => integration,
    );
    for (const pattern of patterns) {
      expect(detectable).not.toContain(pattern);
    }
  });
});

describe.each(sdks)("everything detection reports from %s imports", (sdk) => {
  // Every package that implies an integration in this SDK, and packages named after each pattern.
  const everyPackage = [
    ...integrationPackages.flatMap(({ packages, sdkPackages }) => [
      ...packages,
      ...(sdkPackages?.[sdk] ?? []),
    ]),
    ...patterns,
    ...patterns.map((pattern) => pattern.toLowerCase()),
  ];
  const detected: readonly string[] = integrationsFor(
    sdk,
    imports(...everyPackage),
  );

  it("is a valid Integration", () => {
    expect(detected.length).toBeGreaterThan(0);
    for (const integration of detected) {
      expect(integrationSchema.safeParse(integration).success).toBe(true);
    }
  });

  it("is never a workflow pattern", () => {
    for (const pattern of patterns) {
      expect(detected).not.toContain(pattern);
    }
  });
});

/** The SDKs whose normaliser reads these package names unchanged, apart from case. */
const lowerCasingSdks = sdks.filter((sdk) => sdk !== "Ruby");

// These SDKs give the same integrations for the same names. Ruby reads a required path as a
// gem name, and has its own cases below.
describe.each(lowerCasingSdks)("integrations from %s imports", (sdk) => {
  it("maps stripe to Stripe", () => {
    expect(integrationsFor(sdk, imports("stripe"))).toEqual(["Stripe"]);
  });

  it.each([
    ["stripe", "Stripe"],
    ["boto3", "Amazon S3"],
    ["@aws-sdk/client-s3", "Amazon S3"],
    ["psycopg", "Postgres"],
    ["psycopg2", "Postgres"],
    ["asyncpg", "Postgres"],
    ["pg", "Postgres"],
    ["Npgsql", "Postgres"],
    ["slack_sdk", "Slack"],
    ["@slack/web-api", "Slack"],
    ["SlackNet", "Slack"],
  ])("maps %s to %s", (name, integration) => {
    expect(integrationsFor(sdk, imports(name))).toEqual([integration]);
  });

  it("lists an integration once when two of its packages are imported", () => {
    expect(integrationsFor(sdk, imports("psycopg2", "asyncpg"))).toEqual([
      "Postgres",
    ]);
    expect(
      integrationsFor(sdk, imports("boto3", "@aws-sdk/client-s3")),
    ).toEqual(["Amazon S3"]);
  });

  it("lists two integrations once each, in the same order whatever the import order", () => {
    expect(integrationsFor(sdk, imports("stripe", "boto3"))).toEqual([
      "Amazon S3",
      "Stripe",
    ]);
    expect(integrationsFor(sdk, imports("boto3", "stripe"))).toEqual([
      "Amazon S3",
      "Stripe",
    ]);
  });

  it("lists every integration in the listed order", () => {
    expect(
      integrationsFor(sdk, imports("@slack/web-api", "stripe", "pg", "boto3")),
    ).toEqual(["Amazon S3", "Postgres", "Slack", "Stripe"]);
  });

  it("maps an unknown package to nothing", () => {
    expect(integrationsFor(sdk, imports("lodash"))).toEqual([]);
  });

  it("maps no imports to nothing", () => {
    expect(integrationsFor(sdk, [])).toEqual([]);
  });

  it("keeps only the known packages from a mix", () => {
    expect(
      integrationsFor(
        sdk,
        imports("lodash", "stripe", "pydantic", "slack_sdk"),
      ),
    ).toEqual(["Slack", "Stripe"]);
  });

  it.each(["httpx", "requests", "aiohttp", "urllib3", "axios", "node-fetch"])(
    "maps the plain HTTP client %s to nothing",
    (name) => {
      expect(integrationsFor(sdk, imports(name))).toEqual([]);
    },
  );

  it("matches package names without regard to case", () => {
    expect(integrationsFor(sdk, imports("Stripe"))).toEqual(["Stripe"]);
    expect(integrationsFor(sdk, imports("npgsql"))).toEqual(["Postgres"]);
    expect(integrationsFor(sdk, imports("SLACKNET"))).toEqual(["Slack"]);
  });

  it("lists an integration once when its package is imported under two casings", () => {
    expect(integrationsFor(sdk, imports("stripe", "Stripe"))).toEqual([
      "Stripe",
    ]);
  });

  it("does not take a package that only starts like a known one", () => {
    expect(
      integrationsFor(
        sdk,
        imports("stripe-mock", "pgvector", "@aws-sdk/client-dynamodb"),
      ),
    ).toEqual([]);
  });
});

it("covers every SDK in the api's list between the shared cases and Ruby's", () => {
  expect([...lowerCasingSdks, "Ruby"].sort()).toEqual([...sdks].sort());
});

describe("integrations from Ruby requires", () => {
  it.each([
    ["stripe", "Stripe"],
    ["aws-sdk-s3", "Amazon S3"],
    ["pg", "Postgres"],
    ["slack-ruby-client", "Slack"],
  ])("maps the gem %s to %s", (name, integration) => {
    expect(integrationsFor("Ruby", imports(name))).toEqual([integration]);
  });

  it("maps a required path to the gem it names", () => {
    expect(integrationsFor("Ruby", imports("aws/sdk/s3"))).toEqual([
      "Amazon S3",
    ]);
    expect(integrationsFor("Ruby", imports("slack/ruby/client"))).toEqual([
      "Slack",
    ]);
  });

  it("matches gem names without regard to case", () => {
    expect(integrationsFor("Ruby", imports("Stripe", "PG"))).toEqual([
      "Postgres",
      "Stripe",
    ]);
  });

  it("lists every integration in the listed order, each once", () => {
    expect(
      integrationsFor(
        "Ruby",
        imports("slack-ruby-client", "stripe", "pg", "aws-sdk-s3", "stripe"),
      ),
    ).toEqual(["Amazon S3", "Postgres", "Slack", "Stripe"]);
  });

  it.each([
    "faraday",
    "httparty",
    "aws-sdk-dynamodb",
    "stripe-ruby-mock",
    "pg_search",
    "slack-notifier",
  ])("maps %s to nothing", (name) => {
    expect(integrationsFor("Ruby", imports(name))).toEqual([]);
  });
});

describe("integrations from detected code", () => {
  const integrationsIn = (code: string) => {
    const facts = checkCode(code, registeredSdks);
    return integrationsFor(facts.sdk, facts.dependencies);
  };

  it("reads Python imports as detection reports them", () => {
    const code = [
      "import stripe",
      "import psycopg2.extras",
      "from slack_sdk import WebClient",
      "import httpx",
      "from temporalio import activity",
      "",
      "@activity.defn",
      "async def charge_card(amount: int) -> str:",
      '    return "ok"',
    ].join("\n");
    expect(integrationsIn(code)).toEqual(["Postgres", "Slack", "Stripe"]);
  });

  it("reads TypeScript imports as detection reports them", () => {
    const code = [
      'import Stripe from "stripe";',
      'import { S3Client } from "@aws-sdk/client-s3";',
      'import { Pool } from "pg";',
      'import axios from "axios";',
      'import { heartbeat } from "@temporalio/activity";',
      "",
      "export async function chargeCard(amount: number): Promise<string> {",
      "  heartbeat();",
      '  return "ok";',
      "}",
    ].join("\n");
    expect(integrationsIn(code)).toEqual(["Amazon S3", "Postgres", "Stripe"]);
  });

  it("reads .NET usings as detection reports them", () => {
    const code = [
      "using System;",
      "using Npgsql;",
      "using Stripe;",
      "using Temporalio.Activities;",
      "",
      "public class Payments",
      "{",
      "    [Activity]",
      "    public async Task<string> ChargeCardAsync(int amount)",
      "    {",
      '        return "ok";',
      "    }",
      "}",
    ].join("\n");
    expect(integrationsIn(code)).toEqual(["Postgres", "Stripe"]);
  });
  it("reads Ruby requires as detection reports them, leaving out the standard library", () => {
    const code = [
      'require "json"',
      'require "net/http"',
      'require "stripe"',
      'require "aws-sdk-s3"',
      'require "pg"',
      'require "slack-ruby-client"',
      'require "faraday"',
      'require "temporalio/activity"',
      "",
      "class ChargeCard < Temporalio::Activity::Definition",
      "    def execute(amount)",
      '        "ok"',
      "    end",
      "end",
    ].join("\n");
    expect(integrationsIn(code)).toEqual([
      "Amazon S3",
      "Postgres",
      "Slack",
      "Stripe",
    ]);
  });

  it("reads the Stripe.net package's using as Stripe", () => {
    const code = [
      "using Stripe;",
      "using Temporalio.Activities;",
      "",
      "public class Payments",
      "{",
      "    [Activity]",
      "    public async Task<string> ChargeCardAsync(int amount)",
      "    {",
      '        return "ok";',
      "    }",
      "}",
    ].join("\n");
    expect(integrationsIn(code)).toEqual(["Stripe"]);
  });

  it("reads the SlackNet package's using as Slack", () => {
    const code = [
      "using SlackNet;",
      "using SlackNet.WebApi;",
      "using Temporalio.Activities;",
      "",
      "public class Messages",
      "{",
      "    [Activity]",
      "    public async Task<string> PostMessageAsync(string text)",
      "    {",
      '        return "ok";',
      "    }",
      "}",
    ].join("\n");
    expect(integrationsIn(code)).toEqual(["Slack"]);
  });

  it("reads Amazon S3 from a TypeScript S3 import", () => {
    const code = [
      'import { S3Client } from "@aws-sdk/client-s3";',
      'import { heartbeat } from "@temporalio/activity";',
      "",
      "export async function uploadReport(key: string): Promise<string> {",
      "  heartbeat();",
      "  return key;",
      "}",
    ].join("\n");
    expect(integrationsIn(code)).toEqual(["Amazon S3"]);
  });

  it("reads Amazon S3 from a .NET using of the AWS SDK's S3 namespace", () => {
    const code = [
      "using Amazon.S3;",
      "using Amazon.S3.Model;",
      "using Temporalio.Activities;",
      "",
      "public class Reports",
      "{",
      "    [Activity]",
      "    public async Task<string> UploadReportAsync(string key)",
      "    {",
      "        return key;",
      "    }",
      "}",
    ].join("\n");
    expect(integrationsIn(code)).toEqual(["Amazon S3"]);
  });

  it("reads no integration from a .NET using of another AWS SDK namespace", () => {
    const code = [
      "using Amazon;",
      "using Amazon.Runtime;",
      "using Temporalio.Activities;",
      "",
      "public class Reports",
      "{",
      "    [Activity]",
      "    public async Task<string> UploadReportAsync(string key)",
      "    {",
      "        return key;",
      "    }",
      "}",
    ].join("\n");
    expect(integrationsIn(code)).toEqual([]);
  });

  it("reads no integration from code with no known packages", () => {
    const code = [
      "import httpx",
      "from temporalio import activity",
      "",
      "@activity.defn",
      "async def fetch_page(url: str) -> str:",
      "    return url",
    ].join("\n");
    expect(integrationsIn(code)).toEqual([]);
  });
});
