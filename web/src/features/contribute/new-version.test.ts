import type { ListingResponse, VersionResponse } from "@/lib/listing-queries";
import {
  versionNotHigherMessage,
  versionNumberFormatMessage,
  versionTakenMessage,
} from "@durables/schemas";
import { describe, expect, test } from "vitest";
import type { CheckedFacts } from "./check-result";
import {
  baseVersion,
  checkVersion,
  replacedByReason,
  saferMajorMessage,
  suggestVersion,
  versionAllowed,
  type BaseVersion,
} from "./new-version";

const base: BaseVersion = {
  handle: "ddieruf",
  name: "charge-card",
  basedOn: "1.1.0",
  title: "Charge card",
  description: "Charges a card through Stripe.",
  activity: {
    name: "charge_card",
    input: "ChargeRequest",
    output: "ChargeResult",
  },
  versions: ["2.0.0", "1.1.0", "1.0.0"],
  latest: "2.0.0",
  removed: false,
};

const facts: CheckedFacts = {
  sdk: "Python",
  activity: { name: "charge_card", line: 4 },
  input: "ChargeRequest",
  output: "ChargeResult",
  runsAs: "sync",
  nonRetryableErrors: [],
  configurationRead: [],
  dependencies: [],
  heartbeats: [],
};

describe("suggestVersion", () => {
  test("is the next minor after the latest when name, input and output match the base", () => {
    expect(suggestVersion(base, facts)).toEqual({
      version: "2.1.0",
      major: false,
      why: "The name, input and output types match 1.1.0, so callers keep working.",
    });
  });

  test.each([
    ["the activity name", { activity: { name: "charge_payment", line: 4 } }],
    ["the input type", { input: "PaymentRequest" }],
    ["the output type", { output: "PaymentResult" }],
    ["an input type detection could not read", { input: null }],
  ])("is the next major after the latest when %s differs", (_, change) => {
    expect(suggestVersion(base, { ...facts, ...change })).toEqual({
      version: "3.0.0",
      major: true,
      why: "The activity name or its input or output type differs from 1.1.0, which breaks callers.",
    });
  });

  test("ignores the patch number of the latest", () => {
    expect(suggestVersion({ ...base, latest: "2.3.7" }, facts).version).toBe(
      "2.4.0",
    );
  });

  test("is minor, and asks for the code, when there is nothing to compare", () => {
    expect(suggestVersion(base, undefined)).toEqual({
      version: "2.1.0",
      major: false,
      why: "Paste the code first, and the suggestion compares it with 1.1.0.",
    });
  });
});

describe("checkVersion", () => {
  const minor = suggestVersion(base, facts);
  const major = suggestVersion(base, { ...facts, input: "PaymentRequest" });

  test("says nothing while the field is empty, and is not allowed", () => {
    const check = checkVersion("", base, minor);
    expect(check).toEqual({ kind: "empty" });
    expect(versionAllowed(check)).toBe(false);
  });

  test.each(["2.1", "2.1.0.0", "v2.1.0", " 2.1.0", "02.1.0", "2.1.x"])(
    "%j breaks the number rule",
    (typed) => {
      const check = checkVersion(typed, base, minor);
      expect(check).toEqual({
        kind: "malformed",
        message: versionNumberFormatMessage,
      });
      expect(versionAllowed(check)).toBe(false);
    },
  );

  test.each(["2.0.0", "1.1.0", "1.0.0"])("%s already exists", (typed) => {
    const check = checkVersion(typed, base, minor);
    expect(check).toEqual({
      kind: "taken",
      message: versionTakenMessage(typed),
    });
    expect(versionAllowed(check)).toBe(false);
  });

  test.each(["1.5.0", "1.9.9", "0.1.0"])(
    "%s is not higher than the latest",
    (typed) => {
      const check = checkVersion(typed, base, minor);
      expect(check).toEqual({
        kind: "notHigher",
        message: versionNotHigherMessage("2.0.0"),
      });
      expect(versionAllowed(check)).toBe(false);
    },
  );

  test("a higher, unused number is available", () => {
    const check = checkVersion("2.0.1", base, minor);
    expect(check).toEqual({
      kind: "available",
      message: "✓ 2.0.1 is available.",
    });
    expect(versionAllowed(check)).toBe(true);
  });

  test("a non-major number is allowed with a note when the suggestion is major", () => {
    const check = checkVersion("2.1.0", base, major);
    expect(check).toEqual({ kind: "saferMajor", message: saferMajorMessage });
    expect(versionAllowed(check)).toBe(true);
  });

  test("a major number is simply available when the suggestion is major", () => {
    expect(checkVersion("3.0.0", base, major)).toEqual({
      kind: "available",
      message: "✓ 3.0.0 is available.",
    });
  });
});

describe("baseVersion", () => {
  const listing: ListingResponse = {
    handle: "ddieruf",
    name: "charge-card",
    removedBy: null,
    versions: [
      {
        version: "2.0.0",
        publishedAt: "2026-11-01T00:00:00.000Z",
        whatChanged: "Breaking.",
        basedOn: "1.0.0",
        deprecation: null,
        description: "Charges a payment method.",
      },
      {
        version: "1.0.0",
        publishedAt: "2026-10-01T00:00:00.000Z",
        whatChanged: null,
        basedOn: null,
        deprecation: null,
        description: "Charges a card.",
      },
    ],
  };
  const version: VersionResponse = {
    address: "ddieruf/charge-card@1.0.0",
    handle: "ddieruf",
    name: "charge-card",
    version: "1.0.0",
    title: "Charge card",
    sdk: "Python",
    facts: {
      activity: { name: "charge_card", line: 4 },
      input: "ChargeRequest",
      output: "ChargeResult",
      runsAs: "sync",
      nonRetryableErrors: [],
      configurationRead: [],
      dependencies: [],
      heartbeats: [],
      sdk: "Python",
    },
    code: "",
    activityFileName: "activities.py",
    snippets: [],
    integrations: [],
    publishedAt: "2026-10-01T00:00:00.000Z",
  };
  const ref = { handle: "ddieruf", name: "charge-card", basedOn: "1.0.0" };

  test("takes the base's title, facts and own description, and the listing's latest", () => {
    expect(baseVersion(ref, version, listing)).toEqual({
      ...ref,
      title: "Charge card",
      description: "Charges a card.",
      activity: {
        name: "charge_card",
        input: "ChargeRequest",
        output: "ChargeResult",
      },
      versions: ["2.0.0", "1.0.0"],
      latest: "2.0.0",
      removed: false,
    });
  });

  test("says the listing is removed when it is out of search", () => {
    expect(
      baseVersion(ref, version, { ...listing, removedBy: "publisher" })
        ?.removed,
    ).toBe(true);
  });

  test("is undefined when the listing has no such version", () => {
    expect(
      baseVersion({ ...ref, basedOn: "1.1.0" }, version, listing),
    ).toBeUndefined();
  });
});

test("the deprecation reason starts with the new version", () => {
  expect(replacedByReason("2.1.0")).toBe("Replaced by 2.1.0");
});
