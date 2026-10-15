import {
  checkHandleRule,
  handleFormatMessage,
  handleFormatSchema,
  handleSchema,
  handleTakenMessage,
  reservedHandles,
} from "@durables/schemas";
import { describe, expect, test } from "vitest";

// The shared handle rule from @durables/schemas, as api applies it. web imports the same
// exports, so these results are web's too.

const messagesFor = (handle: string): string[] => {
  const result = handleSchema.safeParse(handle);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
};

describe("the handle format rule", () => {
  test.each([
    ["3 characters", "abc"],
    ["39 characters", "a".repeat(39)],
    ["numbers only", "123"],
    ["letters and numbers", "ddieruf42"],
    ["a single interior hyphen", "dan-dieruf"],
    ["several single hyphens", "a-b-c"],
    ["a number at each end", "1-a-2"],
  ])("accepts %s", (_case, handle) => {
    expect(handleSchema.safeParse(handle).success).toBe(true);
    expect(checkHandleRule(handle)).toBe("valid");
  });

  test.each([
    ["an empty handle", ""],
    ["2 characters", "ab"],
    ["40 characters", "a".repeat(40)],
    ["an uppercase letter", "Ddieruf"],
    ["all uppercase", "DDIERUF"],
    ["a space", "dan dieruf"],
    ["an underscore", "dan_dieruf"],
    ["a leading hyphen", "-ddieruf"],
    ["a trailing hyphen", "ddieruf-"],
    ["two hyphens in a row", "dan--dieruf"],
    ["a dot", "dan.dieruf"],
    ["a non-ASCII letter", "dañiel"],
  ])("refuses %s with the format message", (_case, handle) => {
    expect(messagesFor(handle)).toEqual([handleFormatMessage]);
    expect(handleFormatSchema.safeParse(handle).success).toBe(false);
    expect(checkHandleRule(handle)).toBe("invalid");
  });

  test("refuses uppercase rather than lowercasing it", () => {
    const result = handleSchema.safeParse("Admin");

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      handleFormatMessage,
    ]);
  });

  test("states the format message as the design words it", () => {
    expect(handleFormatMessage).toBe(
      "Use 3 to 39 lowercase letters, numbers and single hyphens.",
    );
  });
});

describe("reserved words", () => {
  test("include the design's reserved words and web's top-level routes", () => {
    expect([...reservedHandles].sort()).toEqual(
      [
        "admin",
        "api",
        "contribute",
        "durables",
        "privacy",
        "search",
        "security",
        "temporal",
        "terms",
      ].sort(),
    );
  });

  test.each([...reservedHandles])("reports %s as taken", (word) => {
    expect(checkHandleRule(word)).toBe("taken");
    expect(messagesFor(word)).toEqual([`${word} is taken.`]);
  });

  test("all pass the format rule, so only the reserved check refuses them", () => {
    for (const word of reservedHandles) {
      expect(handleFormatSchema.safeParse(word).success).toBe(true);
    }
  });

  test("no longer use the old reserved wording", () => {
    expect(messagesFor("admin")).not.toContain("This handle is reserved.");
  });
});

describe("the taken wording", () => {
  test("is the handle followed by 'is taken.'", () => {
    expect(handleTakenMessage("ddieruf")).toBe("ddieruf is taken.");
  });
});
