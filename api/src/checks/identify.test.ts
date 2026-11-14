import { describe, expect, it } from "vitest";
import { registeredSdks } from "../sdks/registry";
import { identifySdk, type Recognisable } from "./identify";
import { javaActivityAnnotation } from "./java-detector";
import { matchesAny, type Pattern } from "./pattern";
import { toSource } from "./source";
import { phpActivityAttribute, unacceptedSdks } from "./unaccepted-sdks";

const marker = (name: string): Pattern => ({
  name,
  description: "Test marker.",
  regex: new RegExp(name.toUpperCase().replace(/-/g, "_")),
});

/** A stand-in SDK whose markers are `<TAG>_SDK` and `<TAG>_ACTIVITY`, and its shape `<TAG>_SHAPE`. */
const stub = (sdk: string, tag: string): Recognisable<string> => ({
  sdk,
  recognition: {
    sdkMarkers: [marker(`${tag}-sdk`)],
    activityMarkers: [marker(`${tag}-activity`)],
    shapeMarkers: [marker(`${tag}-shape`)],
  },
});

const alpha = stub("Alpha", "al");
const beta = stub("Beta", "be");
const gamma = stub("Gamma", "ga");

/** Identification over every SDK the checks pipeline knows. */
const identify = (code: string) =>
  identifySdk(toSource(code).text, [...registeredSdks, ...unacceptedSdks]);

const lines = (...code: string[]) => code.join("\n");

const pythonActivity = lines(
  "from temporalio import activity",
  "",
  "@activity.defn",
  "async def greet(name: str) -> str:",
  '    return f"Hello {name}"',
);

const typescriptActivity = lines(
  'import { heartbeat } from "@temporalio/activity";',
  "",
  "export async function greet(name: string): Promise<string> {",
  "  heartbeat();",
  "  return `Hello ${name}`;",
  "}",
);

const dotnetActivity = lines(
  "using Temporalio.Activities;",
  "",
  "public class Greetings",
  "{",
  "    [Activity]",
  '    public Task<string> GreetAsync(string name) => Task.FromResult($"Hello {name}");',
  "}",
);

const goActivity = lines(
  "package greeting",
  "",
  "import (",
  '    "context"',
  "",
  '    "go.temporal.io/sdk/activity"',
  ")",
  "",
  "func Greet(ctx context.Context, name string) (string, error) {",
  '    activity.GetLogger(ctx).Info("greeting")',
  '    return "Hello " + name, nil',
  "}",
);

const javaActivity = lines(
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
);

const phpActivity = lines(
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
);

