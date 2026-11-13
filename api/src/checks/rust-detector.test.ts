import { describe, expect, it } from "vitest";
import { registeredSdks, sdkRegistry } from "../sdks/registry";
import type { ActivityFacts } from "./facts";
import { identifySdk } from "./identify";
import { integrationsFor } from "./integrations";
import type { Pattern } from "./pattern";
import { checkCode } from "./pipeline";
import { CheckRefusal, refusalTypes } from "./refusals";
import {
  isRustStandardLibrary,
  normaliseRustCrate,
  rustActivitiesAttribute,
  rustActivityAttribute,
  rustActivityContextType,
  rustActivityFunction,
  rustBeforeFunction,
  rustCommentOrString,
  rustDetector,
  rustEnvironmentRead,
  rustExternCrate,
  rustHeartbeatCall,
  rustNonRetryableFailure,
  rustNonRetryableSetting,
  rustNonRetryableVariant,
  rustParameter,
  rustPatterns,
  rustResultType,
  rustReturnType,
  rustSdkUse,
  rustSelfParameter,
  rustTypeName,
  rustUseDeclaration,
} from "./rust-detector";
import { toSource } from "./source";
import { unacceptedSdks } from "./unaccepted-sdks";

const detect = (code: string) =>
  rustDetector.detect(toSource(code), sdkRegistry.Rust.isStandardLibrary);

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

/** A minimal activity with the given body lines, which start on line 10. */
const activityWith = (...body: string[]) =>
  lines(
    "use temporalio_macros::activities;",
    "use temporalio_sdk::activities::{ActivityContext, ActivityError};",
    "",
    "pub struct Acts;",
    "",
    "#[activities]",
    "impl Acts {",
    "    #[activity]",
    "    pub async fn act(ctx: ActivityContext, input: In) -> Result<Out, ActivityError> {",
    ...body,
    "        Ok(Out {})",
    "    }",
    "}",
  );

/** An `#[activities]` impl holding the given members. Members start on line 8. */
const implWith = (...members: string[]) =>
  lines(
    "use temporalio_macros::activities;",
    "use temporalio_sdk::activities::{ActivityContext, ActivityError};",
    "",
    "pub struct Acts;",
    "",
    "#[activities]",
    "impl Acts {",
    ...members,
    "}",
  );

// A Rust counterpart to the canvas's charge_card sample: async, with every fact present.
const chargeCard = lines(
  "use std::env;",
  "use std::sync::Arc;",
  "",
  "use async_stripe::Client;",
  "use serde::{Deserialize, Serialize};",
  "use temporalio_macros::activities;",
  "use temporalio_sdk::activities::{ActivityContext, ActivityError, ApplicationFailure};",
  "",
  "#[derive(Clone, Serialize, Deserialize)]",
  "pub struct ChargeRequest {",
  "    pub amount_cents: i64,",
  "}",
  "",
  "#[derive(Debug, Serialize, Deserialize)]",
  "pub struct ChargeResult {",
  "    pub charge_id: String,",
  "}",
  "",
  "pub struct PaymentActivities;",
  "",
  "#[activities]",
  "impl PaymentActivities {",
  "    /// Charges the card.",
  "    #[activity]",
  "    pub async fn charge_card(",
  "        self: Arc<Self>,",
  "        ctx: ActivityContext,",
  "        input: ChargeRequest,",
  "    ) -> Result<ChargeResult, ActivityError> {",
  '        let key = env::var("STRIPE_API_KEY")?;',
  '        ctx.record_heartbeat("charging".to_string()).await?;',
  "        if input.amount_cents <= 0 {",
  '            return Err(ApplicationFailure::non_retryable("Nothing to charge").into());',
  "        }",
  "        let client = Client::new(key);",
  '        Ok(ChargeResult { charge_id: "ch_1".into() })',
  "    }",
  "}",
);

/** Whether the pattern matches the text. */
const matches = (pattern: Pattern, text: string) => pattern.regex.test(text);

