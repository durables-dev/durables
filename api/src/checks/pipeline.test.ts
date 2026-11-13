import { afterEach, describe, expect, it, vi } from "vitest";
import { registeredSdks } from "../sdks/registry";
import {
  type AcceptedSdk,
  type ActivityFacts,
  factNames,
  type Provenance,
  type Tier,
} from "./facts";
import { type CheckedSdk, checkCode, DetectorFailure } from "./pipeline";
import { CheckRefusal, refusalTypes } from "./refusals";
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

/** Provenance with the SDK established as `sdk` and every other fact detected. */
const provenance = (sdk: Tier): Provenance => ({
  sdk,
  activity: "detected",
  inputOutput: "detected",
  runsAs: "detected",
  nonRetryableErrors: "detected",
  configurationRead: "detected",
  dependencies: "detected",
  heartbeats: "detected",
});

/**
 * A stand-in for a real SDK. Its SDK marker is `STUB_SDK`, its activity marker is
 * `STUB_ACTIVITY`, its shape marker is `STUB_SHAPE`, and its detector returns `activities`
 * whatever the code.
 */
const stub = (
  activities: readonly ActivityFacts[],
  sdk: AcceptedSdk = "Python",
  tag = "STUB",
): CheckedSdk => ({
  sdk,
  recognition: {
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
    shapeMarkers: [
      {
        name: `${tag}-shape`,
        description: "Test marker.",
        regex: new RegExp(`${tag}_SHAPE`),
      },
    ],
  },
  detector: { detect: () => activities },
  isStandardLibrary: () => false,
});

/** An SDK whose detector reports one activity per `STUB_ACTIVITY name` line, at that line. */
const lineCountingStub: CheckedSdk = {
  ...stub([]),
  detector: {
    detect: (source: Source) =>
      [...source.text.matchAll(/STUB_ACTIVITY (\w+)/g)].map((m) =>
        facts(m[1] ?? "", lineAt(source, m.index)),
      ),
  },
};

/** The refusal checkCode throws, so a test can assert on it. */
const thrownBy = (
  code: string,
  checkedSdks: readonly CheckedSdk[],
  declared?: AcceptedSdk,
) => {
  try {
    checkCode(code, checkedSdks, declared);
  } catch (error) {
    return error;
  }
  throw new Error("Expected a refusal");
};

