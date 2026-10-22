import type { ProblemDetails } from "@/lib/problem";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  checkingText,
  checkLine,
  failedText,
  isFileRefusal,
  refusalTypes,
  type CheckState,
} from "./check-line";
import type { CheckedFacts, CheckResult } from "./check-result";
import { acceptedCheck, acceptedFacts } from "./test-drafts";

const idle: CheckState = {
  check: undefined,
  checking: false,
  failure: undefined,
};

function facts(sdk: CheckedFacts["sdk"], name: string): CheckedFacts {
  return { ...acceptedFacts, sdk, activity: { name, line: 4 } };
}

function refused(problem: Record<string, unknown>): CheckResult {
  return {
    outcome: "refused",
    problem: { title: "Refused", status: 422, ...problem } as Extract<
      CheckResult,
      { outcome: "refused" }
    >["problem"],
  };
}

function lineFor(problem: Record<string, unknown>) {
  return checkLine({ ...idle, check: refused(problem) });
}

describe("the Found line", () => {
  test.each([
    ["Python", "post_slack_message"],
    ["TypeScript", "postSlackMessage"],
    [".NET", "PostSlackMessage"],
  ] as const)("names a %s activity and its SDK", (sdk, name) => {
    expect(
      checkLine({
        ...idle,
        check: { outcome: "accepted", facts: facts(sdk, name) },
      }),
    ).toMatchObject({
      kind: "found",
      text: `✓ Found ${name} (${sdk}). Next, check what we detected.`,
    });
  });
});

describe("while a check runs", () => {
  test("says Checking…, over any earlier result for the same code", () => {
    expect(checkLine({ ...idle, checking: true })).toEqual({
      kind: "checking",
      text: checkingText,
    });
    expect(
      checkLine({ check: acceptedCheck, checking: true, failure: undefined }),
    ).toMatchObject({ kind: "checking" });
  });
});

describe("refusals", () => {
  test.each([
    [
      refusalTypes.noActivity,
      {},
      "Found the SDK but no activity function with typed input and output.",
    ],
    [
      refusalTypes.notTemporalActivity,
      {},
      "This doesn't look like a Python, TypeScript or .NET Temporal activity.",
    ],
    [
      refusalTypes.unacceptedSdk,
      { sdk: "Java" },
      "Durables accepts Python, TypeScript and .NET activities. This file looks like a Java activity.",
    ],
    [
      refusalTypes.multipleActivities,
      { count: 2 },
      "This file has 2 activities. Durables publishes one activity per file. Paste a file with only the one you want to share.",
    ],
  ])("%s shows its own wording", (type, extensions, text) => {
    expect(lineFor({ type, ...extensions })).toEqual({ kind: "refused", text });
  });

  test.each(["Java", "Go", "PHP"])(
    "the unaccepted-SDK message names %s",
    (sdk) => {
      expect(lineFor({ type: refusalTypes.unacceptedSdk, sdk })).toMatchObject({
        text: `Durables accepts Python, TypeScript and .NET activities. This file looks like a ${sdk} activity.`,
      });
    },
  );

  test("the multi-activity message carries the count", () => {
    const line = lineFor({ type: refusalTypes.multipleActivities, count: 5 });
    expect(line.kind).toBe("refused");
    expect("text" in line ? line.text : "").toMatch(
      /^This file has 5 activities\./,
    );
  });

  test("an over-size file shows the size limit", () => {
    expect(
      lineFor({
        type: refusalTypes.codeTooLarge,
        status: 413,
        limitBytes: 102400,
      }),
    ).toEqual({
      kind: "refused",
      text: "This file is too large to check. The limit is 100 KB.",
    });
  });

  test("the message is chosen by the type; other title and detail text change nothing", () => {
    const plain = lineFor({ type: refusalTypes.unacceptedSdk, sdk: "Go" });
    const reworded = lineFor({
      type: refusalTypes.unacceptedSdk,
      sdk: "Go",
      title: "Not a Temporal activity",
      detail: "Found the SDK but no activity function.",
    });
    expect(reworded).toEqual(plain);

    // A message that names another refusal does not make it that refusal.
    expect(
      lineFor({
        type: refusalTypes.noActivity,
        title: "More than one activity",
        detail: "This file has 3 activities.",
      }),
    ).toMatchObject({
      text: "Found the SDK but no activity function with typed input and output.",
    });
  });

  test("a refusal missing what its message needs is a failure", () => {
    expect(lineFor({ type: refusalTypes.unacceptedSdk })).toEqual({
      kind: "failed",
      text: failedText,
    });
    expect(
      lineFor({ type: refusalTypes.multipleActivities, count: 1 }),
    ).toEqual({ kind: "failed", text: failedText });
    expect(lineFor({ type: "https://durables.dev/problems/unknown" })).toEqual({
      kind: "failed",
      text: failedText,
    });
  });
});

