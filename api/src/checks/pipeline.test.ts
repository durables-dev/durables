import { afterEach, describe, expect, it, vi } from "vitest";
import type { Detector } from "./detector";
import type { AcceptedSdk, ActivityFacts } from "./facts";
import { checkCode, DetectorFailure } from "./pipeline";
import { refusalTypes } from "./refusals";
import { MAX_CODE_BYTES } from "./size-limit";
import { lineAt, type Source } from "./source";

const facts = (name: string, line = 1): ActivityFacts => ({
  activity: { name, line },
  input: "SlackMessage",
  output: "MessageRef",
  runsAs: "async",
  nonRetryableErrors: [{ line: 39 }],
  configurationRead: [{ name: "SLACK_TOKEN", line: 7 }],
  dependencies: [{ name: "httpx", line: 3 }],
  heartbeats: [{ line: 21 }],
});

/**
 * A stand-in for a real detector. Its SDK marker is `STUB_SDK`, its activity marker is
 * `STUB_ACTIVITY`, and it returns `activities` whatever the code.
 */
const stub = (
  activities: readonly ActivityFacts[],
  sdk: AcceptedSdk = "Python",
  tag = "STUB",
): Detector => ({
  sdk,
  sdkMarkers: [
    {
      name: `${tag}-sdk`,
      description: "Test marker.",
      regex: new RegExp(`${tag}_SDK`),
    },
  ],
  activityMarkers: [
    {
      name: `${tag}-activity`,
      description: "Test marker.",
      regex: new RegExp(`${tag}_ACTIVITY`),
    },
  ],
  detect: () => activities,
});

/** A detector that reports one activity per `STUB_ACTIVITY name` line, at that line. */
const lineCountingStub: Detector = {
  ...stub([]),
  detect: (source: Source) =>
    [...source.text.matchAll(/STUB_ACTIVITY (\w+)/g)].map((m) =>
      facts(m[1] ?? "", lineAt(source, m.index)),
    ),
};

const refusalOf = (code: string, detectors: readonly Detector[]) => {
  const outcome = checkCode(code, detectors);
  if (outcome.accepted) {
    throw new Error("Expected a refusal");
  }
  return outcome.refusal;
};

const javaActivity = [
  "package io.example;",
  "",
  "import io.temporal.activity.ActivityInterface;",
  "import io.temporal.activity.ActivityMethod;",
  "",
  "@ActivityInterface",
  "public interface Greeter {",
  "    @ActivityMethod",
  "    String greet(String name);",
  "}",
].join("\n");

const goActivity = [
  "package greeting",
  "",
  "import (",
  '\t"context"',
  "",
  '\t"go.temporal.io/sdk/activity"',
  ")",
  "",
  "func Greet(ctx context.Context, name string) (string, error) {",
  '\tactivity.GetLogger(ctx).Info("greeting")',
  '\treturn "Hello " + name, nil',
  "}",
].join("\n");

const phpActivity = [
  "<?php",
  "",
  "use Temporal\\Activity\\ActivityInterface;",
  "use Temporal\\Activity\\ActivityMethod;",
  "",
  "#[ActivityInterface]",
  "interface Greeter",
  "{",
  "    #[ActivityMethod]",
  "    public function greet(string $name): string;",
  "}",
].join("\n");