/** The Problem Details body of the refusal checkCode throws. */
const refusalOf = (
  code: string,
  checkedSdks: readonly CheckedSdk[],
  declared?: AcceptedSdk,
) => {
  const error = thrownBy(code, checkedSdks, declared);
  expect(error).toBeInstanceOf(CheckRefusal);
  return (error as CheckRefusal).problem;
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
    it("refuses a file with the SDK marker but no activity as no activity, naming the SDK", () => {
      expect(refusalOf("import STUB_SDK\n", [stub([])])).toEqual({
        type: refusalTypes.noActivity,
        status: 422,
        title: expect.any(String) as string,
        detail: expect.stringContaining("Python") as string,
        sdk: "Python",
      });
    });

    it("asks for the SDK to be chosen for a file with no Temporal markers", () => {
      const code = "def add(a: int, b: int) -> int:\n    return a + b\n";
      expect(refusalOf(code, [stub([facts("add")])])).toEqual({
        type: refusalTypes.sdkChoiceNeeded,
        status: 422,
        title: expect.any(String) as string,
        detail: expect.any(String) as string,
        reason: "not-identified",
      });
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
      ["empty", ""],
      ["whitespace-only", "  \n\t\r\n   "],
    ])("refuses %s input before identification runs", (_, code: string) => {
      const matchesAnything = {
        name: "anything",
        description: "Test marker that matches any text.",
        regex: /(?:)/,
      };
      const everywhere: CheckedSdk = {
        ...stub([facts("act")]),
        recognition: {
          sdkMarkers: [matchesAnything],
          activityMarkers: [matchesAnything],
          shapeMarkers: [matchesAnything],
        },
      };
      expect(refusalOf(code, [everywhere]).type).toBe(
        refusalTypes.notTemporalActivity,
      );
    });

    it.each([
      ["Java", javaActivity],
      ["Go", goActivity],
    ] as const)(
      "refuses a %s Temporal activity, naming the SDK",
      (sdk, code) => {
        expect(refusalOf(code, [stub([facts("act")])])).toEqual({
          type: refusalTypes.unacceptedSdk,
          status: 422,
          title: expect.any(String) as string,
          detail: expect.stringContaining(sdk) as string,
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
          detail: expect.stringContaining(String(count)) as string,
          count,
        });
      },
    );

    it("gives every refusal its own type", () => {
      const detectors = [stub([])];
      const types = [
        refusalOf("STUB_SDK", detectors).type,
        refusalOf("", detectors).type,
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
      expect(checkCode(code, [stub([facts("act")])]).activity.name).toBe("act");
    });

    it("refuses a file one byte over the limit as too large", () => {
      const code = padTo("STUB_SDK\n", MAX_CODE_BYTES + 1);
      expect(refusalOf(code, [stub([facts("act")])])).toEqual({
        type: refusalTypes.codeTooLarge,
        status: 413,
        title: expect.any(String) as string,
        detail: expect.any(String) as string,
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
      const found = checkCode("PY_SDK\nTS_SDK\nTS_ACTIVITY\n", [
        python,
        typescript,
      ]);
      expect(found.sdk).toBe("TypeScript");
    });

    it("chooses an accepted SDK's activity over an unaccepted SDK's import", () => {
      const code = `PY_SDK\nPY_ACTIVITY\nimport io.temporal.client.WorkflowClient;\n`;
      expect(checkCode(code, [python]).sdk).toBe("Python");
    });

    it("names an unaccepted SDK whose activity marker is the only one", () => {
      expect(refusalOf(`PY_SDK\n${javaActivity}`, [python])).toMatchObject({
        type: refusalTypes.unacceptedSdk,
        sdk: "Java",
      });
    });

    it("asks for the SDK to be chosen for a file with markers for two SDKs and no activity marker", () => {
      expect(refusalOf("PY_SDK\nTS_SDK\n", [python, typescript])).toMatchObject(
        { type: refusalTypes.sdkChoiceNeeded, reason: "ambiguous" },
      );
    });

    it("asks for the SDK to be chosen for a file where two SDKs have activity markers, in either order", () => {
      const code = "PY_SDK\nPY_ACTIVITY\nTS_SDK\nTS_ACTIVITY\n";
      const expected = {
        type: refusalTypes.sdkChoiceNeeded,
        reason: "ambiguous",
      };
      expect(refusalOf(code, [python, typescript])).toMatchObject(expected);
      expect(refusalOf(code, [typescript, python])).toMatchObject(expected);
    });

    it("asks for the SDK to be chosen when two SDKs' shapes match and no marker does", () => {
      expect(
        refusalOf("PY_SHAPE\nTS_SHAPE\n", [python, typescript]),
      ).toMatchObject({
        type: refusalTypes.sdkChoiceNeeded,
        reason: "ambiguous",
      });
    });
  });

  describe("an accepted file", () => {
    it("passes the SDK's own standard-library check to its detector", () => {
      const received: unknown[] = [];
      const isStandardLibrary = (name: string) => name === "os";
      const recording: CheckedSdk = {
        ...stub([], ".NET"),
        detector: {
          detect: (_source, check) => {
            received.push(check);
            return [facts("post_slack_message")];
          },
        },
        isStandardLibrary,
      };
      const other: CheckedSdk = {
        ...stub([], "TypeScript", "OTHER"),
        isStandardLibrary: () => true,
      };
      checkCode("STUB_SDK", [other, recording]);
      expect(received).toEqual([isStandardLibrary]);
      expect(received[0]).toBe(isStandardLibrary);
    });

    it("passes the detector's result through unchanged, with its SDK and provenance", () => {
      const found = facts("post_slack_message", 25);
      expect(checkCode("STUB_SDK", [stub([found], ".NET")])).toEqual({
        sdk: ".NET",
        ...found,
        provenance: provenance("detected"),
      });
    });

    it("numbers lines the same for CRLF input as for LF input", () => {
      const lines = ["STUB_SDK", "", "STUB_ACTIVITY first", "x", "y"];
      const lf = checkCode(lines.join("\n"), [lineCountingStub]);
      const crlf = checkCode(lines.join("\r\n"), [lineCountingStub]);
      expect(lf.activity.line).toBe(3);
      expect(crlf).toEqual(lf);
    });
  });

  describe("fact provenance", () => {
    it("records the SDK as detected when its marker matches, and every other fact as detected", () => {
      const found = checkCode("STUB_SDK", [stub([facts("act")])]);
      expect(found.provenance).toEqual(provenance("detected"));
    });

    it("records the SDK as inferred when only its shape matches", () => {
      const found = checkCode("STUB_SHAPE", [stub([facts("act")])]);
      expect(found.provenance).toEqual(provenance("inferred"));
    });

    it("records a tier for each of the eight facts", () => {
      const found = checkCode("STUB_SDK", [stub([facts("act")])]);
      expect(Object.keys(found.provenance).sort()).toEqual(
        [...factNames].sort(),
      );
      expect(factNames).toHaveLength(8);
    });

    const samples: Record<AcceptedSdk, string> = {
      Python: [
        "from temporalio import activity",
        "",
        "@activity.defn",
        "async def greet(name: str) -> str:",
        '    return f"Hello {name}"',
      ].join("\n"),
      TypeScript: [
        'import { heartbeat } from "@temporalio/activity";',
        "",
        "export async function greet(name: string): Promise<string> {",
        "  heartbeat();",
        "  return `Hello ${name}`;",
        "}",
      ].join("\n"),
      ".NET": [
        "using Temporalio.Activities;",
        "",
        "public class Greetings",
        "{",
        "    [Activity]",
        '    public Task<string> GreetAsync(string name) => Task.FromResult($"Hello {name}");',
        "}",
      ].join("\n"),
      PHP: phpActivity,
    };

    it.each(Object.entries(samples))(
      "keeps the %s facts' shape and adds a detected tier for each fact",
      (sdk, code) => {
        const found = checkCode(code, registeredSdks);
        const { provenance: tiers, ...values } = found;
        expect(Object.keys(values).sort()).toEqual(
          [
            "sdk",
            "activity",
            "input",
            "output",
            "runsAs",
            "nonRetryableErrors",
            "configurationRead",
            "dependencies",
            "heartbeats",
          ].sort(),
        );
        expect(found.sdk).toBe(sdk);
        expect(tiers).toEqual(provenance("detected"));
      },
    );
  });

  describe("a declared SDK", () => {
    const python = stub([facts("py_act")], "Python", "PY");
    const typescript = stub([facts("tsAct")], "TypeScript", "TS");

    it("takes the facts from the declared SDK's detector and records the SDK as declared", () => {
      expect(checkCode("PY_SHAPE", [python, typescript], "TypeScript")).toEqual(
        {
          sdk: "TypeScript",
          ...facts("tsAct"),
          provenance: provenance("declared"),
        },
      );
    });

    it("runs the declared SDK's detector on code that matches no SDK at all", () => {
      expect(checkCode("plain text", [python], "Python")).toMatchObject({
        sdk: "Python",
        activity: { name: "py_act" },
        provenance: { sdk: "declared" },
      });
    });

    it("is used over an SDK the code's markers identify", () => {
      const found = checkCode(
        "PY_SDK\nPY_ACTIVITY\n",
        [python, typescript],
        "TypeScript",
      );
      expect(found.sdk).toBe("TypeScript");
      expect(found.activity.name).toBe("tsAct");
    });

    it("refuses as no activity, naming the declared SDK, when its detector finds none", () => {
      expect(refusalOf("STUB_SDK", [stub([], ".NET")], ".NET")).toEqual({
        type: refusalTypes.noActivity,
        status: 422,
        title: expect.any(String) as string,
        detail: expect.stringContaining(".NET") as string,
        sdk: ".NET",
      });
    });

    it("refuses as no activity when another SDK's marker identifies the code but the declared detector finds none", () => {
      const empty = stub([], "TypeScript", "TS");
      expect(
        refusalOf("PY_SDK\nPY_ACTIVITY\n", [python, empty], "TypeScript"),
      ).toMatchObject({ type: refusalTypes.noActivity, sdk: "TypeScript" });
    });

    it("refuses as no activity, not as an unaccepted SDK, for a Java activity declared as Python", () => {
      const empty = stub([], "Python", "PY");
      expect(refusalOf(javaActivity, [empty], "Python")).toMatchObject({
        type: refusalTypes.noActivity,
        sdk: "Python",
      });
    });

    it("never asks for the SDK to be chosen", () => {
      expect(() =>
        checkCode("PY_SDK\nTS_SDK\n", [python, typescript], "Python"),
      ).not.toThrow();
    });

    it("still refuses a file with more than one activity", () => {
      expect(
        refusalOf("x", [stub([facts("a"), facts("b")])], "Python"),
      ).toMatchObject({ type: refusalTypes.multipleActivities, count: 2 });
    });

    it.each([
      ["empty", "", refusalTypes.notTemporalActivity],
      ["too large", "x".repeat(MAX_CODE_BYTES + 1), refusalTypes.codeTooLarge],
    ])("still refuses %s code first", (_, code, type) => {
      expect(refusalOf(code, [python], "Python").type).toBe(type);
    });

    it("passes the declared SDK's own standard-library check to its detector", () => {
      const isStandardLibrary = (name: string) => name === "fmt";
      const received: unknown[] = [];
      const recording: CheckedSdk = {
        ...stub([], "TypeScript", "TS"),
        detector: {
          detect: (_source, check) => {
            received.push(check);
            return [facts("tsAct")];
          },
        },
        isStandardLibrary,
      };
      checkCode("PY_SDK", [python, recording], "TypeScript");
      expect(received).toEqual([isStandardLibrary]);
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
      ["SDK choice needed", `print("${secret}")`, [stub([])]],
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
      (_, code, checkedSdks: readonly CheckedSdk[]) => {
        const spies = captureConsole();
        const refusal = thrownBy(code, checkedSdks);
        expect(refusal).toBeInstanceOf(CheckRefusal);
        const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
        expect(logged).not.toContain(secret);
        const { message, stack, problem } = refusal as CheckRefusal;
        expect(message).not.toContain(secret);
        expect(stack).not.toContain(secret);
        expect(JSON.stringify(problem)).not.toContain(secret);
      },
    );

    it("throws a detector failure that carries no code", () => {
      const throwing: CheckedSdk = {
        ...stub([]),
        detector: {
          detect: (source) => {
            throw new Error(`could not parse ${source.text}`);
          },
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