describe("rustDetector", () => {
  describe("the patterns", () => {
    it("are named, unique, documented and stateless", () => {
      const names = rustPatterns.map((pattern) => pattern.name);
      expect(new Set(names).size).toBe(names.length);
      for (const pattern of rustPatterns) {
        expect(pattern.name).toMatch(/^rust(?:-[a-z]+)+$/);
        expect(pattern.description.length).toBeGreaterThan(0);
        expect(pattern.regex.global || pattern.regex.sticky).toBe(false);
      }
    });

    it("are registered with the pipeline", () => {
      expect(sdkRegistry.Rust.detector).toBe(rustDetector);
    });

    // Each named pattern matches its case and misses a near-miss.
    it.each<[Pattern, string, string]>([
      [
        rustSdkUse,
        "use temporalio_sdk::activities::ActivityContext;",
        "use temporal_sdk::activities::ActivityContext;",
      ],
      [
        rustActivityAttribute,
        '#[activity(name = "charge-card")]',
        "#[activities]",
      ],
      [rustActivitiesAttribute, "#[activities]", "#[activity]"],
      [rustActivityFunction, "pub async fn charge_card(", "pub struct Acts {"],
      [rustSelfParameter, "self: Arc<Self>", "selfish: Arc<Self>"],
      [rustParameter, "mut input: ChargeRequest", "(a, b)"],
      [
        rustActivityContextType,
        "temporalio_sdk::activities::ActivityContext",
        "ActivityContextView",
      ],
      [rustReturnType, " -> Result<String, ActivityError> ", " where T: Send"],
      [rustResultType, "anyhow::Result<String>", "Option<String>"],
      [rustTypeName, "Option<HashMap<String, u32>>", "(String, u32)"],
      [
        rustNonRetryableFailure,
        'ApplicationFailure::non_retryable("bad")',
        'ApplicationFailure::builder("bad")',
      ],
      [
        rustNonRetryableSetting,
        ".non_retryable(true)",
        ".non_retryable(false)",
      ],
      [
        rustNonRetryableVariant,
        "ActivityError::NonRetryable(err.into())",
        "ActivityError::Retryable(err.into())",
      ],
      [rustEnvironmentRead, 'std::env::var("API_KEY")', 'env!("API_KEY")'],
      [rustUseDeclaration, "pub(crate) use stripe::Client;", "// uses stripe"],
      [rustExternCrate, "extern crate serde;", "extern serde;"],
      [
        rustHeartbeatCall,
        "ctx.record_heartbeat(())",
        "record_heartbeat_later()",
      ],
      [rustCommentOrString, 'r#"a "quoted" word"#', "'a"],
    ])("%o matches %j and misses %j", (pattern, hit, miss) => {
      expect(matches(pattern, hit)).toBe(true);
      expect(matches(pattern, miss)).toBe(false);
    });

    it("reads what may come before an activity function, and nothing else", () => {
      const before = new RegExp(`^${rustBeforeFunction.regex.source}`);
      const text =
        "\n    /// Docs.\n    #[instrument(skip(self))] // note\n    /* block */\n    pub async fn act(";
      expect(before.exec(text)?.[0]).toBe(
        "\n    /// Docs.\n    #[instrument(skip(self))] // note\n    /* block */\n    ",
      );
      expect(before.exec("pub fn act(")?.[0]).toBe("");
    });
  });

  describe("the eight facts", () => {
    it("detects every fact of a representative activity", () => {
      expect(checkCode(chargeCard, registeredSdks)).toEqual({
        sdk: "Rust",
        activity: { name: "charge_card", line: 25 },
        input: "ChargeRequest",
        output: "ChargeResult",
        runsAs: "async",
        nonRetryableErrors: [{ line: 33 }],
        configurationRead: [{ name: "STRIPE_API_KEY", line: 30 }],
        dependencies: [
          { name: "async_stripe", line: 4 },
          { name: "serde", line: 5 },
        ],
        heartbeats: [{ line: 31 }],
        provenance: {
          sdk: "detected",
          activity: "detected",
          inputOutput: "detected",
          runsAs: "detected",
          nonRetryableErrors: "detected",
          configurationRead: "detected",
          dependencies: "detected",
          heartbeats: "detected",
        },
      });
    });

    it("detects Temporal's quickstart activity", () => {
      const quickstart = lines(
        "use temporalio_macros::activities;",
        "use temporalio_sdk::activities::{ActivityContext, ActivityError};",
        "",
        "pub struct MyActivities;",
        "",
        "#[activities]",
        "impl MyActivities {",
        "    #[activity]",
        "    pub async fn greet(_ctx: ActivityContext, name: String) -> Result<String, ActivityError> {",
        '        Ok(format!("Hello, {}!", name))',
        "    }",
        "}",
      );
      expect(checkCode(quickstart, registeredSdks)).toMatchObject({
        sdk: "Rust",
        activity: { name: "greet", line: 9 },
        input: "String",
        output: "String",
        runsAs: "async",
        nonRetryableErrors: [],
        configurationRead: [],
        dependencies: [],
        heartbeats: [],
      });
    });

    it("gives the same facts for CRLF input as for LF input", () => {
      const crlf = chargeCard.split("\n").join("\r\n");
      expect(checkCode(crlf, registeredSdks)).toEqual(
        checkCode(chargeCard, registeredSdks),
      );
    });
  });

  describe("the activity", () => {
    it("reports the function name when the attribute gives an explicit name", () => {
      const code = implWith(
        '    #[activity(name = "charge-card")]',
        "    pub async fn charge(_ctx: ActivityContext, input: In) -> Result<Out, ActivityError> {",
        "        todo!()",
        "    }",
      );
      expect(onlyActivity(code).activity).toEqual({ name: "charge", line: 9 });
    });

    it("reads the attribute written with its crate's path", () => {
      const code = implWith(
        "    #[temporalio_macros::activity]",
        "    pub async fn act(_ctx: ActivityContext) -> Result<(), ActivityError> {",
        "        Ok(())",
        "    }",
      );
      expect(onlyActivity(code).activity.name).toBe("act");
    });

    it("reads a signature with other attributes, comments and a where clause", () => {
      const code = implWith(
        "    #[activity]",
        "    #[instrument(skip(ctx))]",
        "    // Charges the card.",
        "    pub async fn act<T>(",
        "        ctx: ActivityContext, // the context",
        "        input: Vec<T>,",
        "    ) -> Result<Option<Out>, ActivityError>",
        "    where",
        "        T: Send,",
        "    {",
        "        todo!()",
        "    }",
      );
      expect(onlyActivity(code)).toMatchObject({
        activity: { name: "act", line: 11 },
        input: "Vec<T>",
        output: "Option<Out>",
        runsAs: "async",
      });
    });
  });

  describe("input and output", () => {
    it("reads qualified and generic types, and a context written with its path", () => {
      const code = implWith(
        "    #[activity]",
        "    pub async fn act(",
        "        ctx: temporalio_sdk::activities::ActivityContext,",
        "        input: models::ChargeRequest,",
        "    ) -> anyhow::Result<HashMap<String, u32>> {",
        "        todo!()",
        "    }",
      );
      expect(onlyActivity(code)).toMatchObject({
        input: "models::ChargeRequest",
        output: "HashMap<String, u32>",
      });
    });

    it("reports no output for a Result of () or a function returning nothing", () => {
      for (const signature of [
        "    pub async fn act(ctx: ActivityContext, input: In) -> Result<(), ActivityError> {",
        "    pub async fn act(ctx: ActivityContext, input: In) {",
      ]) {
        const code = implWith("    #[activity]", signature, "    }");
        expect(onlyActivity(code)).toMatchObject({ input: "In", output: null });
      }
    });

    it("reports the input as unknown with no input, with several, or with a pattern", () => {
      for (const parameters of [
        "ctx: ActivityContext",
        "ctx: ActivityContext, a: String, b: u32",
        "ctx: ActivityContext, (a, b): (String, u32)",
      ]) {
        const code = implWith(
          "    #[activity]",
          `    pub async fn act(${parameters}) -> Result<Out, ActivityError> {`,
          "    }",
        );
        expect(onlyActivity(code).input).toBeNull();
      }
    });

    it("reports a type that can't be shown as a type name as unknown", () => {
      const code = implWith(
        "    #[activity]",
        "    pub async fn act(ctx: ActivityContext, input: (String, u32)) -> Result<[u8; 4], ActivityError> {",
        "    }",
      );
      expect(onlyActivity(code)).toMatchObject({ input: null, output: null });
    });
  });

  describe("runs as", () => {
    it("reports an async fn as async, and a fn without async as synchronous", () => {
      expect(onlyActivity(activityWith()).runsAs).toBe("async");
      const code = implWith(
        "    #[activity]",
        "    pub fn act(ctx: ActivityContext, input: In) -> Result<Out, ActivityError> {",
        "    }",
      );
      expect(onlyActivity(code).runsAs).toBe("sync");
    });
  });

  describe("no activity", () => {
    it("refuses a file with SDK uses but no #[activity] function as no activity", () => {
      const code = lines(
        "use temporalio_sdk::activities::ActivityContext;",
        "",
        "pub async fn helper(ctx: ActivityContext) {}",
      );
      expect(refusalOf(code)).toMatchObject({
        type: refusalTypes.noActivity,
        sdk: "Rust",
      });
    });

    it("refuses a declared Rust file with no activity as no activity", () => {
      expect(() =>
        checkCode('fn main() { println!("hi"); }', registeredSdks, "Rust"),
      ).toThrow(CheckRefusal);
      try {
        checkCode('fn main() { println!("hi"); }', registeredSdks, "Rust");
      } catch (error) {
        expect((error as CheckRefusal).problem).toMatchObject({
          type: refusalTypes.noActivity,
          sdk: "Rust",
        });
      }
    });

    it("asks for the SDK when plain Rust with no Temporal marker is pasted", () => {
      expect(refusalOf('fn main() { println!("hi"); }')).toMatchObject({
        type: refusalTypes.sdkChoiceNeeded,
        reason: "not-identified",
      });
    });
  });

  describe("counting activities", () => {
    it("refuses a file with two activities", () => {
      const code = implWith(
        "    #[activity]",
        "    pub async fn one(ctx: ActivityContext, input: In) -> Result<Out, ActivityError> {",
        "        todo!()",
        "    }",
        "",
        "    #[activity]",
        "    pub async fn two(ctx: ActivityContext, input: In) -> Result<Out, ActivityError> {",
        "        todo!()",
        "    }",
      );
      expect(detect(code)).toHaveLength(2);
      expect(refusalOf(code)).toMatchObject({
        type: refusalTypes.multipleActivities,
        count: 2,
      });
    });

    it("counts two #[activity] attributes stacked on one function once", () => {
      const code = implWith(
        "    #[activity]",
        "    #[activity]",
        "    pub async fn act(ctx: ActivityContext, input: In) -> Result<Out, ActivityError> {",
        "    }",
      );
      expect(detect(code)).toHaveLength(1);
    });

    it("ignores commented-out activities and attributes inside strings", () => {
      const code = implWith(
        "    // #[activity]",
        "    // pub async fn old(ctx: ActivityContext) -> Result<(), ActivityError> {}",
        "    /* #[activity]",
        "    pub async fn older(ctx: ActivityContext) -> Result<(), ActivityError> {} */",
        '    const EXAMPLE: &str = "#[activity] pub async fn shown(ctx: ActivityContext) {}";',
        "    #[activity]",
        "    pub async fn act(ctx: ActivityContext, input: In) -> Result<Out, ActivityError> {",
        "    }",
      );
      expect(detect(code).map(({ activity }) => activity.name)).toEqual([
        "act",
      ]);
    });
  });

  describe("non-retryable errors", () => {
    it("finds the SDK's non-retryable application failure, with its line", () => {
      const code = activityWith(
        '        return Err(ApplicationFailure::non_retryable("Nothing to charge").into());',
      );
      expect(onlyActivity(code).nonRetryableErrors).toEqual([{ line: 10 }]);
    });

    it("finds a qualified failure, a builder setting and the earlier SDK's variant, in order", () => {
      const code = activityWith(
        "        let a = temporalio_sdk::activities::ApplicationFailure::non_retryable(msg);",
        '        let b = ApplicationFailure::builder("bad")',
        "            .non_retryable(true)",
        "            .build();",
        "        return Err(ActivityError::NonRetryable(err.into()));",
      );
      expect(onlyActivity(code).nonRetryableErrors).toEqual([
        { line: 10 },
        { line: 12 },
        { line: 14 },
      ]);
    });

    it("reports none for retryable failures, commented failures and failures in strings", () => {
      const code = activityWith(
        '        return Err(ApplicationFailure::builder("retry me").build().into());',
        "        // ApplicationFailure::non_retryable(msg)",
        '        let s = "ApplicationFailure::non_retryable(msg)";',
        "        let t = x.non_retryable(false);",
      );
      expect(onlyActivity(code).nonRetryableErrors).toEqual([]);
    });
  });

  describe("configuration read", () => {
    it("finds env::var, std::env::var and env::var_os reads with their lines, each once", () => {
      const code = activityWith(
        '        let a = env::var("API_KEY")?;',
        '        let b = std::env::var("REGION").unwrap_or_default();',
        '        let c = ::std::env::var_os("HOME");',
        '        let d = env::var("API_KEY")?;',
      );
      expect(onlyActivity(code).configurationRead).toEqual([
        { name: "API_KEY", line: 10 },
        { name: "REGION", line: 11 },
        { name: "HOME", line: 12 },
      ]);
    });

    it("ignores the build-time env! macro, commented reads and reads in strings", () => {
      const code = activityWith(
        '        let a = env!("BUILD_KEY");',
        '        // let b = env::var("OLD_KEY");',
        '        let c = "env::var(\\"IN_STRING\\")";',
      );
      expect(onlyActivity(code).configurationRead).toEqual([]);
    });
  });

  describe("dependencies", () => {
    it("leaves out std, core and alloc, the SDK's crates and the code's own paths", () => {
      const code = lines(
        "use std::collections::HashMap;",
        "use core::fmt;",
        "extern crate alloc;",
        "use alloc::vec::Vec;",
        "use crate::models::In;",
        "use self::helpers::run;",
        "use super::Out;",
        "use temporalio_common::protos::Payload;",
        "",
        activityWith(),
      );
      expect(onlyActivity(code).dependencies).toEqual([]);
    });

    it("lists each third-party crate once, at its first line, from use and extern crate", () => {
      const code = lines(
        "extern crate serde;",
        "use aws_sdk_s3::{Client, config::Region};",
        "pub use ::tokio_postgres::NoTls;",
        "use serde::Deserialize;",
        "use r#async::thing;",
        "",
        activityWith("        use slack_morphism::prelude::*;"),
      );
      expect(onlyActivity(code).dependencies).toEqual([
        { name: "serde", line: 1 },
        { name: "aws_sdk_s3", line: 2 },
        { name: "tokio_postgres", line: 3 },
        { name: "async", line: 5 },
        { name: "slack_morphism", line: 16 },
      ]);
    });

    it("ignores uses in comments and strings", () => {
      const code = lines(
        "// use stripe::Client;",
        'const EXAMPLE: &str = "use stripe::Client;";',
        "",
        activityWith(),
      );
      expect(onlyActivity(code).dependencies).toEqual([]);
    });
  });

  describe("heartbeats", () => {
    it("finds each heartbeat call with its line, with or without details", () => {
      const code = activityWith(
        "        ctx.record_heartbeat(()).await?;",
        "        ctx",
        "            .record_heartbeat(progress)",
        "            .await?;",
      );
      expect(onlyActivity(code).heartbeats).toEqual([
        { line: 10 },
        { line: 12 },
      ]);
    });

    it("reports none with no heartbeat call, or only a commented one", () => {
      expect(onlyActivity(activityWith()).heartbeats).toEqual([]);
      const code = activityWith("        // ctx.record_heartbeat(()).await?;");
      expect(onlyActivity(code).heartbeats).toEqual([]);
    });
  });

  describe("comments, strings and characters", () => {
    it("reads code after raw strings, byte strings, characters and lifetimes", () => {
      const code = activityWith(
        '        let a = r#"a "quoted" #[activity] word"#;',
        '        let b = b"ApplicationFailure::non_retryable(x)";',
        "        let c = '\"';",
        '        let d: &\'static str = "x";',
        '        let e = env::var("AFTER")?;',
      );
      expect(onlyActivity(code)).toMatchObject({
        nonRetryableErrors: [],
        configurationRead: [{ name: "AFTER", line: 14 }],
      });
    });

    it("reads a file with an unterminated string or comment without failing", () => {
      expect(() => detect(activityWith('        let a = "open'))).not.toThrow();
      expect(() => detect(activityWith("        /* open"))).not.toThrow();
    });
  });

  describe("the standard-library check", () => {
    it.each(["std", "core", "alloc", "proc_macro", "test"])(
      "reads %s as standard library",
      (crate) => {
        expect(isRustStandardLibrary(crate)).toBe(true);
      },
    );

    it.each(["serde", "stripe", "temporalio_sdk", "standard"])(
      "reads %s as not standard library",
      (crate) => {
        expect(isRustStandardLibrary(crate)).toBe(false);
      },
    );
  });

  describe("integrations", () => {
    it.each([
      ["stripe", "Stripe"],
      ["async-stripe", "Stripe"],
      ["async_stripe", "Stripe"],
      ["aws-sdk-s3", "Amazon S3"],
      ["aws_sdk_s3", "Amazon S3"],
      ["rusoto_s3", "Amazon S3"],
      ["tokio-postgres", "Postgres"],
      ["tokio_postgres", "Postgres"],
      ["slack-morphism", "Slack"],
      ["slack_morphism", "Slack"],
    ])("maps the crate %s to %s", (crate, integration) => {
      expect(integrationsFor("Rust", [{ name: crate }])).toEqual([integration]);
    });

    it("reads a crate's hyphens and underscores as the same", () => {
      expect(normaliseRustCrate("Aws-Sdk-S3")).toBe("aws_sdk_s3");
      expect(normaliseRustCrate("aws_sdk_s3")).toBe("aws_sdk_s3");
    });

    it("shows the integrations a Rust file uses, and no std import", () => {
      const code = lines(
        "use std::env;",
        "use stripe::Client;",
        "use aws_sdk_s3::Client as S3;",
        "use tokio_postgres::NoTls;",
        "use slack_morphism::prelude::*;",
        "",
        activityWith(),
      );
      const facts = checkCode(code, registeredSdks);
      expect(facts.dependencies.map(({ name }) => name)).not.toContain("std");
      expect(integrationsFor("Rust", facts.dependencies)).toEqual([
        "Amazon S3",
        "Postgres",
        "Slack",
        "Stripe",
      ]);
    });
  });

  describe("SDK selection", () => {
    it("identifies a Rust activity as Rust, detected", () => {
      expect(identifySdk(chargeCard, registeredSdks)).toEqual({
        outcome: "identified",
        sdk: "Rust",
        tier: "detected",
        matchedPatterns: [
          "rust-sdk-use",
          "rust-activities-attribute",
          "rust-activity-attribute",
        ],
      });
    });

    it("recognises the SDK from the attributes alone", () => {
      const code = lines(
        "#[activities]",
        "impl Acts {",
        "    #[activity]",
        "    pub async fn act(ctx: ActivityContext, input: In) -> Result<Out, ActivityError> {",
        "    }",
        "}",
      );
      expect(checkCode(code, registeredSdks)).toMatchObject({ sdk: "Rust" });
    });

    it("is never identified as an SDK Durables doesn't accept", () => {
      expect(
        identifySdk(chargeCard, [...registeredSdks, ...unacceptedSdks]),
      ).toMatchObject({ outcome: "identified", sdk: "Rust" });
    });

    it.each([
      [
        "Python",
        lines(
          "from temporalio import activity",
          "",
          "@activity.defn",
          "async def act(items: list[Item]) -> Out:",
          "    ...",
        ),
      ],
      [
        "TypeScript",
        lines(
          'import { heartbeat } from "@temporalio/activity";',
          "",
          "export async function act(input: In): Promise<Out> {",
          "  heartbeat();",
          "  return {};",
          "}",
        ),
      ],
      [
        ".NET",
        lines(
          "using Temporalio.Activities;",
          "",
          "public class Activities",
          "{",
          "    [Activity]",
          "    public Task<Out> Act(In input) => Run(input);",
          "}",
        ),
      ],
      [
        "PHP",
        lines(
          "use Temporal\\Activity\\ActivityInterface;",
          "",
          "#[ActivityInterface]",
          "interface Greeter {",
          "    #[ActivityMethod]",
          "    public function greet(string $name): string;",
          "}",
        ),
      ],
    ])("leaves a %s activity to its own SDK", (sdk, code) => {
      expect(
        identifySdk(code, [...registeredSdks, ...unacceptedSdks]),
      ).toMatchObject({ outcome: "identified", sdk });
    });
  });
});
