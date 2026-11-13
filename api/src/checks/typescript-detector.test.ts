import { registeredSdks, sdkRegistry } from "../sdks/registry";
import { describe, expect, it } from "vitest";
import type { ActivityFacts } from "./facts";
import { nodeBuiltinModules } from "./node-builtins";
import { checkCode } from "./pipeline";
import { CheckRefusal, refusalTypes } from "./refusals";
import { allMatches } from "./scan";
import { MAX_CODE_BYTES } from "./size-limit";
import { toSource } from "./source";
import { typescriptDetector, typescriptPatterns } from "./typescript-detector";
import { unacceptedSdks } from "./unaccepted-sdks";

const detect = (code: string) => typescriptDetector.detect(toSource(code));

const lines = (...code: string[]) => code.join("\n");

/** The Problem Details body of the refusal the pipeline throws for the code. */
const refusalOf = (code: string) => {
  try {
    checkCode(code, registeredSdks);
  } catch (error) {
    expect(error).toBeInstanceOf(CheckRefusal);
    return (error as CheckRefusal).problem;
  }
  throw new Error("Expected a refusal");
};

/** The only activity detected in the code. Fails the test if there isn't exactly one. */
const onlyActivity = (code: string): ActivityFacts => {
  const found = detect(code);
  expect(found).toHaveLength(1);
  const [only] = found;
  if (only === undefined) {
    throw new Error("Expected one activity");
  }
  return only;
};

/** A minimal activity with the given body lines, which start on line 4. */
const activityWith = (...body: string[]) =>
  lines(
    'import { heartbeat } from "@temporalio/activity";',
    "",
    "export async function act(input: In): Promise<Out> {",
    ...body,
    "  return new Out();",
    "}",
  );

/** A minimal activity after the given import lines. */
const activityAfter = (...imports: string[]) =>
  lines(
    ...imports,
    "",
    "export async function act(input: In): Promise<Out> {",
    "  return new Out();",
    "}",
  );

// The screen 12 sample, written as a TypeScript activity.
const postSlackMessage = lines(
  'import { heartbeat } from "@temporalio/activity";',
  'import { ApplicationFailure } from "@temporalio/common";',
  'import { WebClient } from "@slack/web-api";',
  'import { readFile } from "node:fs/promises";',
  'import path from "path";',
  'import type { MessageRef } from "./types";',
  "",
  "export interface SlackMessage {",
  "  channel: string;",
  "  text: string;",
  "}",
  "",
  "export async function postSlackMessage(input: SlackMessage): Promise<MessageRef> {",
  "  const client = new WebClient(process.env.SLACK_TOKEN);",
  "  heartbeat();",
  "  if (!input.channel) {",
  '    throw ApplicationFailure.nonRetryable("No channel", "MissingChannel");',
  "  }",
  "  const res = await client.chat.postMessage({ channel: input.channel, text: input.text });",
  '  return { ts: res.ts ?? "" };',
  "}",
  "",
);

