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
    expect(descriptionBody.parse({ description: "Charges a card." })).toEqual({
      description: "Charges a card.",
    });
  });

  test("trims leading and trailing whitespace", () => {
    expect(
      descriptionBody.parse({ description: " \tCharges a card.\n " }),
    ).toEqual({ description: "Charges a card." });
  });

  test("accepts exactly 160 characters", () => {
    const description = "a".repeat(160);
    expect(descriptionBody.parse({ description })).toEqual({ description });
  });

  test("counts the length after trimming", () => {
    const description = "a".repeat(160);
    expect(descriptionBody.parse({ description: ` ${description} ` })).toEqual({
      description,
    });
  });

  test("refuses 161 characters with the too-long message", () => {
    expect(errors({ description: "a".repeat(161) })).toEqual({
      description: listingDescriptionTooLongMessage,
    });
  });

  test("refuses an empty description with the empty message", () => {
    expect(errors({ description: "" })).toEqual({
      description: listingDescriptionEmptyMessage,
    });
  });

  test("refuses whitespace alone with the empty message", () => {
    expect(errors({ description: "  \t\n " })).toEqual({
      description: listingDescriptionEmptyMessage,
    });
  });

  test("refuses a missing or non-text description", () => {
    expect(Object.keys(errors({}))).toEqual(["description"]);
    expect(Object.keys(errors({ description: 42 }))).toEqual(["description"]);
  });

  test("drops any other field", () => {
    expect(
      descriptionBody.parse({ description: "Charges a card.", title: "X" }),
    ).toEqual({ description: "Charges a card." });
  });
});
