import { searchAddress, type Search } from "./search-address";
import { describe, expect, test } from "vitest";
import {
  activeFilterCount,
  appliedCategory,
  everything,
  withAnySdk,
  withChipToggled,
  withoutCategory,
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

describe("appliedCategory", () => {
  test("the category applies while no chip is on", () => {
    expect(appliedCategory({ ...everything, category: "Payments" })).toBe(
      "Payments",
    );
  });

  test("no category applies while a chip is on", () => {
    expect(
      appliedCategory({
        ...everything,
        chips: ["Slack"],
        category: "Payments",
      }),
    ).toBeUndefined();
  });

  test("an SDK, words or a publisher alone do not stop the category applying", () => {
    expect(
      appliedCategory({
        words: "charge",
        sdks: ["Python"],
        chips: [],
        category: "Payments",
        publisher: "ddieruf",
      }),
    ).toBe("Payments");
  });

  test("the category applies again once the last chip goes off", () => {
    const on: Search = {
      ...everything,
      chips: ["Stripe"],
      category: "Payments",
    };
    expect(appliedCategory(withChipToggled(on, "Stripe"))).toBe("Payments");
  });

  test("with no category in the search, none applies", () => {
    expect(appliedCategory(everything)).toBeUndefined();
  });
});

describe("withoutCategory", () => {
  test("removes the category and keeps the words, SDKs, chips and publisher", () => {
    const removed = withoutCategory({
      ...search,
      category: "Payments",
      publisher: "ddieruf",
    });
    expect(removed).toEqual({ ...search, publisher: "ddieruf" });
    expect(searchAddress(removed)).toBe(
      "/search?q=charge+card&sdk=Python&chip=Stripe&publisher=ddieruf",
    );
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

  test("a category counts as one filter", () => {
    expect(activeFilterCount({ ...everything, category: "Payments" })).toBe(1);
  });

  test("the category still counts while a chip stops it applying: Workflow patterns and Saga count 2", () => {
    expect(
      activeFilterCount({
        ...everything,
        chips: ["Saga"],
        category: "Workflow patterns",
      }),
    ).toBe(2);
  });

  test("each SDK, each chip, the category and the publisher all count, and words do not", () => {
    expect(
      activeFilterCount({
        words: "charge card",
        sdks: ["Python", ".NET"],
        chips: ["Stripe", "Approval"],
        category: "Payments",
        publisher: "ddieruf",
      }),
    ).toBe(6);
  });
});

describe("withoutFilters", () => {
  test("with Workflow patterns and Saga on, clears both and keeps the words", () => {
    const cleared = withoutFilters({
      words: "refund",
      sdks: [],
      chips: ["Saga"],
      category: "Workflow patterns",
    });
    expect(cleared).toEqual({ words: "refund", sdks: [], chips: [] });
    expect(activeFilterCount(cleared)).toBe(0);
    expect(searchAddress(cleared)).toBe("/search?q=refund");
  });

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
