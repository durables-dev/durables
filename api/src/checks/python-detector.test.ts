import { registeredSdks, sdkRegistry } from "../sdks/registry";
import { describe, expect, it } from "vitest";
import type { ActivityFacts } from "./facts";
import { checkCode } from "./pipeline";
import { pythonDetector, pythonPatterns } from "./python-detector";
import { pythonStandardLibrary } from "./python-stdlib";
import { CheckRefusal, refusalTypes } from "./refusals";
import { MAX_CODE_BYTES } from "./size-limit";
import { toSource } from "./source";

const detect = (code: string) =>
  pythonDetector.detect(toSource(code), sdkRegistry.Python.isStandardLibrary);

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

/** A minimal activity with the given body lines, which start on line 6. */
const activityWith = (...body: string[]) =>
  lines(
    "from temporalio import activity",
    "",
    "",
    "@activity.defn",
    "async def act(input: In) -> Out:",
    ...body,
    "    return Out()",
  );

// The sample from screens 10 and 12 of the MVP screens.
const postSlackMessage = lines(
  "from dataclasses import dataclass",
  "import os",
  "",
  "import httpx",
  "from temporalio import activity",
  "",
  'SLACK_TOKEN = os.environ["SLACK_TOKEN"]',
  "",
  "",
  "@dataclass",
  "class SlackMessage:",
  "    channel: str",
  "    text: str",
  "",
  "",
  "@dataclass",
  "class MessageRef:",
  "    ts: str",
  "",
  "",
  "@activity.defn",
  "async def post_slack_message(input: SlackMessage) -> MessageRef:",
  "    async with httpx.AsyncClient() as client:",
  "        r = await client.post(",
  '            "https://slack.com/api/chat.postMessage",',
  '            headers={"Authorization": f"Bearer {SLACK_TOKEN}"},',
  '            json={"channel": input.channel, "text": input.text},',
  "        )",
  '        return MessageRef(ts=r.json()["ts"])',
  "",
);

// The canvas's charge_card sample: a synchronous activity raising a non-retryable error.
const chargeCard = lines(
  "from dataclasses import dataclass",
  "import os",
  "",
  "import stripe",
  "from temporalio import activity",
  "from temporalio.exceptions import ApplicationError",
  "",
  'stripe.api_key = os.environ["STRIPE_API_KEY"]',
  "",
  "",
  "@dataclass",
  "class ChargeRequest:",
  "    request_id: str",
  "    amount_cents: int",
  "    currency: str",
  "    payment_method: str",
  "",
  "",
  "@dataclass",
  "class ChargeResult:",
  "    charge_id: str",
  "    status: str",
  "",
  "",
  "@activity.defn",
  "def charge_card(input: ChargeRequest) -> ChargeResult:",
  "    try:",
  "        intent = stripe.PaymentIntent.create(",
  "            amount=input.amount_cents,",
  "            currency=input.currency,",
  "            payment_method=input.payment_method,",
  "            confirm=True,",
  "            idempotency_key=input.request_id,",
  "        )",
  "    except stripe.CardError as err:",
  "        raise ApplicationError(",
  '            f"Card declined: {err.user_message}",',
  '            type="CardDeclined",',
  "            non_retryable=True,",
  "        )",
  "    return ChargeResult(charge_id=intent.id, status=intent.status)",
);

