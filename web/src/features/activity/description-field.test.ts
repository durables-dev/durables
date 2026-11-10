import {
  listingDescriptionEmptyMessage,
  listingDescriptionTooLongMessage,
} from "@durables/schemas";
import { describe, expect, test } from "vitest";
import { charactersLeft, descriptionMessage } from "./description-field";

describe("charactersLeft", () => {
  test("is 160 less the length typed", () => {
    expect(charactersLeft("")).toBe(160);
    expect(charactersLeft("Charges a card.")).toBe(145);
  });

  test("is 0 at exactly 160 characters", () => {
    expect(charactersLeft("a".repeat(160))).toBe(0);
  });

  test("goes below zero when too long", () => {
    expect(charactersLeft("a".repeat(165))).toBe(-5);
  });
});

describe("descriptionMessage", () => {
  test("has no message for a valid description", () => {
    expect(descriptionMessage("Charges a card.", false)).toBeUndefined();
    expect(descriptionMessage("Charges a card.", true)).toBeUndefined();
  });

  test("has no message at exactly 160 characters", () => {
    expect(descriptionMessage("a".repeat(160), true)).toBeUndefined();
  });

  test("says too long while typing, before Save is tried", () => {
    expect(descriptionMessage("a".repeat(161), false)).toBe(
      listingDescriptionTooLongMessage,
    );
  });

  test("measures the trimmed text, as the shared rule does", () => {
    expect(descriptionMessage(` ${"a".repeat(160)} `, false)).toBeUndefined();
  });

  test("says nothing about an empty field until Save is tried", () => {
    expect(descriptionMessage("", false)).toBeUndefined();
    expect(descriptionMessage("   ", false)).toBeUndefined();
  });

  test("says empty for an empty or blank field once Save is tried", () => {
    expect(descriptionMessage("", true)).toBe(listingDescriptionEmptyMessage);
    expect(descriptionMessage("  \t ", true)).toBe(
      listingDescriptionEmptyMessage,
    );
  });
});
