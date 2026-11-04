import { describe, expect, test } from "vitest";
import { encodeBrowseCursor } from "./browse-cursor";
import {
  BROWSE_BATCH_SIZE,
  browseQuery,
  cursorMessage,
  publisherMessage,
  sdkFilterMessage,
} from "./browse-request";

/** The first error message for each failing field. */
const errors = (query: unknown) => {
  const result = browseQuery.safeParse(query);
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ]),
      );
};

describe("the browse query", () => {
  test("is empty with no parameters", () => {
    expect(browseQuery.parse({})).toEqual({});
  });

  test("reads one SDK as a list of one", () => {
    expect(browseQuery.parse({ sdk: "Python" })).toEqual({ sdk: ["Python"] });
  });

  test("reads several SDKs as a list", () => {
    expect(browseQuery.parse({ sdk: ["Python", ".NET"] })).toEqual({
      sdk: ["Python", ".NET"],
    });
  });

  test.each(["Java", "python", "", "Python,TypeScript"])(
    "rejects the unsupported SDK %j",
    (sdk) => {
      expect(errors({ sdk })).toEqual({ sdk: sdkFilterMessage });
    },
  );

  test("rejects several SDKs when one is unsupported", () => {
    expect(errors({ sdk: ["TypeScript", "PHP"] })).toEqual({
      sdk: sdkFilterMessage,
    });
  });

  test("reads one integration as a list of one, and several as a list", () => {
    expect(browseQuery.parse({ integration: "Amazon S3" })).toEqual({
      integration: ["Amazon S3"],
    });
    expect(browseQuery.parse({ integration: ["Stripe", "Slack"] })).toEqual({
      integration: ["Stripe", "Slack"],
    });
  });

  test("reads the publisher handle as given", () => {
    expect(browseQuery.parse({ publisher: "ddieruf" })).toEqual({
      publisher: "ddieruf",
    });
  });

  test("rejects an empty publisher", () => {
    expect(errors({ publisher: "" })).toEqual({ publisher: publisherMessage });
  });

  test("reads a cursor as the position it names", () => {
    const position = {
      publishedAt: new Date("2026-10-20T09:30:00Z"),
      handle: "acme",
      name: "charge-card",
    };

    expect(browseQuery.parse({ cursor: encodeBrowseCursor(position) })).toEqual(
      {
        cursor: position,
      },
    );
  });

  test.each(["", "not a cursor!", "bm90IGpzb24"])(
    "rejects the malformed cursor %j",
    (cursor) => {
      expect(errors({ cursor })).toEqual({ cursor: cursorMessage });
    },
  );

  test("reports every failing field", () => {
    expect(errors({ sdk: "Java", cursor: "!" })).toEqual({
      sdk: sdkFilterMessage,
      cursor: cursorMessage,
    });
  });

  test("ignores parameters it does not know", () => {
    expect(browseQuery.parse({ q: "stripe" })).toEqual({});
  });
});

test("a batch holds at most 50 cards", () => {
  expect(BROWSE_BATCH_SIZE).toBe(50);
});