describe("typescriptDetector", () => {
  describe("the patterns", () => {
    it("are named, unique, documented and stateless", () => {
      const names = typescriptPatterns.map((pattern) => pattern.name);
      expect(new Set(names).size).toBe(names.length);
      for (const pattern of typescriptPatterns) {
        expect(pattern.name).toMatch(/^typescript(?:-[a-z]+)+$/);
        expect(pattern.description.length).toBeGreaterThan(0);
        expect(pattern.regex.global || pattern.regex.sticky).toBe(false);
      }
    });

    it("have names no other SDK's patterns use", () => {
      const others = [...registeredSdks, ...unacceptedSdks]
        .filter(({ sdk }) => sdk !== "TypeScript")
        .flatMap(({ recognition }) => [
          ...recognition.sdkMarkers,
          ...recognition.activityMarkers,
        ]);
      const names = [...new Set([...typescriptPatterns, ...others])].map(
        (pattern) => pattern.name,
      );
      expect(new Set(names).size).toBe(names.length);
    });

    it("are registered with the pipeline", () => {
      expect(sdkRegistry.TypeScript.detector).toBe(typescriptDetector);
    });

    it("keep the built-in module list free of packages", () => {
      expect(nodeBuiltinModules.has("fs")).toBe(true);
      expect(nodeBuiltinModules.has("test")).toBe(false);
      expect(nodeBuiltinModules.has("@temporalio/activity")).toBe(false);
    });
  });

  describe("an exported async function with typed input and output", () => {
    it("populates all eight facts for the screen 12 sample", () => {
      expect(checkCode(postSlackMessage, registeredSdks)).toEqual({
        sdk: "TypeScript",
        activity: { name: "postSlackMessage", line: 13 },
        input: "SlackMessage",
        output: "MessageRef",
        runsAs: "async",
        nonRetryableErrors: [{ line: 17 }],
        configurationRead: [{ name: "SLACK_TOKEN", line: 14 }],
        dependencies: [{ name: "@slack/web-api", line: 3 }],
        heartbeats: [{ line: 15 }],
      });
    });

    it("reads a signature split across lines, with type parameters, a default and comments", () => {
      const code = lines(
        'import { Context } from "@temporalio/activity";',
        "",
        "export default async function chargeCard<T extends Base>(",
        "  // the charge to make",
        "  { amount, currency }: ChargeRequest<T> = defaults,",
        "): Promise<Map<string, Array<ChargeResult>>> {",
        "  return new Map();",
        "}",
      );
      expect(onlyActivity(code)).toMatchObject({
        activity: { name: "chargeCard", line: 3 },
        input: "ChargeRequest<T>",
        output: "Map<string, Array<ChargeResult>>",
        runsAs: "async",
      });
    });

    it("is accepted without a Temporal import, from the exported async function alone", () => {
      const code = lines(
        "export async function greet(name: string): Promise<string> {",
        "  return `Hello, ${name}!`;",
        "}",
      );
      expect(checkCode(code, registeredSdks)).toMatchObject({
        sdk: "TypeScript",
        activity: { name: "greet", line: 1 },
        input: "string",
        output: "string",
      });
    });
  });

  describe("an exported constant holding an async function", () => {
    it.each([
      [
        "an arrow function",
        "export const greet = async (input: GreetInput): Promise<Greeting> => {",
      ],
      [
        "a function expression",
        "export const greet = async function (input: GreetInput): Promise<Greeting> {",
      ],
      [
        "a typed constant",
        "export const greet: Activity = async (input: GreetInput): Promise<Greeting> => {",
      ],
    ])("detects %s as an activity", (_, signature) => {
      const code = lines(
        'import type { Context } from "@temporalio/activity";',
        "",
        signature,
        "  return { text: input.name };",
        "};",
      );
      expect(onlyActivity(code)).toMatchObject({
        activity: { name: "greet", line: 3 },
        input: "GreetInput",
        output: "Greeting",
        runsAs: "async",
      });
    });
  });

  describe("an exported activity object", () => {
    it("detects its async methods and async function properties, and nothing else", () => {
      const code = lines(
        'import { heartbeat } from "@temporalio/activity";',
        "",
        "export const activities = {",
        "  async greet(input: GreetInput): Promise<Greeting> {",
        "    const inner = {",
        "      async nested(input: A): Promise<B> {",
        "        return new B();",
        "      },",
        "    };",
        "    return { text: input.name };",
        "  },",
        "  charge: async (input: ChargeRequest): Promise<ChargeResult> => {",
        "    return new ChargeResult();",
        "  },",
        "  format(input: Greeting): string {",
        "    return input.text;",
        "  },",
        "  untyped: async (input) => input,",
        "};",
      );
      expect(detect(code).map(({ activity }) => activity)).toEqual([
        { name: "greet", line: 4 },
        { name: "charge", line: 12 },
      ]);
    });

    it("detects a member of a default-exported object", () => {
      const code = lines(
        'import { heartbeat } from "@temporalio/activity";',
        "export default {",
        "  async greet(input: GreetInput): Promise<Greeting> {",
        "    return { text: input.name };",
        "  },",
        "};",
      );
      expect(onlyActivity(code).activity).toEqual({ name: "greet", line: 3 });
    });

    it("ignores async methods of an object that isn't exported", () => {
      const code = lines(
        'import { heartbeat } from "@temporalio/activity";',
        "const activities = {",
        "  async greet(input: GreetInput): Promise<Greeting> {",
        "    return { text: input.name };",
        "  },",
        "};",
      );
      expect(detect(code)).toEqual([]);
    });
  });

  describe("no activity", () => {
    it.each([
      [
        "an untyped parameter",
        "export async function act(input): Promise<Out> {",
      ],
      ["no return type", "export async function act(input: In) {"],
      [
        "a return type that isn't a Promise",
        "export async function act(input: In): Out {",
      ],
      ["no parameters", "export async function act(): Promise<Out> {"],
      [
        "only a this parameter",
        "export async function act(this: Context): Promise<Out> {",
      ],
      [
        "a function that isn't exported",
        "async function act(input: In): Promise<Out> {",
      ],
      [
        "an exported function that isn't async",
        "export function act(input: In): Promise<Out> {",
      ],
    ])("refuses Temporal imports with %s as no activity", (_, signature) => {
      const code = lines(
        'import { Context } from "@temporalio/activity";',
        'import { ApplicationFailure } from "@temporalio/common";',
        "",
        signature,
        "  return new Out();",
        "}",
      );
      expect(detect(code)).toEqual([]);
      expect(refusalOf(code).type).toBe(refusalTypes.noActivity);
    });
  });

  describe("counting activities", () => {
    it("counts two exported activities", () => {
      const code = lines(
        postSlackMessage,
        "export const refundCharge = async (input: RefundRequest): Promise<RefundResult> => {",
        "  return new RefundResult();",
        "};",
      );
      expect(detect(code).map(({ activity }) => activity)).toEqual([
        { name: "postSlackMessage", line: 13 },
        { name: "refundCharge", line: 23 },
      ]);
      expect(refusalOf(code)).toMatchObject({
        type: refusalTypes.multipleActivities,
        count: 2,
      });
    });

    it("counts one activity among exported helpers without a typed Promise return", () => {
      const code = lines(
        'import { heartbeat } from "@temporalio/activity";',
        "",
        "export function formatChannel(channel: string): string {",
        "  return `#${channel}`;",
        "}",
        "",
        "export async function warmUp(client: Client) {",
        "  await client.ping();",
        "}",
        "",
        "export const delay = async (ms: number) => {",
        "  await new Promise((resolve) => setTimeout(resolve, ms));",
        "};",
        "",
        "export async function postMessage(input: SlackMessage): Promise<MessageRef> {",
        "  return { ts: formatChannel(input.channel) };",
        "}",
      );
      expect(onlyActivity(code).activity).toEqual({
        name: "postMessage",
        line: 15,
      });
      expect(checkCode(code, registeredSdks).activity.name).toBe("postMessage");
    });

    it("ignores commented-out activities and exports inside strings", () => {
      const code = lines(
        'import { heartbeat } from "@temporalio/activity";',
        "",
        "// export async function old(input: In): Promise<Out> {",
        "//   return new Out();",
        "// }",
        "/*",
        "export const older = async (input: In): Promise<Out> => new Out();",
        "*/",
        'const example = "export async function quoted(input: In): Promise<Out> {}";',
        "const template = `",
        "export async function templated(input: In): Promise<Out> {}",
        "`;",
        "",
        "export async function act(input: In): Promise<Out> {",
        "  return new Out();",
        "}",
      );
      expect(onlyActivity(code).activity).toEqual({ name: "act", line: 14 });
    });
  });

  describe("runs as", () => {
    it("reports every form of activity as async", () => {
      const code = lines(
        'import { heartbeat } from "@temporalio/activity";',
        "export async function a(input: In): Promise<Out> { return new Out(); }",
        "export const b = async (input: In): Promise<Out> => new Out();",
        "export const c = async function (input: In): Promise<Out> { return new Out(); };",
        "export const d = {",
        "  async e(input: In): Promise<Out> { return new Out(); },",
        "  f: async (input: In): Promise<Out> => new Out(),",
        "};",
      );
      const found = detect(code);
      expect(found.map(({ activity }) => activity.name)).toEqual([
        "a",
        "b",
        "c",
        "e",
        "f",
      ]);
      for (const facts of found) {
        expect(facts.runsAs).toBe("async");
      }
    });
  });

  describe("configuration read", () => {
    it("finds each form of environment read with its line", () => {
      const code = activityWith(
        "  const token = process.env.SLACK_TOKEN;",
        '  const url = process.env["SLACK_URL"];',
        "  const region = process.env['AWS_REGION'];",
        "  const retries = process.env?.RETRIES;",
        "  const header = `Bearer ${process.env.API_KEY}`;",
      );
      expect(onlyActivity(code).configurationRead).toEqual([
        { name: "SLACK_TOKEN", line: 4 },
        { name: "SLACK_URL", line: 5 },
        { name: "AWS_REGION", line: 6 },
        { name: "RETRIES", line: 7 },
        { name: "API_KEY", line: 8 },
      ]);
    });

    it("lists a variable read twice once, at its first line, and ignores commented, quoted and lookalike reads", () => {
      const code = activityWith(
        "  const a = process.env.TOKEN;",
        "  // const b = process.env.OLD_TOKEN;",
        '  const c = "process.env.QUOTED";',
        "  const d = myprocess.env.LOOKALIKE;",
        '  const e = process.env["TOKEN"];',
      );
      expect(onlyActivity(code).configurationRead).toEqual([
        { name: "TOKEN", line: 4 },
      ]);
    });

    it("reports none when nothing is read", () => {
      expect(onlyActivity(activityWith()).configurationRead).toEqual([]);
    });
  });

  describe("dependencies", () => {
    it("reports none for built-ins, with and without node:, and Temporal packages", () => {
      const code = activityAfter(
        'import { readFile } from "node:fs/promises";',
        'import fs from "fs";',
        'import { join } from "path";',
        'import { createHash } from "crypto";',
        'import test from "node:test";',
        'import { heartbeat } from "@temporalio/activity";',
        'import { ApplicationFailure } from "@temporalio/common";',
        'import type { Client } from "@temporalio/client";',
      );
      expect(onlyActivity(code).dependencies).toEqual([]);
    });

    it("lists a scoped package by its scope and name, and resolves subpaths to the package", () => {
      const code = activityAfter(
        'import { WebClient } from "@slack/web-api";',
        'import { S3Client } from "@aws-sdk/client-s3/dist-types/S3Client";',
        'import merge from "lodash/merge";',
        'import { ErrorCode } from "@slack/web-api/dist/errors";',
        'import debounce from "lodash/debounce";',
      );
      expect(onlyActivity(code).dependencies).toEqual([
        { name: "@slack/web-api", line: 1 },
        { name: "@aws-sdk/client-s3", line: 2 },
        { name: "lodash", line: 3 },
      ]);
    });

    it("counts import type, re-exports and side-effect imports, and ignores relative and aliased paths", () => {
      const code = activityAfter(
        'import type { Stripe } from "stripe";',
        'import "dotenv/config";',
        'export { z } from "zod";',
        "import {",
        "  Client,",
        "  type Options,",
        '} from "pg";',
        'import { helper } from "./helper";',
        'import type { Model } from "../models";',
        'import { db } from "@/lib/db";',
        'export * from "./types";',
      );
      expect(onlyActivity(code).dependencies).toEqual([
        { name: "stripe", line: 1 },
        { name: "dotenv", line: 2 },
        { name: "zod", line: 3 },
        { name: "pg", line: 4 },
      ]);
    });

    it("doesn't count require, dynamic import, or imports in comments and strings", () => {
      const code = activityWith(
        '  const axios = require("axios");',
        '  const { got } = await import("got");',
        '  // import { Redis } from "ioredis";',
        "  const doc = 'import x from \"left-pad\"';",
      );
      expect(onlyActivity(code).dependencies).toEqual([]);
    });

    it("counts an import after a semicolon on the same line, and ignores imports in a block comment", () => {
      const code = activityAfter(
        '"use strict"; import { z } from "zod";',
        "/*",
        'import { Redis } from "ioredis";',
        '  import "left-pad";',
        "*/",
      );
      expect(onlyActivity(code).dependencies).toEqual([
        { name: "zod", line: 1 },
      ]);
    });
  });

  describe("heartbeats", () => {
    it("finds each heartbeat call with its line", () => {
      const code = activityWith(
        "  heartbeat();",
        "  Context.current().heartbeat({ progress: 50 });",
      );
      expect(onlyActivity(code).heartbeats).toEqual([{ line: 4 }, { line: 5 }]);
    });

    it("reports none when there is no heartbeat call", () => {
      const code = lines(
        activityWith("  // heartbeat();", '  log("heartbeat()");'),
        "function heartbeat(): void {}",
      );
      expect(onlyActivity(code).heartbeats).toEqual([]);
    });
  });

  describe("non-retryable errors", () => {
    it("reports the line of the factory call, as the pasted text numbers it", () => {
      const facts = onlyActivity(postSlackMessage);
      expect(facts.nonRetryableErrors).toEqual([{ line: 17 }]);
      expect(postSlackMessage.split("\n")[16]).toContain(
        "ApplicationFailure.nonRetryable",
      );
    });

    it("finds nonRetryable: true in the options of ApplicationFailure.create", () => {
      const code = activityWith(
        "  throw ApplicationFailure.create({",
        '    message: "Card declined",',
        '    details: [{ nonRetryable: false, reason: "x" }],',
        "    nonRetryable: true,",
        "  });",
      );
      expect(onlyActivity(code).nonRetryableErrors).toEqual([{ line: 7 }]);
    });

    it("finds a constructed failure whose third argument is true", () => {
      const code = activityWith(
        "  throw new ApplicationFailure(",
        '    `Card declined: ${reason("a, b")}`,',
        '    "CardDeclined",',
        "    true,",
        "  );",
      );
      expect(onlyActivity(code).nonRetryableErrors).toEqual([{ line: 7 }]);
    });

    it("reports none for retryable failures, nested options, commented failures and no failure", () => {
      const retryable = activityWith(
        '  throw ApplicationFailure.retryable("Try again");',
        '  throw ApplicationFailure.create({ message: "x", nonRetryable: false });',
        "  throw ApplicationFailure.create({ details: [{ nonRetryable: true }] });",
        '  throw new ApplicationFailure("x", "Type", false);',
        '  // throw ApplicationFailure.nonRetryable("old");',
        '  const doc = "ApplicationFailure.nonRetryable(";',
      );
      expect(onlyActivity(retryable).nonRetryableErrors).toEqual([]);
    });
  });

  describe("no heartbeat or non-retryable failure", () => {
    it("reports both facts as none", () => {
      expect(onlyActivity(activityWith())).toMatchObject({
        nonRetryableErrors: [],
        heartbeats: [],
      });
    });
  });

  describe("line endings", () => {
    it("gives the same facts for CRLF input as for LF input", () => {
      const lf = detect(postSlackMessage);
      const crlf = detect(postSlackMessage.replaceAll("\n", "\r\n"));
      expect(crlf).toEqual(lf);
      expect(lf[0]).toMatchObject({
        activity: { line: 13 },
        nonRetryableErrors: [{ line: 17 }],
        configurationRead: [{ name: "SLACK_TOKEN", line: 14 }],
        dependencies: [{ name: "@slack/web-api", line: 3 }],
        heartbeats: [{ line: 15 }],
      });
    });
  });

  describe("types that can't be read", () => {
    it.each([
      [
        "several parameters",
        "export async function act(userId: string, amount: number): Promise<Receipt> {",
        null,
        "Receipt",
      ],
      [
        "an inline object input type",
        "export async function act(input: { id: string }): Promise<Out> {",
        null,
        "Out",
      ],
      [
        "an inline object output type",
        "export async function act(input: Req): Promise<{ ok: boolean }> {",
        "Req",
        null,
      ],
      [
        "a function input type",
        "export async function act(input: (x: number) => void): Promise<Out> {",
        null,
        "Out",
      ],
    ])(
      "reports the input or output as unknown for %s",
      (_, signature, input, output) => {
        const code = lines(
          'import { heartbeat } from "@temporalio/activity";',
          signature,
          "  return undefined as never;",
          "}",
        );
        expect(onlyActivity(code)).toMatchObject({ input, output });
      },
    );

    it("reads unions, arrays, qualified names and void", () => {
      const code = lines(
        'import { heartbeat } from "@temporalio/activity";',
        "export async function act(input: models.Request | undefined): Promise<void> {}",
        "export async function bulk(items: Item[]): Promise<Result[]> { return []; }",
      );
      expect(detect(code).map(({ input, output }) => [input, output])).toEqual([
        ["models.Request | undefined", "void"],
        ["Item[]", "Result[]"],
      ]);
    });
  });

  describe("files at the size limit", () => {
    // Each input is a run that once made a pattern backtrack over the whole file.
    const atLimit = (prefix: string, unit: string) =>
      prefix +
      unit.repeat(Math.floor((MAX_CODE_BYTES - prefix.length) / unit.length));
    const adversarial: [string, string][] = [
      ["spaces after an export", atLimit("export const a", " ")],
      ["spaces after an import", atLimit("import ", " ")],
      ["new lines after an import", atLimit("import a", "\n")],
      ["spaces in a parameter", atLimit("export async function a(x", " ")],
      ["open brackets", atLimit("export async function a(", "(")],
      ["open angle brackets", atLimit("x: T): Promise<", "<")],
      ["unclosed template fields", atLimit("`", "${(")],
      ["unclosed object members", atLimit("export const o = {", "a: {")],
    ];

    it.each(adversarial)(
      "matches every pattern against %s in under a second",
      (_, code) => {
        for (const pattern of typescriptPatterns) {
          const started = performance.now();
          allMatches(pattern, code);
          expect(performance.now() - started).toBeLessThan(1000);
        }
      },
    );

    it.each(adversarial)("detects %s in under a second", (_, code) => {
      const started = performance.now();
      detect(code);
      expect(performance.now() - started).toBeLessThan(1000);
    });
  });
});
