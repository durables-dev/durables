import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createApp } from "../index";
import { readAllRows } from "../storage/seed";
import { createChecks } from "./checks";
import type { CheckedSdk } from "./pipeline";
import { pythonSdkImport } from "./python-detector";
import { refusalTypes } from "./refusals";
import { MAX_CODE_BYTES } from "./size-limit";

const problemContentType = "application/problem+json";

const lines = (...code: string[]) => code.join("\n");

/** A Python activity with all eight facts, after the sample on screens 10 and 12. */
const postSlackMessage = lines(
  "from dataclasses import dataclass",
  "import os",
  "",
  "import httpx",
  "from temporalio import activity",
  "from temporalio.exceptions import ApplicationError",
  "",
  'SLACK_TOKEN = os.environ["SLACK_TOKEN"]',
  "",
  "",
  "@dataclass",
  "class SlackMessage:",
  "    channel: str",
  "",
  "",
  "@dataclass",
  "class MessageRef:",
  "    ts: str",
  "",
  "",
  "@activity.defn",
  "async def post_slack_message(input: SlackMessage) -> MessageRef:",
  "    activity.heartbeat()",
  "    if not input.channel:",
  '        raise ApplicationError("No channel", non_retryable=True)',
  "    return MessageRef(ts=httpx.get(SLACK_TOKEN).text)",
  "",
);

const postSlackMessageFacts = {
  sdk: "Python",
  activity: { name: "post_slack_message", line: 22 },
  input: "SlackMessage",
  output: "MessageRef",
  runsAs: "async",
  nonRetryableErrors: [{ line: 25 }],
  configurationRead: [{ name: "SLACK_TOKEN", line: 8 }],
  dependencies: [{ name: "httpx", line: 4 }],
  heartbeats: [{ line: 23 }],
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
};

/** A TypeScript activity, so a declared SDK can be checked against code it doesn't fit. */
const greetTypeScript = lines(
  'import { heartbeat } from "@temporalio/activity";',
  "",
  "export async function greet(name: string): Promise<string> {",
  "  heartbeat();",
  "  return `Hello ${name}`;",
  "}",
  "",
);

/** A request body of exactly `bytes` bytes: the sample, padded with a trailing comment. */
const paddedBody = (bytes: number): string => {
  const base = `${postSlackMessage}# `;
  const overhead = JSON.stringify({ code: base }).length;
  const body = JSON.stringify({ code: base + "x".repeat(bytes - overhead) });
  expect(new TextEncoder().encode(body).byteLength).toBe(bytes);
  return body;
};

/** Signs in through the local fake provider as a new publisher, and returns the cookie. */
const signIn = async (
  providerAccountId = `publisher-${crypto.randomUUID()}`,
  name = "Ada Lovelace",
): Promise<string> => {
  const response = await exports.default.fetch(
    "http://localhost/api/session/providers/fake",
    {
      method: "POST",
      headers: {
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, providerAccountId }),
    },
  );
  expect(response.status).toBe(204);
  return (response.headers.get("Set-Cookie") ?? "").split(";")[0] ?? "";
};

const checkRequest = (
  cookie: string | undefined,
  body: BodyInit,
  headers: Record<string, string> = {},
): RequestInit => ({
  method: "POST",
  headers: {
    "Sec-Fetch-Site": "same-origin",
    "Content-Type": "application/json",
    ...(cookie === undefined ? {} : { Cookie: cookie }),
    ...headers,
  },
  body,
});

/** Posts to the real Worker's detection check. */
const check = (
  cookie: string | undefined,
  body: BodyInit,
  headers: Record<string, string> = {},
) =>
  exports.default.fetch(
    "http://localhost/api/checks",
    checkRequest(cookie, body, headers),
  );

const checkCode = (cookie: string | undefined, code: string) =>
  check(cookie, JSON.stringify({ code }));

