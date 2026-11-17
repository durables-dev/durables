import { describe, expect, test } from "vitest";
import {
  activitiesIn,
  emptyLine,
  filterLabel,
  newestPublishedFirst,
  versionsLine,
} from "./activity-filter";
import type { OwnedActivity } from "./profile-queries";

function activity(
  name: string,
  status: OwnedActivity["status"],
  latestPublishedAt: string,
): OwnedActivity {
  return {
    handle: "ddieruf",
    name,
    version: "1.0.0",
    address: `ddieruf/${name}@1.0.0`,
    title: name,
    sdk: "Python",
    versionCount: 1,
    latestPublishedAt,
    status,
  };
}

const chargeCard = activity("charge-card", "listed", "2026-11-15T10:00:00Z");
const refund = activity("refund-charge", "listed", "2026-11-16T10:00:00Z");
const invoice = activity("send-invoice", "removed", "2026-10-01T10:00:00Z");
const mixed = [invoice, chargeCard, refund];

describe("newestPublishedFirst", () => {
  test("orders by latest published, newest first", () => {
    expect(newestPublishedFirst(mixed).map(({ name }) => name)).toEqual([
      "refund-charge",
      "charge-card",
      "send-invoice",
    ]);
  });

  test("leaves the list it was given alone", () => {
    newestPublishedFirst(mixed);
    expect(mixed).toEqual([invoice, chargeCard, refund]);
  });

  test("activities published at the same moment keep their order", () => {
    const first = activity("first", "listed", "2026-11-15T10:00:00Z");
    const second = activity("second", "removed", "2026-11-15T10:00:00Z");
    expect(newestPublishedFirst([first, second])).toEqual([first, second]);
  });
});

describe("activitiesIn", () => {
  test("All keeps every activity", () => {
    expect(activitiesIn(mixed, "all")).toEqual(mixed);
  });

  test("Listed keeps only listed activities", () => {
    expect(activitiesIn(mixed, "listed")).toEqual([chargeCard, refund]);
  });

  test("Removed keeps only removed activities", () => {
    expect(activitiesIn(mixed, "removed")).toEqual([invoice]);
  });
});

describe("filterLabel", () => {
  test("each segment carries its count", () => {
    expect(filterLabel(mixed, "all")).toBe("All (3)");
    expect(filterLabel(mixed, "listed")).toBe("Listed (2)");
    expect(filterLabel(mixed, "removed")).toBe("Removed (1)");
  });

  test("with no activities every count is zero", () => {
    expect(filterLabel([], "all")).toBe("All (0)");
    expect(filterLabel([], "listed")).toBe("Listed (0)");
    expect(filterLabel([], "removed")).toBe("Removed (0)");
  });
});

describe("emptyLine", () => {
  test("Listed and Removed say what is missing", () => {
    expect(emptyLine("listed")).toBe("Nothing listed.");
    expect(emptyLine("removed")).toBe("Nothing removed from search.");
  });

  test("All says nothing is published yet", () => {
    expect(emptyLine("all")).toBe("You haven't published an activity yet.");
  });
});

describe("versionsLine", () => {
  test("counts versions and says when the latest was published", () => {
    expect(versionsLine(3, "2 days ago")).toBe(
      "3 versions · latest published 2 days ago",
    );
  });

  test("one version is singular", () => {
    expect(versionsLine(1, "yesterday")).toBe(
      "1 version · latest published yesterday",
    );
  });
});
