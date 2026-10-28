import { describe, expect, it } from "vitest";
import { detectors } from "./detectors";
import { integrationsFor } from "./integrations";
import { checkCode } from "./pipeline";

/** Detected dependencies with the given names, each on its own line. */
const imports = (...names: string[]) =>
  names.map((name, index) => ({ name, line: index + 1 }));

describe("integrations from imports", () => {
  it("maps stripe to Stripe", () => {
    expect(integrationsFor(imports("stripe"))).toEqual(["Stripe"]);
  });

  it.each([
    ["stripe", "Stripe"],
    ["boto3", "AWS S3"],
    ["@aws-sdk/client-s3", "AWS S3"],
    ["AWSSDK.S3", "AWS S3"],
    ["psycopg", "Postgres"],
    ["psycopg2", "Postgres"],
    ["asyncpg", "Postgres"],
    ["pg", "Postgres"],
    ["Npgsql", "Postgres"],
    ["slack_sdk", "Slack"],
    ["@slack/web-api", "Slack"],
  ])("maps %s to %s", (name, integration) => {
    expect(integrationsFor(imports(name))).toEqual([integration]);
  });

  it("lists an integration once when two of its packages are imported", () => {
    expect(integrationsFor(imports("psycopg2", "asyncpg"))).toEqual([
      "Postgres",
    ]);
    expect(integrationsFor(imports("boto3", "@aws-sdk/client-s3"))).toEqual([
      "AWS S3",
    ]);
  });

  it("lists two integrations once each, in the same order whatever the import order", () => {
    expect(integrationsFor(imports("stripe", "boto3"))).toEqual([
      "AWS S3",
      "Stripe",
    ]);
    expect(integrationsFor(imports("boto3", "stripe"))).toEqual([
      "AWS S3",
      "Stripe",
    ]);
  });

  it("lists every integration in the listed order", () => {
    expect(
      integrationsFor(imports("@slack/web-api", "stripe", "pg", "boto3")),
    ).toEqual(["AWS S3", "Postgres", "Slack", "Stripe"]);
  });

  it("maps an unknown package to nothing", () => {
    expect(integrationsFor(imports("lodash"))).toEqual([]);
  });

  it("maps no imports to nothing", () => {
    expect(integrationsFor([])).toEqual([]);
  });

  it("keeps only the known packages from a mix", () => {
    expect(
      integrationsFor(imports("lodash", "stripe", "pydantic", "slack_sdk")),
    ).toEqual(["Slack", "Stripe"]);
  });

  it.each(["httpx", "requests", "aiohttp", "urllib3", "axios", "node-fetch"])(
    "maps the plain HTTP client %s to nothing",
    (name) => {
      expect(integrationsFor(imports(name))).toEqual([]);
    },
  );

  it("matches package names without regard to case", () => {
    expect(integrationsFor(imports("Stripe"))).toEqual(["Stripe"]);
    expect(integrationsFor(imports("npgsql"))).toEqual(["Postgres"]);
    expect(integrationsFor(imports("awssdk.s3"))).toEqual(["AWS S3"]);
  });

  it("lists an integration once when its package is imported under two casings", () => {
    expect(integrationsFor(imports("stripe", "Stripe"))).toEqual(["Stripe"]);
  });

  it("does not take a package that only starts like a known one", () => {
    expect(
      integrationsFor(
        imports("stripe-mock", "pgvector", "@aws-sdk/client-sqs"),
      ),
    ).toEqual([]);
  });
});

describe("integrations from detected code", () => {
  const integrationsIn = (code: string) =>
    integrationsFor(checkCode(code, detectors).dependencies);

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
    expect(integrationsIn(code)).toEqual(["AWS S3", "Postgres", "Stripe"]);
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
});
