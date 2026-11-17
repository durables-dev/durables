import {
  listingDescriptionEmptyMessage,
  listingDescriptionTooLongMessage,
} from "@durables/schemas";
import { describe, expect, test } from "vitest";
import { descriptionBody } from "./description-request";

/** The first error message for each failing field. */
const errors = (body: unknown) => {
  const result = descriptionBody.safeParse(body);
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ]),
      );
};

describe("the description body", () => {
  test("parses a description", () => {
    expect(
      descriptionBody.parse({
        version: "1.1.0",
        description: "Charges a card.",
      }),
    ).toEqual({
      version: "1.1.0",
      description: "Charges a card.",
    });
  });

  test("trims leading and trailing whitespace", () => {
    expect(
      descriptionBody.parse({
        version: "1.1.0",
        description: " \tCharges a card.\n ",
      }),
    ).toEqual({ version: "1.1.0", description: "Charges a card." });
  });

  test("accepts exactly 160 characters", () => {
    const description = "a".repeat(160);
    expect(descriptionBody.parse({ version: "1.1.0", description })).toEqual({
      version: "1.1.0",
      description,
    });
  });

  test("counts the length after trimming", () => {
    const description = "a".repeat(160);
    expect(
      descriptionBody.parse({
        version: "1.1.0",
        description: ` ${description} `,
      }),
    ).toEqual({
      version: "1.1.0",
      description,
    });
  });

  test("refuses 161 characters with the too-long message", () => {
    expect(errors({ version: "1.1.0", description: "a".repeat(161) })).toEqual({
      description: listingDescriptionTooLongMessage,
    });
  });

  test("refuses an empty description with the empty message", () => {
    expect(errors({ version: "1.1.0", description: "" })).toEqual({
      description: listingDescriptionEmptyMessage,
    });
  });

  test("refuses whitespace alone with the empty message", () => {
    expect(errors({ version: "1.1.0", description: "  \t\n " })).toEqual({
      description: listingDescriptionEmptyMessage,
    });
  });

  test("refuses a missing or non-text description", () => {
    expect(Object.keys(errors({ version: "1.1.0" }))).toEqual(["description"]);
    expect(Object.keys(errors({ version: "1.1.0", description: 42 }))).toEqual([
      "description",
    ]);
  });

  test("drops any other field", () => {
    expect(
      descriptionBody.parse({
        version: "1.1.0",
        description: "Charges a card.",
        title: "X",
      }),
    ).toEqual({ version: "1.1.0", description: "Charges a card." });
  });

  test("refuses a missing, empty or non-text version", () => {
    for (const version of [undefined, "", 110]) {
      expect(
        Object.keys(errors({ version, description: "Charges a card." })),
      ).toEqual(["version"]);
    }
  });
});
