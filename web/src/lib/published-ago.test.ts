import { describe, expect, test } from "vitest";
import { publishedAgo } from "./published-ago";

const now = new Date("2026-10-30T12:00:00.000Z");

describe("publishedAgo", () => {
  test.each([
    ["2026-10-30T11:59:30.000Z", "just now"],
    ["2026-10-30T11:55:00.000Z", "5 minutes ago"],
    ["2026-10-30T11:00:00.000Z", "1 hour ago"],
    ["2026-10-30T07:00:00.000Z", "5 hours ago"],
    ["2026-10-29T12:00:00.000Z", "yesterday"],
    ["2026-10-28T12:00:00.000Z", "2 days ago"],
    ["2026-10-20T12:00:00.000Z", "last week"],
    ["2026-10-09T12:00:00.000Z", "3 weeks ago"],
    ["2026-08-30T12:00:00.000Z", "2 months ago"],
    ["2024-10-30T12:00:00.000Z", "2 years ago"],
  ])("a version published at %s reads %s", (publishedAt, expected) => {
    expect(publishedAgo(publishedAt, now)).toBe(expected);
  });

  test("a time ahead of the clock reads just now", () => {
    expect(publishedAgo("2026-10-30T12:05:00.000Z", now)).toBe("just now");
  });
});