describe("checkCode", () => {
  describe("refusals", () => {
    it("refuses a file with the SDK marker but no activity as no activity", () => {
      expect(refusalOf("import STUB_SDK\n", [stub([])])).toEqual({
        type: refusalTypes.noActivity,
        status: 422,
        title: expect.any(String) as string,
      });
    });

    it("refuses a file with no Temporal markers as not a Temporal activity", () => {
      const code = "def add(a: int, b: int) -> int:\n    return a + b\n";
      expect(refusalOf(code, [stub([facts("add")])]).type).toBe(
        refusalTypes.notTemporalActivity,
      );
    });

    it.each([
      ["empty", ""],
      ["whitespace-only", "  \n\t\r\n   "],
    ])("refuses %s input as not a Temporal activity", (_, code: string) => {
      expect(refusalOf(code, [stub([facts("act")])]).type).toBe(
        refusalTypes.notTemporalActivity,
      );
    });

    it.each([
      ["Java", javaActivity],
      ["Go", goActivity],
      ["PHP", phpActivity],
    ] as const)(
      "refuses a %s Temporal activity, naming the SDK",
      (sdk, code) => {
        expect(refusalOf(code, [stub([facts("act")])])).toEqual({
          type: refusalTypes.unacceptedSdk,
          status: 422,
          title: expect.any(String) as string,
          sdk,
        });
      },
    );

    it("names the SDK for a Java file with the SDK import but no activity annotation", () => {
      const code = "import io.temporal.client.WorkflowClient;\n";
      expect(refusalOf(code, [])).toMatchObject({
        type: refusalTypes.unacceptedSdk,
        sdk: "Java",
      });
    });

    it.each([2, 3])(
      "refuses a file with %i activities, carrying the count",
      (count) => {
        const activities = Array.from({ length: count }, (_, i) =>
          facts(`act_${i}`),
        );
        expect(refusalOf("STUB_SDK\n", [stub(activities)])).toEqual({
          type: refusalTypes.multipleActivities,
          status: 422,
          title: expect.any(String) as string,
          count,
        });
      },
    );

    it("gives every refusal its own type", () => {
      const detectors = [stub([])];
      const types = [
        refusalOf("STUB_SDK", detectors).type,
        refusalOf("plain text", detectors).type,
        refusalOf(javaActivity, detectors).type,
        refusalOf("STUB_SDK", [stub([facts("a"), facts("b")])]).type,
        refusalOf("x".repeat(MAX_CODE_BYTES + 1), detectors).type,
      ];
      expect(new Set(types).size).toBe(types.length);
      expect(new Set(types)).toEqual(new Set(Object.values(refusalTypes)));
    });
  });

  describe("size limit", () => {
    const padTo = (prefix: string, bytes: number) =>
      prefix + " ".repeat(bytes - new TextEncoder().encode(prefix).byteLength);

    it("checks a file of exactly the limit", () => {
      const code = padTo("STUB_SDK\n", MAX_CODE_BYTES);
      expect(checkCode(code, [stub([facts("act")])]).accepted).toBe(true);
    });

    it("refuses a file one byte over the limit as too large", () => {
      const code = padTo("STUB_SDK\n", MAX_CODE_BYTES + 1);
      expect(refusalOf(code, [stub([facts("act")])])).toEqual({
        type: refusalTypes.codeTooLarge,
        status: 413,
        title: expect.any(String) as string,
        limitBytes: MAX_CODE_BYTES,
      });
    });

    it("counts multi-byte characters in bytes", () => {
      // "é" is two bytes of UTF-8, so this is limit + 1 bytes in fewer characters.
      const code = padTo("STUB_SDK\né", MAX_CODE_BYTES + 1);
      expect(code.length).toBeLessThanOrEqual(MAX_CODE_BYTES);
      expect(refusalOf(code, [stub([facts("act")])]).type).toBe(
        refusalTypes.codeTooLarge,
      );
    });
  });

  describe("choosing the SDK", () => {
    const python = stub([facts("py_act")], "Python", "PY");
    const typescript = stub([facts("tsAct")], "TypeScript", "TS");

    it("chooses the SDK with an activity marker when a file has markers for two", () => {
      const outcome = checkCode("PY_SDK\nTS_SDK\nTS_ACTIVITY\n", [
        python,
        typescript,
      ]);
      expect(outcome).toMatchObject({
        accepted: true,
        facts: { sdk: "TypeScript" },
      });
    });

    it("chooses an accepted SDK's activity over an unaccepted SDK's import", () => {
      const code = `PY_SDK\nPY_ACTIVITY\nimport io.temporal.client.WorkflowClient;\n`;
      expect(checkCode(code, [python])).toMatchObject({
        accepted: true,
        facts: { sdk: "Python" },
      });
    });

    it("names an unaccepted SDK whose activity marker is the only one", () => {
      expect(refusalOf(`PY_SDK\n${javaActivity}`, [python])).toMatchObject({
        type: refusalTypes.unacceptedSdk,
        sdk: "Java",
      });
    });

    it("refuses a file with markers for two SDKs and no activity marker as not a Temporal activity", () => {
      expect(refusalOf("PY_SDK\nTS_SDK\n", [python, typescript]).type).toBe(
        refusalTypes.notTemporalActivity,
      );
    });

    it("takes the earlier detector when two SDKs have activity markers", () => {
      const code = "PY_SDK\nPY_ACTIVITY\nTS_SDK\nTS_ACTIVITY\n";
      expect(checkCode(code, [python, typescript])).toMatchObject({
        accepted: true,
        facts: { sdk: "Python" },
      });
    });
  });

  describe("an accepted file", () => {
    it("passes the detector's result through unchanged, with its SDK", () => {
      const found = facts("post_slack_message", 25);
      expect(checkCode("STUB_SDK", [stub([found], ".NET")])).toEqual({
        accepted: true,
        facts: { sdk: ".NET", ...found },
      });
    });

    it("numbers lines the same for CRLF input as for LF input", () => {
      const lines = ["STUB_SDK", "", "STUB_ACTIVITY first", "x", "y"];
      const lf = checkCode(lines.join("\n"), [lineCountingStub]);
      const crlf = checkCode(lines.join("\r\n"), [lineCountingStub]);
      expect(lf).toMatchObject({ facts: { activity: { line: 3 } } });
      expect(crlf).toEqual(lf);
    });
  });

  describe("logging", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const captureConsole = () => {
      const methods = ["log", "info", "debug", "warn", "error"] as const;
      return methods.map((method) =>
        vi.spyOn(console, method).mockImplementation(() => undefined),
      );
    };

    const secret = "SECRET_CODE_7f3a";

    it.each([
      ["no activity", `STUB_SDK # ${secret}`, [stub([])]],
      ["not a Temporal activity", `print("${secret}")`, [stub([])]],
      ["unaccepted SDK", `${javaActivity}\n// ${secret}`, [stub([])]],
      [
        "multiple activities",
        `STUB_SDK ${secret}`,
        [stub([facts("a"), facts("b")])],
      ],
      [
        "too large",
        `${secret}${"x".repeat(MAX_CODE_BYTES)}`,
        [stub([facts("a")])],
      ],
    ] as const)(
      "logs no code during a %s refusal",
      (_, code, detectors: readonly Detector[]) => {
        const spies = captureConsole();
        const outcome = checkCode(code, detectors);
        expect(outcome.accepted).toBe(false);
        const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
        expect(logged).not.toContain(secret);
        expect(JSON.stringify(outcome)).not.toContain(secret);
      },
    );

    it("throws a detector failure that carries no code", () => {
      const throwing: Detector = {
        ...stub([]),
        detect: (source) => {
          throw new Error(`could not parse ${source.text}`);
        },
      };
      const spies = captureConsole();
      let thrown: unknown;
      try {
        checkCode(`STUB_SDK ${secret}`, [throwing]);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(DetectorFailure);
      const failure = thrown as DetectorFailure;
      expect(failure.message).toBe("The Python detector failed with Error");
      expect(failure.stack).not.toContain(secret);
      expect(failure.cause).toBeUndefined();
      expect(
        JSON.stringify(spies.flatMap((spy) => spy.mock.calls)),
      ).not.toContain(secret);
    });
  });
});