describe("identifySdk", () => {
  describe("an identified SDK", () => {
    it("is the only SDK whose SDK marker matches", () => {
      expect(identifySdk("AL_SDK", [alpha, beta])).toEqual({
        outcome: "identified",
        sdk: "Alpha",
        tier: "detected",
        matchedPatterns: ["al-sdk"],
      });
    });

    it("is the one SDK with an activity marker when several have SDK markers", () => {
      expect(identifySdk("AL_SDK BE_SDK BE_ACTIVITY", [alpha, beta])).toEqual({
        outcome: "identified",
        sdk: "Beta",
        tier: "detected",
        matchedPatterns: ["be-sdk", "be-activity"],
      });
    });

    it("names each matched pattern once when a pattern is both an SDK and an activity marker", () => {
      const both = marker("de-both");
      const delta: Recognisable<string> = {
        sdk: "Delta",
        recognition: {
          sdkMarkers: [both],
          activityMarkers: [both],
          shapeMarkers: [],
        },
      };
      expect(identifySdk("DE_BOTH", [delta])).toMatchObject({
        sdk: "Delta",
        matchedPatterns: ["de-both"],
      });
    });

    it.each([
      [
        "Go",
        goActivity,
        ["go-sdk-import", "go-activity-import", "go-activity-function"],
      ],
      [
        "Python",
        pythonActivity,
        ["python-sdk-import", "python-activity-decorator"],
      ],
      [
        "TypeScript",
        typescriptActivity,
        ["typescript-sdk-import", "typescript-exported-async-function"],
      ],
      [
        ".NET",
        dotnetActivity,
        ["dotnet-sdk-using", "dotnet-activity-attribute"],
      ],
    ])(
      "returns %s, its tier and the matched patterns for a registry SDK",
      (sdk, code, matchedPatterns) => {
        expect(identify(code)).toEqual({
          outcome: "identified",
          sdk,
          tier: "detected",
          matchedPatterns,
        });
      },
    );
  });

  describe("an inferred SDK", () => {
    it("is the only SDK whose shape marker matches when no SDK marker does", () => {
      expect(identifySdk("AL_SHAPE", [alpha, beta])).toEqual({
        outcome: "identified",
        sdk: "Alpha",
        tier: "inferred",
        matchedPatterns: ["al-shape"],
      });
    });

    it("is never chosen over an SDK whose marker matches", () => {
      expect(identifySdk("AL_SHAPE BE_SDK", [alpha, beta])).toEqual({
        outcome: "identified",
        sdk: "Beta",
        tier: "detected",
        matchedPatterns: ["be-sdk"],
      });
    });

    it("is detected, not inferred, when its own marker and shape both match", () => {
      expect(identifySdk("AL_SDK AL_SHAPE", [alpha, beta])).toMatchObject({
        sdk: "Alpha",
        tier: "detected",
      });
    });

    it("is ambiguous when two SDKs' shape markers match, in either order", () => {
      const expected = { outcome: "ambiguous", sdks: ["Alpha", "Beta"] };
      expect(identifySdk("AL_SHAPE BE_SHAPE", [alpha, beta])).toEqual(expected);
      expect(identifySdk("AL_SHAPE BE_SHAPE", [beta, alpha])).toEqual(expected);
    });

    it("is never inferred for Python, TypeScript or .NET, whose detection is unchanged", () => {
      const unchanged = registeredSdks.filter(({ sdk }) =>
        ["Python", "TypeScript", ".NET"].includes(sdk),
      );
      expect(unchanged).toHaveLength(3);
      for (const { recognition } of unchanged) {
        expect(recognition.shapeMarkers).toEqual([]);
      }
    });

    it("is inferred as Go for a Go activity with no Temporal marker", () => {
      expect(
        identify(
          lines(
            "package greeting",
            'import "context"',
            "func Greet(ctx context.Context, name string) (string, error) {",
            "\treturn name, nil",
            "}",
          ),
        ),
      ).toEqual({
        outcome: "identified",
        sdk: "Go",
        tier: "inferred",
        matchedPatterns: ["go-activity-function", "go-activity-shape"],
      });
    });

    it("is inferred as Go for Temporal's quickstart activity with no context either", () => {
      expect(
        identify(
          lines(
            "package app",
            "",
            'import "fmt"',
            "",
            "func ComposeGreeting(name string) (string, error) {",
            '    return fmt.Sprintf("Hello %s!", name), nil',
            "}",
          ),
        ),
      ).toEqual({
        outcome: "identified",
        sdk: "Go",
        tier: "inferred",
        matchedPatterns: ["go-activity-shape"],
      });
    });

    it("is inferred for Java from an implementing class with no Temporal import", () => {
      const implementation = lines(
        "public class GreeterImpl implements Greeter {",
        "    public String greet(String name) {",
        '        return "Hello " + name;',
        "    }",
        "}",
      );
      expect(identify(implementation)).toEqual({
        outcome: "identified",
        sdk: "Java",
        tier: "inferred",
        matchedPatterns: ["java-implementation-class"],
      });
    });
  });

  describe("an ambiguous paste", () => {
    it("is ambiguous when two SDKs have activity markers, in either order", () => {
      const code = "AL_SDK AL_ACTIVITY BE_SDK BE_ACTIVITY";
      const expected = { outcome: "ambiguous", sdks: ["Alpha", "Beta"] };
      expect(identifySdk(code, [alpha, beta])).toEqual(expected);
      expect(identifySdk(code, [beta, alpha])).toEqual(expected);
    });

    it("is ambiguous when two SDKs match and neither has an activity marker, in either order", () => {
      const expected = { outcome: "ambiguous", sdks: ["Alpha", "Beta"] };
      expect(identifySdk("AL_SDK BE_SDK", [alpha, beta])).toEqual(expected);
      expect(identifySdk("AL_SDK BE_SDK", [beta, alpha])).toEqual(expected);
    });

    it("names only the SDKs with activity markers when those tie", () => {
      const code = "AL_SDK AL_ACTIVITY BE_SDK GA_SDK GA_ACTIVITY";
      for (const order of [
        [alpha, beta, gamma],
        [gamma, beta, alpha],
        [beta, gamma, alpha],
      ]) {
        expect(identifySdk(code, order)).toEqual({
          outcome: "ambiguous",
          sdks: ["Alpha", "Gamma"],
        });
      }
    });

    it("is ambiguous for a TypeScript activity carrying a Python activity", () => {
      const code = lines(
        "from temporalio import activity",
        "@activity.defn",
        typescriptActivity,
      );
      expect(identify(code)).toEqual({
        outcome: "ambiguous",
        sdks: ["Python", "TypeScript"],
      });
    });
  });

  describe("a paste that is not identified", () => {
    it("is not identified when no SDK marker matches", () => {
      expect(identifySdk("AL_ACTIVITY", [alpha, beta])).toEqual({
        outcome: "not-identified",
      });
    });

    it("is not identified with no SDKs to try", () => {
      expect(identifySdk("AL_SDK", [])).toEqual({ outcome: "not-identified" });
    });

    it.each([
      [
        "prose",
        "This activity posts a message to Slack and returns the message's ID.",
      ],
      [
        "a package.json",
        lines(
          "{",
          '  "name": "greeter",',
          '  "dependencies": { "@temporalio/activity": "^1.11.0" }',
          "}",
        ),
      ],
      [
        "a YAML config",
        lines(
          'version: "3"',
          "server:",
          "  command: php worker.php",
          "temporal:",
          "  address: localhost:7233",
        ),
      ],
      [
        "a plain Python function",
        lines("def add(a: int, b: int) -> int:", "    return a + b"),
      ],
      [
        "a TypeScript function that isn't exported",
        "async function greet(name: string): Promise<string> { return name; }",
      ],
      [
        "a Java class with no Temporal import",
        "public class Greeter { public String greet(String n) { return n; } }",
      ],
      [
        "a Go function that is neither exported nor takes a context",
        lines(
          "package greeting",
          "func add(a, b int) (int, error) {",
          "\treturn a + b, nil",
          "}",
        ),
      ],
      [
        "a shell script",
        lines("#!/bin/sh", "set -e", "temporal server start-dev"),
      ],
    ])("is not identified for %s", (_, code) => {
      expect(identify(code)).toEqual({ outcome: "not-identified" });
    });
  });

  describe("Go beside the other SDKs", () => {
    const samples = [
      ["Go", goActivity],
      ["Python", pythonActivity],
      ["TypeScript", typescriptActivity],
      [".NET", dotnetActivity],
      ["Java", javaActivity],
      ["PHP", phpActivity],
    ] as const;

    it.each(samples)(
      "identifies the %s sample as itself and nothing else",
      (sdk, code) => {
        expect(identify(code)).toMatchObject({ outcome: "identified", sdk });
      },
    );

    it("matches no Go pattern in the other SDKs' samples", () => {
      const go = registeredSdks.find(({ sdk }) => sdk === "Go");
      if (go === undefined) {
        throw new Error("The registry has no Go entry.");
      }
      const { sdkMarkers, activityMarkers, shapeMarkers } = go.recognition;
      for (const [sdk, code] of samples) {
        if (sdk !== "Go") {
          expect(
            matchesAny(
              [...sdkMarkers, ...activityMarkers, ...shapeMarkers],
              code,
            ),
          ).toBe(false);
        }
      }
    });

    it("matches no other SDK's pattern in the Go sample", () => {
      for (const { sdk, recognition } of [
        ...registeredSdks,
        ...unacceptedSdks,
      ]) {
        if (sdk !== "Go") {
          expect(
            matchesAny(
              [
                ...recognition.sdkMarkers,
                ...recognition.activityMarkers,
                ...recognition.shapeMarkers,
              ],
              goActivity,
            ),
          ).toBe(false);
        }
      }
    });

    it.each([
      [
        "a Java implementation with no annotation",
        lines(
          "public class GreeterImpl implements Greeter {",
          "    public String greet(String name) { return name; }",
          "}",
        ),
      ],
      [
        "a PHP class with no attribute",
        lines(
          "<?php",
          "class Greeter",
          "{",
          "    public function Greet(string $name): string { return $name; }",
          "}",
        ),
      ],
    ])("does not infer Go for %s", (_, code) => {
      // Java now infers its own implementation classes, so only the Go answer is ruled out.
      expect(identify(code)).not.toMatchObject({ sdk: "Go" });
    });

    it("keeps a Go file that imports the SDK as Go when it also mentions a Java annotation in a comment", () => {
      const code = lines(goActivity, "// Like Java's @ActivityInterface.");
      expect(identify(code)).toMatchObject({
        outcome: "identified",
        sdk: "Go",
      });
    });
  });

  describe("Java and PHP", () => {
    it("share an activity marker shape, so only the SDK markers keep them apart", () => {
      // PHP's pattern takes Java's annotation, and Java's takes PHP's docblock annotation.
      expect(phpActivityAttribute.regex.test(javaActivity)).toBe(true);
      expect(
        javaActivityAnnotation.regex.test(
          " * @ActivityInterface\ninterface Greeter",
        ),
      ).toBe(true);
    });

    it("identifies a PHP activity with a docblock annotation as PHP", () => {
      const docblock = lines(
        "<?php",
        "",
        "use Temporal\\Activity\\ActivityInterface;",
        "",
        "/** @ActivityInterface */",
        "interface Greeter",
        "{",
        "    /** @ActivityMethod */",
        "    public function greet(string $name): string;",
        "}",
      );
      expect(identify(docblock)).toMatchObject({
        outcome: "identified",
        sdk: "PHP",
      });
    });

    it("identifies a Java activity as Java", () => {
      expect(identify(javaActivity)).toEqual({
        outcome: "identified",
        sdk: "Java",
        tier: "detected",
        matchedPatterns: ["java-sdk-import", "java-activity-annotation"],
      });
    });

    it("identifies a PHP activity with #[ActivityInterface] as PHP", () => {
      expect(identify(phpActivity)).toEqual({
        outcome: "identified",
        sdk: "PHP",
        tier: "detected",
        matchedPatterns: ["php-sdk-use", "php-activity-attribute"],
      });
    });
  });
});
