import {
  deprecationReasonEmptyMessage,
  deprecationReasonMaxLength,
  deprecationReasonSchema,
  deprecationReasonTooLongMessage,
} from "@durables/schemas";
import { describe, expect, test } from "vitest";
import { deprecationBody } from "./deprecation-request";

/** The first error message for each failing field. */
const errors = (body: unknown) => {
  const result = deprecationBody.safeParse(body);
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ]),
      );
};

const reason = "Declined cards are retried until the retry policy gives up.";

describe("the shared deprecation reason rule", () => {
  test("is the rule the deprecation body validates its reason with", () => {
    expect(deprecationBody.shape.reason).toBe(deprecationReasonSchema);
  });

  test("allows at most 160 characters", () => {
    expect(deprecationReasonMaxLength).toBe(160);
  });

  test("parses a reason trimmed", () => {
    expect(deprecationReasonSchema.parse(`\t ${reason}\n `)).toBe(reason);
  });
});

describe("the deprecation body", () => {
  test("parses a reason and a replacement", () => {
    expect(deprecationBody.parse({ reason, replacement: "1.1.0" })).toEqual({
      reason,
      replacement: "1.1.0",
    });
  });

  test("parses a reason with no replacement as null", () => {
    expect(deprecationBody.parse({ reason })).toEqual({
      reason,
      replacement: null,
    });
  });

  test("parses an explicit null replacement", () => {
    expect(deprecationBody.parse({ reason, replacement: null })).toEqual({
      reason,
      replacement: null,
    });
  });

  test("trims the reason", () => {
    expect(
      deprecationBody.parse({ reason: `  ${reason} \t`, replacement: "2.0.0" }),
    ).toEqual({ reason, replacement: "2.0.0" });
  });

  test("accepts a reason of exactly 160 characters", () => {
    const longest = "a".repeat(160);
    expect(deprecationBody.parse({ reason: longest }).reason).toBe(longest);
  });

  test("drops any other field", () => {
    expect(
      deprecationBody.parse({ reason, version: "9.9.9", handle: "someone" }),
    ).toEqual({ reason, replacement: null });
  });

  test.each([
    ["an empty reason", ""],
    ["a space-only reason", "   "],
    ["a tab and newline reason", "\t\n "],
  ])("refuses %s with the empty wording", (_, empty) => {
    expect(errors({ reason: empty })).toEqual({
      reason: deprecationReasonEmptyMessage,
    });
  });

  test("refuses a reason over 160 characters", () => {
    expect(errors({ reason: "a".repeat(161) })).toEqual({
      reason: deprecationReasonTooLongMessage,
    });
  });

  test("counts the length after trimming", () => {
    expect(errors({ reason: ` ${"a".repeat(160)} ` })).toEqual({});
  });

  test("refuses a missing reason", () => {
    expect(Object.keys(errors({ replacement: "1.1.0" }))).toEqual(["reason"]);
  });

  test("refuses an empty replacement", () => {
    expect(Object.keys(errors({ reason, replacement: "" }))).toEqual([
      "replacement",
    ]);
  });

  test("refuses a replacement that is not text", () => {
    expect(Object.keys(errors({ reason, replacement: 2 }))).toEqual([
      "replacement",
    ]);
  });
});
