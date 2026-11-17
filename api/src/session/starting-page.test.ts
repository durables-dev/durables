import { describe, expect, test } from "vitest";
import {
  sameSitePath,
  startingPageMaxLength,
  startingPageParam,
} from "./starting-page";

describe("sameSitePath", () => {
  test.each([
    ["an activity page", "/acme/charge-card", "/acme/charge-card"],
    [
      "a versioned activity page",
      "/acme/charge-card@2.0.0",
      "/acme/charge-card@2.0.0",
    ],
    ["the home page", "/", "/"],
    [
      "a page with a query",
      "/search?q=stripe&sdk=go",
      "/search?q=stripe&sdk=go",
    ],
    ["a page with a fragment", "/privacy#choices", "/privacy#choices"],
    ["a path with dot segments", "/acme/../profile", "/profile"],
  ])("keeps %s", (_case, value, kept) => {
    expect(sameSitePath(value)).toBe(kept);
  });

  test.each([
    ["no starting page", undefined],
    ["an empty starting page", ""],
    ["an absolute URL", "https://evil.example/x"],
    ["an absolute URL to this site's own scheme", "http://localhost/acme"],
    ["a protocol-relative URL", "//evil.example"],
    ["a protocol-relative URL with a path", "//evil.example/acme/charge-card"],
    ["a backslash that browsers read as a slash", "/\\evil.example"],
    ["a tab that browsers drop", "/\t/evil.example"],
    ["a relative path", "acme/charge-card"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:text/html,hi"],
    ["a path one character too long", `/${"a".repeat(startingPageMaxLength)}`],
  ])("ignores %s", (_case, value) => {
    expect(sameSitePath(value)).toBeUndefined();
  });

  test("keeps a path at the length limit", () => {
    const longest = `/${"a".repeat(startingPageMaxLength - 1)}`;

    expect(sameSitePath(longest)).toBe(longest);
  });

  test("percent-encodes characters a browser would encode", () => {
    expect(sameSitePath("/search?q=a b")).toBe("/search?q=a%20b");
  });
});

describe("startingPageParam", () => {
  test("is returnTo", () => {
    expect(startingPageParam).toBe("returnTo");
  });
});