describe("failures that say nothing about the file", () => {
  const failure = (status: number, type = "about:blank"): ProblemDetails => ({
    type,
    title: "Error",
    status,
  });

  test("429 shows the too-many-checks message", () => {
    expect(checkLine({ ...idle, failure: failure(429) })).toEqual({
      kind: "refused",
      text: "Too many checks in a short time. Wait a minute and try again.",
    });
  });

  test("a 413 with no refusal type still shows the size limit", () => {
    expect(checkLine({ ...idle, failure: failure(413) })).toEqual({
      kind: "refused",
      text: "This file is too large to check. The limit is 100 KB.",
    });
  });

  test.each([
    ["a 500", failure(500)],
    ["a 502 with no Problem Details body", failure(502)],
    ["no answer at all", null],
  ])("%s shows the neutral message", (_, problem) => {
    expect(checkLine({ ...idle, failure: problem })).toEqual({
      kind: "failed",
      text: failedText,
    });
  });

  test("nothing to say without a check", () => {
    expect(checkLine(idle)).toEqual({ kind: "none" });
  });
});

describe("isFileRefusal", () => {
  test("is true for each refusal about the file", () => {
    for (const problem of [
      { type: refusalTypes.noActivity },
      { type: refusalTypes.notTemporalActivity },
      { type: refusalTypes.unacceptedSdk, sdk: "PHP" },
      { type: refusalTypes.multipleActivities, count: 2 },
      { type: refusalTypes.codeTooLarge },
    ]) {
      expect(isFileRefusal({ title: "x", status: 422, ...problem })).toBe(true);
    }
  });

  test("is false for failures that are not about the file", () => {
    expect(
      isFileRefusal({ type: "about:blank", title: "x", status: 429 }),
    ).toBe(false);
    expect(
      isFileRefusal({ type: "about:blank", title: "x", status: 500 }),
    ).toBe(false);
    expect(isFileRefusal(undefined)).toBe(false);
  });
});

test("the refusal panel is Gold tint and uses no Ember colour", () => {
  const css = readFileSync(
    new URL("./check-line-row.module.css", import.meta.url),
    "utf8",
  );
  const tokens = readFileSync(
    new URL("../../styles/tokens.css", import.meta.url),
    "utf8",
  );
  expect(css).not.toMatch(/--color-ember/);
  expect(css).not.toMatch(/#ee1c3a|238,\s*28,\s*58|238 28 58/i);
  expect(css).toMatch(/\.refused\s*\{[^}]*background:\s*var\(--notice\)/);
  // Gold is #ffb700: rgb 255 183 0.
  const notices = [...tokens.matchAll(/--notice:\s*([^;]+);/g)].map(
    ([, value]) => value,
  );
  expect(notices).toHaveLength(2);
  for (const notice of notices) {
    expect(notice).toMatch(/^rgb\(255 183 0 \/ \d+%\)$/);
  }
});
