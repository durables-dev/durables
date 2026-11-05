import type { Search } from "./search-address";
import { describe, expect, test } from "vitest";
import {
  activeFilterCount,
  everything,
  withAnySdk,
  withIntegrationToggled,
  withoutFilters,
  withSdkToggled,
} from "./search-filters";

const search: Search = {
  words: "charge card",
  sdks: ["Python"],
  integrations: ["Stripe"],
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

describe("the integration chips", () => {
  test("several integrations can be on together", () => {
    const withSlack = withIntegrationToggled(search, "Slack");
    expect(withIntegrationToggled(withSlack, "Amazon S3").integrations).toEqual(
      ["Stripe", "Slack", "Amazon S3"],
    );
  });

  test("picking an integration that is already on takes it off", () => {
    expect(withIntegrationToggled(search, "Stripe").integrations).toEqual([]);
  });

  test("toggling an integration leaves the SDKs and words alone", () => {
    const next = withIntegrationToggled(search, "Postgres");
    expect(next.words).toBe("charge card");
    expect(next.sdks).toEqual(["Python"]);
  });
});

describe("activeFilterCount", () => {
  test("no filters counts 0, whatever the words", () => {
    expect(activeFilterCount({ ...everything, words: "charge" })).toBe(0);
  });

  test("each SDK and each integration counts once", () => {
    expect(
      activeFilterCount({
        words: "",
        sdks: ["Python", ".NET"],
        integrations: ["Stripe", "Slack", "Postgres"],
      }),
    ).toBe(5);
  });

  test("a publisher counts as one filter", () => {
    expect(activeFilterCount({ ...everything, publisher: "ddieruf" })).toBe(1);
  });
});

describe("withoutFilters", () => {
  test("clears the SDKs, the integrations and the publisher, and keeps the words", () => {
    expect(withoutFilters({ ...search, publisher: "ddieruf" })).toEqual({
      words: "charge card",
      sdks: [],
      integrations: [],
    });
  });
});

test("everything has no words and no filters", () => {
  expect(everything).toEqual({ words: "", sdks: [], integrations: [] });
});
