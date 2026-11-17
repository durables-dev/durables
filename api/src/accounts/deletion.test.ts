import { describe, expect, test } from "vitest";
import { deletionGracePeriodDays, finalDeletionAt } from "./deletion";

describe("finalDeletionAt", () => {
  test("is 30 days after the deletion was asked for", () => {
    expect(deletionGracePeriodDays).toBe(30);
    expect(finalDeletionAt(new Date("2026-11-17T10:30:00Z"))).toEqual(
      new Date("2026-12-17T10:30:00Z"),
    );
  });

  test("keeps the time of day across a month end", () => {
    expect(finalDeletionAt(new Date("2027-01-31T23:59:59Z"))).toEqual(
      new Date("2027-03-02T23:59:59Z"),
    );
  });
});