/** Captures every console level, so a test can search what was logged. */
const captureLogs = () => {
  const spies = (["log", "info", "warn", "error", "debug"] as const).map(
    (level) => vi.spyOn(console, level).mockImplementation(() => undefined),
  );
  return () => JSON.stringify(spies.map((spy) => spy.mock.calls));
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/checks", () => {
  test("answers 200 with the SDK, activity and facts for an accepted file", async () => {
    const cookie = await signIn();

    const response = await checkCode(cookie, postSlackMessage);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual(postSlackMessageFacts);
  });

  describe("a Java activity", () => {
    const sendSms = lines(
      "import com.twilio.Twilio;",
      "import io.temporal.activity.ActivityInterface;",
      "",
      "@ActivityInterface",
      "public interface SmsActivities {",
      "    String sendSms(SmsRequest request);",
      "}",
      "",
      "class SmsActivitiesImpl implements SmsActivities {",
      "    @Override",
      "    public String sendSms(SmsRequest request) {",
      '        Twilio.init(System.getenv("TWILIO_ACCOUNT_SID"), "token");',
      "        return request.to();",
      "    }",
      "}",
      "",
    );

    test("answers 200 with the eight facts and the SDK detected", async () => {
      const cookie = await signIn();

      const response = await checkCode(cookie, sendSms);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        sdk: "Java",
        activity: { name: "sendSms", line: 6 },
        input: "SmsRequest",
        output: "String",
        runsAs: "sync",
        nonRetryableErrors: [],
        configurationRead: [{ name: "TWILIO_ACCOUNT_SID", line: 12 }],
        dependencies: [{ name: "com.twilio", line: 1 }],
        heartbeats: [],
        provenance: postSlackMessageFacts.provenance,
      });
    });

    test("answers 200 with the SDK inferred for an implementation-only paste", async () => {
      const cookie = await signIn();
      const implementation = lines(
        "public class SmsActivitiesImpl implements SmsActivities {",
        "    public String sendSms(SmsRequest request) {",
        "        return request.to();",
        "    }",
        "}",
      );

      const response = await checkCode(cookie, implementation);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        sdk: "Java",
        activity: { name: "sendSms", line: 2 },
        provenance: { sdk: "inferred", activity: "detected" },
      });
    });
  });

  test("ignores detection results sent by the client", async () => {
    const cookie = await signIn();

    const response = await check(
      cookie,
      JSON.stringify({
        code: postSlackMessage,
        sdk: "Java",
        activity: { name: "forged", line: 1 },
        facts: { sdk: "Go" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(postSlackMessageFacts);
  });

  describe("a declared SDK", () => {
    test("answers 200 with the declared SDK's facts and the SDK declared", async () => {
      const cookie = await signIn();

      const response = await check(
        cookie,
        JSON.stringify({ code: postSlackMessage, declaredSdk: "Python" }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ...postSlackMessageFacts,
        provenance: { ...postSlackMessageFacts.provenance, sdk: "declared" },
      });
    });

    test("answers 200 for code no SDK is identified in, once the SDK is declared", async () => {
      const cookie = await signIn();
      const ambiguous = lines(
        "from temporalio import activity",
        "@activity.defn",
        greetTypeScript,
      );

      const response = await check(
        cookie,
        JSON.stringify({ code: ambiguous, declaredSdk: "TypeScript" }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        sdk: "TypeScript",
        activity: { name: "greet" },
        provenance: { sdk: "declared" },
      });
    });

    test("answers 422 no activity, naming the SDK, when the declared detector finds none", async () => {
      const cookie = await signIn();

      const response = await check(
        cookie,
        JSON.stringify({ code: greetTypeScript, declaredSdk: ".NET" }),
      );

      expect(response.status).toBe(422);
      expect(response.headers.get("Content-Type")).toBe(problemContentType);
      expect(await response.json()).toMatchObject({
        type: refusalTypes.noActivity,
        status: 422,
        sdk: ".NET",
      });
    });

    test.each([
      { case: "an SDK not in the list", declaredSdk: "Cobol" },
      { case: "a lowercased SDK", declaredSdk: "python" },
      { case: "a declared SDK that isn't a string", declaredSdk: 42 },
    ])("answers 400 with a field error for $case", async ({ declaredSdk }) => {
      const cookie = await signIn();

      const response = await check(
        cookie,
        JSON.stringify({ code: postSlackMessage, declaredSdk }),
      );

      expect(response.status).toBe(400);
      expect(response.headers.get("Content-Type")).toBe(problemContentType);
      const problem = await response.json<{
        errors: { field: string; message: string }[];
      }>();
      expect(problem.errors).toEqual([
        { field: "declaredSdk", message: expect.any(String) as string },
      ]);
    });

    test("ignores facts and provenance sent by the client with a declared SDK", async () => {
      const cookie = await signIn();

      const response = await check(
        cookie,
        JSON.stringify({
          code: postSlackMessage,
          declaredSdk: "Python",
          activity: { name: "forged", line: 1 },
          provenance: { sdk: "detected", activity: "declared" },
          facts: { sdk: "TypeScript" },
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ...postSlackMessageFacts,
        provenance: { ...postSlackMessageFacts.provenance, sdk: "declared" },
      });
    });
  });

  describe("a Go activity", () => {
    const greet = (...imports: string[]) =>
      lines(
        "package greeting",
        "",
        "import (",
        '    "context"',
        ...imports,
        ")",
        "",
        "func Greet(ctx context.Context, name string) (string, error) {",
        '    return "Hello " + name, nil',
        "}",
        "",
      );

    test("answers 200 with the Go facts and the SDK detected from its Temporal import", async () => {
      const cookie = await signIn();

      const response = await checkCode(
        cookie,
        greet('    "go.temporal.io/sdk/activity"'),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        sdk: "Go",
        activity: { name: "Greet", line: 8 },
        input: "string",
        output: "string",
        runsAs: "sync",
        provenance: { sdk: "detected", activity: "detected" },
      });
    });

    test("answers 200 with the SDK inferred when the activity has no Temporal marker", async () => {
      const cookie = await signIn();

      const response = await checkCode(cookie, greet('    "fmt"'));

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        sdk: "Go",
        activity: { name: "Greet", line: 8 },
        dependencies: [],
        provenance: { sdk: "inferred", activity: "detected" },
      });
    });

    test("answers 422 more than one activity for a Go file with two", async () => {
      const cookie = await signIn();
      const code = lines(
        greet(),
        "func Farewell(ctx context.Context, name string) (string, error) {",
        '    return "Bye " + name, nil',
        "}",
      );

      const response = await checkCode(cookie, code);

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        type: refusalTypes.multipleActivities,
        count: 2,
      });
    });
  });

  describe("refusals", () => {
    test.each([
      {
        refusal: "SDK recognised, no activity",
        code: lines("from temporalio import activity", "", "x = 1", ""),
        expected: { type: refusalTypes.noActivity, sdk: "Python" },
      },
      {
        refusal: "code no SDK is identified in",
        code: lines("def add(a, b):", "    return a + b", ""),
        expected: {
          type: refusalTypes.sdkChoiceNeeded,
          reason: "not-identified",
        },
      },
      {
        refusal: "code more than one SDK matches",
        code: lines(
          "from temporalio import activity",
          "@activity.defn",
          greetTypeScript,
        ),
        expected: { type: refusalTypes.sdkChoiceNeeded, reason: "ambiguous" },
      },
      {
        refusal: "empty code",
        code: "",
        expected: { type: refusalTypes.notTemporalActivity },
      },
      {
        refusal: "Temporal activity in an unaccepted SDK",
        code: lines(
          "<?php",
          "",
          "use Temporal\\Activity\\ActivityInterface;",
          "",
          "#[ActivityInterface]",
          "interface Greeting {}",
          "",
        ),
        expected: { type: refusalTypes.unacceptedSdk, sdk: "PHP" },
      },
      {
        refusal: "more than one activity",
        code: lines(
          "from temporalio import activity",
          "",
          "@activity.defn",
          "async def first(input: In) -> Out:",
          "    return Out()",
          "",
          "@activity.defn",
          "async def second(input: In) -> Out:",
          "    return Out()",
          "",
        ),
        expected: { type: refusalTypes.multipleActivities, count: 2 },
      },
    ])(
      "answers 422 with its own type for $refusal",
      async ({ code, expected }) => {
        const cookie = await signIn();

        const response = await checkCode(cookie, code);

        expect(response.status).toBe(422);
        expect(response.headers.get("Content-Type")).toBe(problemContentType);
        expect(await response.json()).toMatchObject({
          ...expected,
          status: 422,
        });
      },
    );
  });

  describe("sign-in", () => {
    test("answers 401 Problem Details when signed out", async () => {
      const response = await checkCode(undefined, postSlackMessage);

      expect(response.status).toBe(401);
      expect(response.headers.get("Content-Type")).toBe(problemContentType);
      expect(await response.json()).toMatchObject({ status: 401 });
    });

    test("answers 401 for a tampered session cookie", async () => {
      const cookie = await signIn();

      const response = await checkCode(`${cookie}x`, postSlackMessage);

      expect(response.status).toBe(401);
    });
  });

  describe("the body limit", () => {
    test("checks a body of exactly the limit", async () => {
      const cookie = await signIn();

      const response = await check(cookie, paddedBody(MAX_CODE_BYTES));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(postSlackMessageFacts);
    });

    test("answers 413 Problem Details for a body one byte over the limit", async () => {
      const cookie = await signIn();

      const response = await check(cookie, paddedBody(MAX_CODE_BYTES + 1));

      expect(response.status).toBe(413);
      expect(response.headers.get("Content-Type")).toBe(problemContentType);
      expect(await response.json()).toMatchObject({
        type: refusalTypes.codeTooLarge,
        status: 413,
        limitBytes: MAX_CODE_BYTES,
      });
    });

    test("answers 413 for an oversized body sent without a length", async () => {
      const cookie = await signIn();
      const bytes = new TextEncoder().encode(paddedBody(MAX_CODE_BYTES + 1));
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });

      const response = await check(cookie, stream);

      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({
        type: refusalTypes.codeTooLarge,
      });
    });
  });

  describe("the rate limit", () => {
    test("answers 429 on a publisher's 61st check in a minute, and not another publisher's first", async () => {
      const publisher = `publisher-${crypto.randomUUID()}`;
      // Two sessions for the same publisher share one limit: it is keyed by the publisher.
      const firstSession = await signIn(publisher, "Ada Lovelace");
      const secondSession = await signIn(publisher, "Ada King");
      expect(secondSession).not.toBe(firstSession);

      for (let i = 0; i < 60; i++) {
        const response = await checkCode(
          i % 2 === 0 ? firstSession : secondSession,
          "x",
        );
        expect(response.status).toBe(422);
      }
      const refused = await checkCode(firstSession, postSlackMessage);

      expect(refused.status).toBe(429);
      expect(refused.headers.get("Content-Type")).toBe(problemContentType);
      expect(await refused.json()).toMatchObject({ status: 429 });

      // Every test request comes from the same address, so this also shows the key isn't the IP.
      const other = await checkCode(await signIn(), postSlackMessage);
      expect(other.status).toBe(200);
    });
  });

  describe("validation", () => {
    test.each([
      { case: "a missing code field", body: {} },
      { case: "a code field that isn't a string", body: { code: 42 } },
      { case: "a null code field", body: { code: null } },
    ])("answers 400 with a field error for $case", async ({ body }) => {
      const cookie = await signIn();

      const response = await check(cookie, JSON.stringify(body));

      expect(response.status).toBe(400);
      expect(response.headers.get("Content-Type")).toBe(problemContentType);
      const problem = await response.json<{
        errors: { field: string; message: string }[];
      }>();
      expect(problem).toMatchObject({ status: 400 });
      expect(problem.errors).toEqual([
        { field: "code", message: expect.any(String) as string },
      ]);
    });

    test("answers 400 Problem Details for a body that isn't JSON", async () => {
      const cookie = await signIn();

      const response = await check(cookie, "{ not json");

      expect(response.status).toBe(400);
      expect(response.headers.get("Content-Type")).toBe(problemContentType);
    });
  });

  describe("the origin check", () => {
    test.each(["cross-site", "same-site"])(
      "refuses a %s request with 403 before the handler",
      async (site) => {
        const cookie = await signIn();

        const response = await check(
          cookie,
          JSON.stringify({ code: postSlackMessage }),
          { "Sec-Fetch-Site": site },
        );

        expect(response.status).toBe(403);
        expect(response.headers.get("Content-Type")).toBe(problemContentType);
        expect(await response.text()).not.toContain("post_slack_message");
      },
    );

    test("refuses a request with no Sec-Fetch-Site header", async () => {
      const cookie = await signIn();

      const response = await exports.default.fetch(
        "http://localhost/api/checks",
        {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ code: postSlackMessage }),
        },
      );

      expect(response.status).toBe(403);
    });
  });

  describe("logging", () => {
    const marker = "NEVER_LOGGED_8c1f";
    const codeWithMarker = (code: string) =>
      `${code}# ${marker}\nTOKEN = "${marker}"\n`;

    test("logs no code during a refusal", async () => {
      const cookie = await signIn();
      const logged = captureLogs();

      const response = await checkCode(
        cookie,
        codeWithMarker(lines("from temporalio import activity", "")),
      );

      expect(response.status).toBe(422);
      expect(await response.text()).not.toContain(marker);
      expect(logged()).not.toContain(marker);
    });

    test("logs no code when a detector fails with a 500", async () => {
      // A detector that fails with the code in its message, to show the code goes no further.
      const failing: CheckedSdk = {
        sdk: "Python",
        recognition: {
          sdkMarkers: [pythonSdkImport],
          activityMarkers: [],
          shapeMarkers: [],
        },
        detector: {
          detect: (source) => {
            throw new Error(source.text);
          },
        },
        isStandardLibrary: () => false,
      };
      const app = createApp().route("/api/checks", createChecks([failing]));
      const cookie = await signIn();
      const logged = captureLogs();

      const response = await app.request(
        "/api/checks",
        checkRequest(
          cookie,
          JSON.stringify({ code: codeWithMarker(postSlackMessage) }),
        ),
        env,
      );

      expect(response.status).toBe(500);
      expect(response.headers.get("Content-Type")).toBe(problemContentType);
      expect(await response.text()).not.toContain(marker);
      expect(logged()).toContain("DetectorFailure");
      expect(logged()).not.toContain(marker);
    });
  });

  describe("storage", () => {
    test("writes nothing to D1 or R2", async () => {
      const cookie = await signIn();
      const rowsBefore = await readAllRows(env.DB);
      const objectsBefore = (await env.DOCUMENTS.list()).objects.length;

      expect((await checkCode(cookie, postSlackMessage)).status).toBe(200);
      expect((await checkCode(cookie, "x")).status).toBe(422);

      expect(await readAllRows(env.DB)).toEqual(rowsBefore);
      expect((await env.DOCUMENTS.list()).objects.length).toBe(objectsBefore);
    });
  });
});
