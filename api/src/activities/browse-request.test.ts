import { describe, expect, test } from "vitest";
import { encodeBrowseCursor } from "./browse-cursor";
import {
  BROWSE_BATCH_SIZE,
  browseQuery,
  browseSort,
  cursorMessage,
  MAX_WORDS_LENGTH,
  publisherMessage,
  sdkFilterMessage,
  searchWords,
  wordsMessage,
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

  test("reads Java as an SDK filter", () => {
    expect(browseQuery.parse({ sdk: "Java" })).toEqual({ sdk: ["Java"] });
  });

  test("names every SDK in the api's list in the filter message", () => {
    expect(sdkFilterMessage).toBe(
      "Choose Go, Java, Python, TypeScript, .NET, Ruby or PHP.",
    );
  });

  test.each(["Cobol", "java", "python", "", "Python,TypeScript"])(
    "rejects the unsupported SDK %j",
    (sdk) => {
      expect(errors({ sdk })).toEqual({ sdk: sdkFilterMessage });
    },
  );

  test("rejects several SDKs when one is unsupported", () => {
    expect(errors({ sdk: ["TypeScript", "Rust"] })).toEqual({
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
      sort: "newest",
      score: 0,
      publishedAt: new Date("2026-10-20T09:30:00Z"),
      handle: "acme",
      name: "charge-card",
    } as const;

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
    expect(errors({ sdk: "Cobol", cursor: "!" })).toEqual({
      sdk: sdkFilterMessage,
      cursor: cursorMessage,
    });
  });

  test("ignores parameters it does not know", () => {
    expect(browseQuery.parse({ sort: "popular" })).toEqual({});
  });
});

describe("the search words", () => {
  const position = {
    score: 3,
    publishedAt: new Date("2026-10-20T09:30:00Z"),
    handle: "acme",
    name: "charge-card",
  };

  test("are read from q, split on spaces", () => {
    expect(browseQuery.parse({ q: "charge  card\tstripe" })).toEqual({
      q: ["charge", "card", "stripe"],
    });
  });

  test("keep letter case and pattern characters as typed", () => {
    expect(browseQuery.parse({ q: "Stripe 100%_off" })).toEqual({
      q: ["Stripe", "100%_off"],
    });
  });

  test.each(["", "   ", " \t \n "])("are no words when q is %j", (q) => {
    expect(browseQuery.parse({ q })).toEqual({ q: [] });
  });

  test("accept words up to the limit", () => {
    const q = "a".repeat(MAX_WORDS_LENGTH);

    expect(browseQuery.parse({ q })).toEqual({ q: [q] });
  });

  test("are rejected over the limit", () => {
    expect(errors({ q: "a".repeat(MAX_WORDS_LENGTH + 1) })).toEqual({
      q: wordsMessage,
    });
  });

  test("are rejected when q is sent more than once", () => {
    expect(errors({ q: ["charge", "card"] })).toEqual({ q: wordsMessage });
  });

  test("take a relevance cursor", () => {
    const cursor = encodeBrowseCursor({ ...position, sort: "relevance" });

    expect(browseQuery.parse({ q: "charge", cursor })).toEqual({
      q: ["charge"],
      cursor: { ...position, sort: "relevance" },
    });
  });

  test("reject a newest-first cursor", () => {
    const cursor = encodeBrowseCursor({ ...position, sort: "newest" });

    expect(errors({ q: "charge", cursor })).toEqual({ cursor: cursorMessage });
  });

  test.each([{}, { q: "   " }])(
    "being absent or blank, reject a relevance cursor: %j",
    (query) => {
      const cursor = encodeBrowseCursor({ ...position, sort: "relevance" });

      expect(errors({ ...query, cursor })).toEqual({ cursor: cursorMessage });
    },
  );
});

describe("searchWords", () => {
  test("splits on any run of whitespace and drops the ends", () => {
    expect(searchWords("  send\n slack   message ")).toEqual([
      "send",
      "slack",
      "message",
    ]);
  });

  test("finds no words in whitespace", () => {
    expect(searchWords(" \t ")).toEqual([]);
  });
});

describe("browseSort", () => {
  test("is relevance with words", () => {
    expect(browseSort(["stripe"])).toBe("relevance");
  });

  test("is newest with no words", () => {
    expect(browseSort([])).toBe("newest");
  });
});

test("a batch holds at most 50 cards", () => {
  expect(BROWSE_BATCH_SIZE).toBe(50);
});