describe("pythonDetector", () => {
  describe("the patterns", () => {
    it("are named, unique, documented and stateless", () => {
      const names = pythonPatterns.map((pattern) => pattern.name);
      expect(new Set(names).size).toBe(names.length);
      for (const pattern of pythonPatterns) {
        expect(pattern.name).toMatch(/^python(?:-[a-z]+)+$/);
        expect(pattern.description.length).toBeGreaterThan(0);
        expect(pattern.regex.global || pattern.regex.sticky).toBe(false);
      }
    });

    it("are registered with the pipeline", () => {
      expect(sdkRegistry.Python.detector).toBe(pythonDetector);
    });

    it("keep the standard library list free of the SDK", () => {
      expect(pythonStandardLibrary.has("os")).toBe(true);
      expect(pythonStandardLibrary.has("temporalio")).toBe(false);
    });
  });

  describe("an async activity with typed input and output", () => {
    it("populates all eight facts for the screen 12 sample", () => {
      expect(checkCode(postSlackMessage, registeredSdks)).toEqual({
        sdk: "Python",
        activity: { name: "post_slack_message", line: 22 },
        input: "SlackMessage",
        output: "MessageRef",
        runsAs: "async",
        nonRetryableErrors: [],
        configurationRead: [{ name: "SLACK_TOKEN", line: 7 }],
        dependencies: [{ name: "httpx", line: 4 }],
        heartbeats: [],
      });
    });

    it("reads a signature split across lines, with stacked decorators and decorator arguments", () => {
      const code = lines(
        "from temporalio import activity",
        "",
        '@activity.defn(name="post")',
        "# Posts the message.",
        "@traced",
        "async def post_slack_message(",
        "    input: SlackMessage,",
        ") -> MessageRef:",
        "    ...",
      );
      expect(onlyActivity(code)).toMatchObject({
        activity: { name: "post_slack_message", line: 6 },
        input: "SlackMessage",
        output: "MessageRef",
        runsAs: "async",
      });
    });

    it("reads a method activity, leaving out self", () => {
      const code = lines(
        "from temporalio import activity",
        "",
        "class Activities:",
        "    @activity.defn",
        "    async def send(self, input: Email) -> Receipt:",
        "        ...",
      );
      expect(onlyActivity(code)).toMatchObject({
        activity: { name: "send", line: 5 },
        input: "Email",
        output: "Receipt",
      });
    });

    it("reads dotted, generic, union and quoted type names", () => {
      const code = lines(
        "from temporalio import activity",
        "@temporalio.activity.defn",
        'async def act(input: "models.Request") -> list[str] | None:',
        "    ...",
      );
      expect(onlyActivity(code)).toMatchObject({
        input: "models.Request",
        output: "list[str] | None",
      });
    });
  });

  describe("runs as", () => {
    it("reports a non-async activity as synchronous", () => {
      expect(onlyActivity(chargeCard)).toMatchObject({
        activity: { name: "charge_card", line: 26 },
        runsAs: "sync",
      });
    });
  });

  describe("no activity", () => {
    it.each([
      [
        "no annotations",
        lines(
          "from temporalio import activity",
          "@activity.defn",
          "async def act(input):",
          "    ...",
        ),
      ],
      [
        "no return annotation",
        lines(
          "from temporalio import activity",
          "@activity.defn",
          "async def act(input: In):",
          "    ...",
        ),
      ],
      [
        "no input annotation",
        lines(
          "from temporalio import activity",
          "@activity.defn",
          "async def act(input) -> Out:",
          "    ...",
        ),
      ],
      [
        "only self",
        lines(
          "from temporalio import activity",
          "class A:",
          "    @activity.defn",
          "    async def act(self) -> Out:",
          "        ...",
        ),
      ],
    ])(
      "refuses the decorator over a function with %s as no activity",
      (_, code) => {
        expect(detect(code)).toEqual([]);
        expect(refusalOf(code)).toMatchObject({
          type: refusalTypes.noActivity,
        });
      },
    );

    it("recognises the SDK from the decorator alone", () => {
      const code = lines("@activity.defn", "def act(input):", "    ...");
      expect(refusalOf(code)).toMatchObject({
        type: refusalTypes.noActivity,
      });
    });
  });

  describe("counting activities", () => {
    it("counts two activities", () => {
      const code = lines(
        chargeCard,
        "",
        "",
        "@activity.defn",
        "def refund_charge(input: RefundRequest) -> RefundResult:",
        "    ...",
      );
      const found = detect(code);
      expect(found.map((facts) => facts.activity)).toEqual([
        { name: "charge_card", line: 26 },
        { name: "refund_charge", line: 45 },
      ]);
      expect(refusalOf(code)).toMatchObject({
        type: refusalTypes.multipleActivities,
        count: 2,
      });
    });

    it("counts a function under several activity decorators once", () => {
      const code = lines(
        "from temporalio import activity",
        "",
        "@activity.defn",
        "# Kept for older workers.",
        '@activity.defn(name="post")',
        "async def post(input: In) -> Out:",
        "    ...",
      );
      expect(onlyActivity(code).activity).toEqual({ name: "post", line: 6 });
    });

    it("reads a decorator whose arguments run over several lines after another decorator", () => {
      const code = lines(
        "from temporalio import activity",
        "",
        "@traced",
        "@activity.defn",
        "@activity.defn(",
        '    name="post",',
        ")",
        "async def post(input: In) -> Out:",
        "    ...",
      );
      expect(onlyActivity(code).activity).toEqual({ name: "post", line: 8 });
    });

    it("ignores a commented-out activity and the decorator inside strings", () => {
      const code = lines(
        "from temporalio import activity",
        "",
        "# @activity.defn",
        "# async def old(input: In) -> Out:",
        "#     ...",
        "",
        'EXAMPLE = "@activity.defn"',
        '"""',
        "@activity.defn",
        "async def example(input: In) -> Out:",
        '"""',
        "",
        "@activity.defn",
        "async def act(input: In) -> Out:",
        "    ...",
      );
      expect(onlyActivity(code).activity).toEqual({ name: "act", line: 14 });
    });
  });

  describe("configuration read", () => {
    it("finds each form of environment read with its line", () => {
      const code = activityWith(
        '    a = os.environ["A_TOKEN"]',
        "    b = os.environ.get('B_URL', 'x')",
        '    c = os.getenv("C_REGION")',
        '    d = environ["D_KEY"]',
        '    e = getenv("E_KEY")',
      );
      expect(onlyActivity(code).configurationRead).toEqual([
        { name: "A_TOKEN", line: 6 },
        { name: "B_URL", line: 7 },
        { name: "C_REGION", line: 8 },
        { name: "D_KEY", line: 9 },
        { name: "E_KEY", line: 10 },
      ]);
    });

    it("lists a variable read twice once, at its first line, and ignores commented and lookalike reads", () => {
      const code = activityWith(
        '    a = os.environ["TOKEN"]',
        '    # b = os.getenv("COMMENTED")',
        '    c = self.environ["NOT_ENV"]',
        '    d = os.getenv("TOKEN")',
      );
      expect(onlyActivity(code).configurationRead).toEqual([
        { name: "TOKEN", line: 6 },
      ]);
    });

    it("reports none when nothing is read", () => {
      expect(onlyActivity(activityWith()).configurationRead).toEqual([]);
    });

    it("finds an environment read inside an f-string", () => {
      const facts = onlyActivity(
        activityWith(`    print(f"{os.environ['X']}")`),
      );
      expect(facts.configurationRead).toEqual([{ name: "X", line: 6 }]);
    });

    it("finds environment reads in the fields of every f-string prefix and quote style", () => {
      const code = activityWith(
        `    a = f"Bearer {os.environ['A']}"`,
        `    b = rf'{os.getenv("B")}'`,
        `    c = FR"x {environ.get('C')} y"`,
        `    d = f"""{os.environ["D"]}`,
        `    """`,
        `    e = f"{{os.environ['E']}} {len(x)!r:>{width}}"`,
        `    g = "{os.environ['G']}"`,
        `    h = b"{os.environ['H']}"`,
      );
      expect(onlyActivity(code).configurationRead).toEqual([
        { name: "A", line: 6 },
        { name: "B", line: 7 },
        { name: "C", line: 8 },
        { name: "D", line: 9 },
      ]);
    });
  });

  describe("dependencies", () => {
    it("reports none for standard-library and SDK imports", () => {
      const code = lines(
        "import asyncio, json",
        "import os.path",
        "from dataclasses import dataclass",
        "from __future__ import annotations",
        "import temporalio",
        "from temporalio import activity",
        "from temporalio.exceptions import ApplicationError",
        "",
        "@activity.defn",
        "async def act(input: In) -> Out:",
        "    import datetime",
        "    ...",
      );
      expect(onlyActivity(code).dependencies).toEqual([]);
    });

    it("lists a package imported three ways once, at its first import", () => {
      const code = lines(
        "import httpx",
        "from httpx import Client",
        "import httpx as h",
        "from temporalio import activity",
        "",
        "@activity.defn",
        "async def act(input: In) -> Out:",
        "    ...",
      );
      expect(onlyActivity(code).dependencies).toEqual([
        { name: "httpx", line: 1 },
      ]);
    });

    it("resolves submodules, aliases and lists to the top-level package, in order", () => {
      const code = lines(
        "from temporalio import activity",
        "import google.cloud.storage as gcs, boto3",
        "from slack_sdk.web.async_client import AsyncWebClient",
        "",
        "@activity.defn",
        "async def act(input: In) -> Out:",
        "    import redis",
        "    ...",
      );
      expect(onlyActivity(code).dependencies).toEqual([
        { name: "google", line: 2 },
        { name: "boto3", line: 2 },
        { name: "slack_sdk", line: 3 },
        { name: "redis", line: 7 },
      ]);
    });

    it("ignores relative imports and imports in comments or strings", () => {
      const code = lines(
        "from temporalio import activity",
        "from . import models",
        "from .models import Request",
        "from ..shared.client import make_client",
        "# import requests",
        '"""',
        "import pandas",
        '"""',
        "",
        "@activity.defn",
        "async def act(input: Request) -> Out:",
        "    ...",
      );
      expect(onlyActivity(code).dependencies).toEqual([]);
    });
  });

  describe("heartbeats", () => {
    it("finds a heartbeat call with its line", () => {
      const code = activityWith(
        "    for item in input.items:",
        "        activity.heartbeat(item)",
        "        activity.heartbeat()",
      );
      expect(onlyActivity(code).heartbeats).toEqual([{ line: 7 }, { line: 8 }]);
    });

    it("reports none when there is no heartbeat call", () => {
      const code = activityWith("    # activity.heartbeat()", "    beat()");
      expect(onlyActivity(code).heartbeats).toEqual([]);
    });
  });

  describe("non-retryable errors", () => {
    it("reports the line of non_retryable=True in a raised application error, as the pasted text numbers it", () => {
      expect(onlyActivity(chargeCard).nonRetryableErrors).toEqual([
        { line: 39 },
      ]);
    });

    it("finds a one-line raise, and a qualified error class", () => {
      const code = activityWith(
        '    raise ApplicationError("bad input", non_retryable=True)',
        "    raise exceptions.ApplicationError(",
        '        str(err), type="Gone", non_retryable=True',
        "    )",
      );
      expect(onlyActivity(code).nonRetryableErrors).toEqual([
        { line: 6 },
        { line: 8 },
      ]);
    });

    it("finds a non-retryable raise whose arguments nest calls two deep", () => {
      const facts = onlyActivity(
        activityWith(
          "    raise ApplicationError(str(fmt(x)), non_retryable=True)",
        ),
      );
      expect(facts.nonRetryableErrors).toEqual([{ line: 6 }]);
    });

    it("finds a non-retryable raise past deeper nesting and brackets inside strings", () => {
      const code = activityWith(
        "    raise ApplicationError(",
        '        f"failed ({a(b(c(d)))})", ")(", "[",',
        "        details=[{'k': (1, 2)}],",
        "        non_retryable=True,",
        "    )",
      );
      expect(onlyActivity(code).nonRetryableErrors).toEqual([{ line: 9 }]);
    });

    it("reports none when non_retryable=True belongs to a call nested in the arguments", () => {
      const code = activityWith(
        "    raise ApplicationError(wrap(non_retryable=True))",
        '    raise ApplicationError("x", "non_retryable=True")',
        "    raise ApplicationError(x)",
        "    other(non_retryable=True)",
      );
      expect(onlyActivity(code).nonRetryableErrors).toEqual([]);
    });

    it("reports none for retryable errors, commented raises and no raise", () => {
      const code = activityWith(
        '    raise ApplicationError("try again")',
        '    raise ApplicationError("x", non_retryable=False)',
        '    # raise ApplicationError("x", non_retryable=True)',
      );
      expect(onlyActivity(code).nonRetryableErrors).toEqual([]);
      expect(onlyActivity(activityWith()).nonRetryableErrors).toEqual([]);
    });
  });

  describe("line endings", () => {
    it("gives the same facts for CRLF input as for LF input", () => {
      const withEverything = lines(
        chargeCard,
        "",
        "def helper() -> None:",
        "    activity.heartbeat()",
      );
      const lf = detect(withEverything);
      const crlf = detect(withEverything.replaceAll("\n", "\r\n"));
      expect(crlf).toEqual(lf);
      expect(lf[0]).toMatchObject({
        activity: { line: 26 },
        nonRetryableErrors: [{ line: 39 }],
        configurationRead: [{ name: "STRIPE_API_KEY", line: 8 }],
        dependencies: [{ name: "stripe", line: 4 }],
        heartbeats: [{ line: 44 }],
      });
    });
  });

  describe("types that can't be read", () => {
    it.each([
      [
        "several parameters",
        "async def act(user_id: str, amount: int) -> Receipt:",
        null,
        "Receipt",
      ],
      [
        "an annotation with a call in it",
        "async def act(input: Annotated[Req, Field(gt=0)]) -> Out:",
        null,
        "Out",
      ],
      [
        "a return annotation with a call in it",
        "async def act(input: Req) -> make_type():",
        "Req",
        null,
      ],
    ])(
      "reports the input or output as unknown for %s",
      (_, signature, input, output) => {
        const code = lines(
          "from temporalio import activity",
          "@activity.defn",
          signature,
          "    ...",
        );
        expect(onlyActivity(code)).toMatchObject({ input, output });
      },
    );
  });

  describe("files at the size limit", () => {
    // Each input once made detection read the rest of the file again from every decorator, which
    // took well over a second. Read once, each takes a few milliseconds, so the bound is tight
    // enough to catch that coming back.
    const atLimit = (prefix: string, unit: string) =>
      prefix +
      unit.repeat(Math.floor((MAX_CODE_BYTES - prefix.length) / unit.length));
    const sdk = "from temporalio import activity\n";
    const adversarial: [string, string][] = [
      ["stacked decorators", atLimit(sdk, "@activity.defn\n")],
      ["decorators with unclosed arguments", atLimit(sdk, "@activity.defn(\n")],
      [
        "decorators between comments and other decorators",
        atLimit(sdk, "@activity.defn\n# note\n@traced\n\n"),
      ],
      [
        "decorators with arguments over several lines",
        atLimit(sdk, '@activity.defn(\n    name="post",\n)\n'),
      ],
    ];

    it.each(adversarial)("detects %s in under 250 ms", (_, code) => {
      const started = performance.now();
      detect(code);
      expect(performance.now() - started).toBeLessThan(250);
    });

    it("reads one function under a file of stacked decorators once", () => {
      const def = "async def act(input: In) -> Out:\n    ...\n";
      const decorator = "@activity.defn\n";
      const stacked = decorator.repeat(
        Math.floor(
          (MAX_CODE_BYTES - sdk.length - def.length) / decorator.length,
        ),
      );
      expect(detect(sdk + stacked + def)).toHaveLength(1);
    });
  });
});
