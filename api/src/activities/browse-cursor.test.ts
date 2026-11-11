import { describe, expect, test } from "vitest";
import { decodeBrowseCursor, encodeBrowseCursor } from "./browse-cursor";

const position = {
  sort: "newest",
  score: 0,
  publishedAt: new Date("2026-10-20T09:30:00Z"),
  handle: "acme",
  name: "charge-card",
} as const;

const relevancePosition = { ...position, sort: "relevance", score: 7 } as const;

const decodeJson = (cursor: string): unknown =>
  JSON.parse(atob(cursor.replaceAll("-", "+").replaceAll("_", "/")));

const encodeJson = (value: unknown) =>
  btoa(JSON.stringify(value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

describe("a browse cursor", () => {
  test("decodes to the position it was encoded from", () => {
    expect(decodeBrowseCursor(encodeBrowseCursor(position))).toEqual(position);
  });

  test("is base64url, with no padding", () => {
    expect(encodeBrowseCursor(position)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test("keeps the published date to the whole second, as it is stored", () => {
    const cursor = encodeBrowseCursor({
      ...position,
      publishedAt: new Date("2026-10-20T09:30:00.750Z"),
    });

    expect(decodeBrowseCursor(cursor)?.publishedAt).toEqual(
      new Date("2026-10-20T09:30:00Z"),
    );
  });

  test("names the newest sort it belongs to", () => {
    const json: unknown = JSON.parse(
      atob(
        encodeBrowseCursor(position).replaceAll("-", "+").replaceAll("_", "/"),
      ),
    );

    expect(json).toEqual({
      sort: "newest",
      publishedAt: Date.UTC(2026, 9, 20, 9, 30) / 1000,
      handle: "acme",
      name: "charge-card",
    });
  });

  test("decodes a relevance cursor to the position and score it was encoded from", () => {
    expect(decodeBrowseCursor(encodeBrowseCursor(relevancePosition))).toEqual(
      relevancePosition,
    );
  });

  test("names the relevance sort and the score in a relevance cursor", () => {
    expect(decodeJson(encodeBrowseCursor(relevancePosition))).toEqual({
      sort: "relevance",
      score: 7,
      publishedAt: Date.UTC(2026, 9, 20, 9, 30) / 1000,
      handle: "acme",
      name: "charge-card",
    });
  });

  test.each([
    ["empty", ""],
    ["not base64url", "not a cursor!"],
    ["standard base64 padding", `${encodeBrowseCursor(position)}=`],
    ["not JSON", "bm90IGpzb24"],
    ["not UTF-8", "_-8"],
    ["JSON that is not an object", encodeJson([1, 2])],
    [
      "an unknown sort",
      encodeJson({ sort: "popular", publishedAt: 1, handle: "a", name: "b" }),
    ],
    [
      "a relevance sort with no score",
      encodeJson({ sort: "relevance", publishedAt: 1, handle: "a", name: "b" }),
    ],
    [
      "a relevance sort with a fractional score",
      encodeJson({
        sort: "relevance",
        score: 1.5,
        publishedAt: 1,
        handle: "a",
        name: "b",
      }),
    ],
    [
      "a relevance sort with a negative score",
      encodeJson({
        sort: "relevance",
        score: -1,
        publishedAt: 1,
        handle: "a",
        name: "b",
      }),
    ],
    [
      "a newest sort with a score",
      encodeJson({
        sort: "newest",
        score: 3,
        publishedAt: 1,
        handle: "a",
        name: "b",
      }),
    ],
    [
      "a missing field",
      encodeJson({ sort: "newest", publishedAt: 1, handle: "a" }),
    ],
    [
      "an extra field",
      encodeJson({
        sort: "newest",
        publishedAt: 1,
        handle: "a",
        name: "b",
        offset: 50,
      }),
    ],
    [
      "a fractional date",
      encodeJson({ sort: "newest", publishedAt: 1.5, handle: "a", name: "b" }),
    ],
    [
      "a negative date",
      encodeJson({ sort: "newest", publishedAt: -1, handle: "a", name: "b" }),
    ],
    [
      "an empty handle",
      encodeJson({ sort: "newest", publishedAt: 1, handle: "", name: "b" }),
    ],
    [
      "a date as text",
      encodeJson({ sort: "newest", publishedAt: "1", handle: "a", name: "b" }),
    ],
  ])("is malformed when it is %s", (_, cursor) => {
    expect(decodeBrowseCursor(cursor)).toBeUndefined();
  });
});
