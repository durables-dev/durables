import {
  listingDescriptionEmptyMessage,
  listingDescriptionTooLongMessage,
  listingNameEmptyMessage,
  listingNameFormatMessage,
  listingTitleEmptyMessage,
  listingTitleTooLongMessage,
} from "@durables/schemas";
import { describe, expect, test } from "vitest";
import { charactersLeft, detailsMessages } from "./details-rules";

const valid = {
  title: "Post slack message",
  name: "post-slack-message",
  description: "Posts a message to a Slack channel.",
};

describe("detailsMessages", () => {
  test("has no message for valid details", () => {
    expect(detailsMessages(valid)).toEqual({});
  });

  test("names each empty field", () => {
    expect(detailsMessages({ title: "", name: "", description: "" })).toEqual({
      title: listingTitleEmptyMessage,
      name: listingNameEmptyMessage,
      description: listingDescriptionEmptyMessage,
    });
  });

  test("names a field that is too long", () => {
    expect(
      detailsMessages({
        ...valid,
        title: "t".repeat(81),
        description: "d".repeat(161),
      }),
    ).toEqual({
      title: listingTitleTooLongMessage,
      description: listingDescriptionTooLongMessage,
    });
  });

  test("allows a title of 80 and a description of 160 characters", () => {
    expect(
      detailsMessages({
        ...valid,
        title: "t".repeat(80),
        description: "d".repeat(160),
      }),
    ).toEqual({});
  });

  test.each([
    ["uppercase", "Post-slack"],
    ["a leading hyphen", "-post-slack"],
    ["a trailing hyphen", "post-slack-"],
    ["two hyphens in a row", "post--slack"],
    ["two characters", "ps"],
    ["65 characters", "p".repeat(65)],
    ["a space", "post slack"],
  ])("gives the name rule for a name with %s", (_, name) => {
    expect(detailsMessages({ ...valid, name })).toEqual({
      name: listingNameFormatMessage,
    });
  });

  test("gives one message per field", () => {
    expect(detailsMessages({ ...valid, name: "-" })).toEqual({
      name: listingNameFormatMessage,
    });
  });
});

describe("charactersLeft", () => {
  test.each([
    [0, 160],
    [159, 1],
    [160, 0],
    [161, -1],
  ])("reads 160 less %i characters", (length, left) => {
    expect(charactersLeft("d".repeat(length))).toBe(left);
  });
});
