import { integrations, sdks } from "@durables/schemas";
import { describe, expect, it } from "vitest";
import { registeredSdks } from "../sdks/registry";
import { integrationPackages, integrationsFor } from "./integrations";
import { checkCode } from "./pipeline";

/** Detected dependencies with the given names, each on its own line. */
const imports = (...names: string[]) =>
  names.map((name, index) => ({ name, line: index + 1 }));

describe("the shared integration list", () => {
  it("holds exactly Stripe, Amazon S3, Postgres and Slack", () => {
    expect(integrations).toEqual(["Stripe", "Amazon S3", "Postgres", "Slack"]);
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
});

// Every existing SDK normalises a dependency by lower-casing it, so each gives the same
// integrations for the same names.
describe.each(sdks)("integrations from %s imports", (sdk) => {
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
        imports("stripe-mock", "pgvector", "@aws-sdk/client-sqs"),
      ),
    ).toEqual([]);
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

  it("reads no integration from a .NET Amazon.S3 using", () => {
    const code = [
      "using Amazon.S3;",
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
