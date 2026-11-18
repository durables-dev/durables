import { describe, expect, test } from "vitest";
import {
  latestForOlderVersion,
  versionRows,
  type ListingVersion,
} from "./version-rows";

function entry(
  version: string,
  overrides: Partial<ListingVersion> = {},
): ListingVersion {
  return {
    version,
    publishedAt: "2026-11-01T10:00:00.000Z",
    whatChanged: null,
    basedOn: null,
    deprecation: null,
    description: `Charges a card, ${version}.`,
    ...overrides,
  };
}

/** Three versions, newest first, as the listing read answers them. */
const three = [
  entry("2.0.0", {
    whatChanged: "The input type changed.",
    basedOn: "1.1.0",
  }),
  entry("1.1.0", {
    whatChanged: "Declined cards are not retried.",
    basedOn: "1.0.0",
  }),
  entry("1.0.0"),
];

describe("versionRows", () => {
  test("keeps the listing's newest-first order and marks only the first as latest", () => {
    const rows = versionRows(three, "1.1.0");

    expect(rows.map(({ version, latest }) => ({ version, latest }))).toEqual([
      { version: "2.0.0", latest: true },
      { version: "1.1.0", latest: false },
      { version: "1.0.0", latest: false },
    ]);
  });

  test("shows each version's What changed note and the version it was based on", () => {
    const rows = versionRows(three, "2.0.0");

    expect(rows.map(({ note, lineage }) => ({ note, lineage }))).toEqual([
      { note: "The input type changed.", lineage: "Based on 1.1.0" },
      { note: "Declined cards are not retried.", lineage: "Based on 1.0.0" },
      { note: "First release.", lineage: "First version" },
    ]);
  });

  test("marks only the viewed version as Viewing", () => {
    const rows = versionRows(three, "1.1.0");

    expect(rows.map(({ viewing }) => viewing)).toEqual([false, true, false]);
  });

  test("tags a deprecated version with its replacement, or with no replacement", () => {
    const rows = versionRows(
      [
        entry("2.0.0", { whatChanged: "New input.", basedOn: "1.1.0" }),
        entry("1.1.0", {
          whatChanged: "Retries fixed.",
          basedOn: "1.0.0",
          deprecation: { reason: "Breaks on refunds.", replacement: null },
        }),
        entry("1.0.0", {
          deprecation: { reason: "Retries charges.", replacement: "2.0.0" },
        }),
      ],
      "2.0.0",
    );

    expect(rows.map(({ deprecated }) => deprecated)).toEqual([
      null,
      "Deprecated · no replacement",
      "Deprecated · use 2.0.0",
    ]);
  });

  test("a single version is one row: latest, viewing, first release", () => {
    expect(versionRows([entry("1.0.0")], "1.0.0")).toEqual([
      {
        version: "1.0.0",
        latest: true,
        publishedAt: "2026-11-01T10:00:00.000Z",
        note: "First release.",
        lineage: "First version",
        deprecated: null,
        viewing: true,
      },
    ]);
  });
});

describe("latestForOlderVersion", () => {
  test("names the latest on an older version that is not deprecated", () => {
    expect(latestForOlderVersion(three, "1.1.0")).toBe("2.0.0");
    expect(latestForOlderVersion(three, "1.0.0")).toBe("2.0.0");
  });

  test("is undefined on the latest version", () => {
    expect(latestForOlderVersion(three, "2.0.0")).toBeUndefined();
  });

  test("is undefined on an older version that is deprecated", () => {
    const versions = [
      three[0] ?? entry("2.0.0"),
      entry("1.0.0", {
        deprecation: { reason: "Retries charges.", replacement: "2.0.0" },
      }),
    ];

    expect(latestForOlderVersion(versions, "1.0.0")).toBeUndefined();
  });

  test("is undefined for a single-version activity", () => {
    expect(latestForOlderVersion([entry("1.0.0")], "1.0.0")).toBeUndefined();
  });

  test("is undefined for a version the listing does not hold", () => {
    expect(latestForOlderVersion(three, "0.9.0")).toBeUndefined();
  });
});
