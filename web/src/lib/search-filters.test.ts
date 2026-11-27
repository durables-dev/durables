import { searchAddress, type Search } from "./search-address";
import { describe, expect, test } from "vitest";
import {
  activeFilterCount,
  everything,
  withAnySdk,
  withChipToggled,
  withoutFilters,
  withSdkToggled,
} from "./search-filters";

const search: Search = {
  words: "charge card",
  sdks: ["Python"],
  chips: ["Stripe"],
};

describe("the SDK chips", () => {
  test("picking an SDK adds it after those already picked", () => {
    expect(withSdkToggled(search, ".NET").sdks).toEqual(["Python", ".NET"]);
  });

  test("picking an SDK that is already on takes it off", () => {
    expect(withSdkToggled(search, "Python").sdks).toEqual([]);
  });

  test("taking off the last SDK leaves none, which is Any", () => {
    const one: Search = { ...search, sdks: ["TypeScript"] };
    expect(withSdkToggled(one, "TypeScript").sdks).toEqual([]);
  });

  test("Any clears every SDK and keeps the rest of the search", () => {
    const several: Search = { ...search, sdks: ["Python", ".NET"] };
    expect(withAnySdk(several)).toEqual({ ...search, sdks: [] });
  });
});

describe("the chips", () => {
  test("several chips can be on together, patterns included", () => {
    const withSlack = withChipToggled(search, "Slack");
    expect(withChipToggled(withSlack, "Polling").chips).toEqual([
      "Stripe",
      "Slack",
      "Polling",
    ]);
  });

  test("picking a chip that is already on takes it off", () => {
    expect(withChipToggled(search, "Stripe").chips).toEqual([]);
  });

  test("toggling a chip leaves the SDKs and words alone", () => {
    const next = withChipToggled(search, "Postgres");
    expect(next.words).toBe("charge card");
    expect(next.sdks).toEqual(["Python"]);
  });

  test("a category stays while a chip is on, and still holds once the last chip goes off", () => {
    const tile: Search = { ...everything, category: "Payments" };
    const on = withChipToggled(tile, "Stripe");
    expect(on).toEqual({ ...tile, chips: ["Stripe"] });
    expect(searchAddress(on)).toBe("/search?chip=Stripe&category=Payments");
    const off = withChipToggled(on, "Stripe");
    expect(off).toEqual(tile);
    expect(searchAddress(off)).toBe("/search?category=Payments");
  });
});

describe("activeFilterCount", () => {
  test("no filters counts 0, whatever the words", () => {
    expect(activeFilterCount({ ...everything, words: "charge" })).toBe(0);
  });

  test("each SDK and each chip counts once", () => {
    expect(
      activeFilterCount({
        words: "",
        sdks: ["Python", ".NET"],
        chips: ["Stripe", "Slack", "Postgres"],
      }),
    ).toBe(5);
  });

  test("a publisher counts as one filter", () => {
    expect(activeFilterCount({ ...everything, publisher: "ddieruf" })).toBe(1);
  });
});

describe("withoutFilters", () => {
  test("clears the SDKs, the chips, the category and the publisher, and keeps the words", () => {
    expect(
      withoutFilters({ ...search, category: "Payments", publisher: "ddieruf" }),
    ).toEqual({
      words: "charge card",
      sdks: [],
      chips: [],
    });
  });
});

test("everything has no words and no filters", () => {
  expect(everything).toEqual({ words: "", sdks: [], chips: [] });
});
