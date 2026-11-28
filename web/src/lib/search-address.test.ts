import { isReservedHandle } from "@durables/schemas";
import { expect, test } from "vitest";
import type { SdkName } from "./sdk-catalog";
import { readSearch, searchAddress, type Search } from "./search-address";

/** The SDK names the catalog lists, as the /search route passes them. */
const catalogSdks: SdkName[] = ["Python", "TypeScript", ".NET"];

/** Reads the search back from an address, as the /search route does. */
function readAddress(address: string, sdks = catalogSdks): Search {
  const url = new URL(address, "https://durables.test");
  expect(url.pathname).toBe("/search");
  return readSearch(url.searchParams, sdks);
}

test("words, several SDKs and several chips read back exactly as built", () => {
  const search: Search = {
    words: "charge card",
    sdks: ["TypeScript", "Python"],
    chips: ["Stripe", "Amazon S3", "Saga"],
  };

  const address = searchAddress(search);

  expect(address).toBe(
    "/search?q=charge+card&sdk=TypeScript&sdk=Python&chip=Stripe&chip=Amazon+S3&chip=Saga",
  );
  expect(readAddress(address)).toEqual(search);
});

test("an address typed by hand reads back as the values in it", () => {
  expect(readAddress("/search?q=send%20email&sdk=.NET&chip=Postgres")).toEqual({
    words: "send email",
    sdks: [".NET"],
    chips: ["Postgres"],
  });
});

test("a repeated chip parameter reads as each chip, integrations and patterns alike", () => {
  expect(
    readAddress("/search?chip=Slack&chip=Polling&chip=Anthropic+Claude").chips,
  ).toEqual(["Slack", "Polling", "Anthropic Claude"]);
});

test("chip names are read ignoring case, as the site names them", () => {
  expect(readAddress("/search?chip=stripe").chips).toEqual(["Stripe"]);
  expect(
    readAddress("/search?chip=AMAZON+S3&chip=xai+grok&chip=sAgA").chips,
  ).toEqual(["Amazon S3", "xAI Grok", "Saga"]);
});

test("SDK names are read ignoring case, as the catalog names them", () => {
  expect(
    readAddress("/search?sdk=python&sdk=typescript&sdk=.net").sdks,
  ).toEqual(["Python", "TypeScript", ".NET"]);
});

test("a category name is read ignoring case, as the site names it", () => {
  expect(readAddress("/search?category=payments").category).toBe("Payments");
  expect(readAddress("/search?category=DATA+AND+STORAGE").category).toBe(
    "Data and storage",
  );
});

test("names differing only by case count once", () => {
  expect(
    readAddress("/search?sdk=Python&sdk=python&chip=Slack&chip=slack"),
  ).toEqual({ words: "", sdks: ["Python"], chips: ["Slack"] });
});

test.each([
  ["spaces", "  charge   a card  "],
  ["ampersands and equals signs", "S3 & Postgres = sync?a=b&c"],
  ["plus and percent signs", "100% + tax #1 / 2"],
  ["non-ASCII characters", "café 日本語 naïve 🚀"],
  ["quotes and angle brackets", `"<script>" 'x'`],
])("words with %s are unchanged by a round trip", (_, words) => {
  expect(readAddress(searchAddress({ words })).words).toBe(words);
});

test("an unknown SDK, an unknown chip and an unknown category are dropped", () => {
  expect(
    readAddress(
      "/search?q=pay&sdk=Java&sdk=Python&chip=Stripe&chip=AWS+S3&chip=Nonsense&category=Shipping",
    ),
  ).toEqual({ words: "pay", sdks: ["Python"], chips: ["Stripe"] });
});

test("an unknown chip alone is dropped", () => {
  expect(readAddress("/search?chip=Nonsense")).toEqual({
    words: "",
    sdks: [],
    chips: [],
  });
});

test("a category read alone is held and turns no chip on", () => {
  expect(readAddress("/search?category=Payments")).toEqual({
    words: "",
    sdks: [],
    chips: [],
    category: "Payments",
  });
});

test("the first of several categories is read and the rest are ignored", () => {
  expect(
    readAddress("/search?category=Payments&category=Messaging").category,
  ).toBe("Payments");
});

test("when the first of several categories is unknown, no category is read", () => {
  expect(
    readAddress("/search?category=Shipping&category=Payments").category,
  ).toBeUndefined();
});

test("the old integration parameter is not read", () => {
  expect(readAddress("/search?integration=Stripe")).toEqual({
    words: "",
    sdks: [],
    chips: [],
  });
});

test("a category and a chip in the address are both kept", () => {
  expect(readAddress("/search?category=Payments&chip=Stripe")).toEqual({
    words: "",
    sdks: [],
    chips: ["Stripe"],
    category: "Payments",
  });
});

test("writing back a search with chips and a category repeats chip and keeps category", () => {
  const search: Search = {
    words: "refund",
    sdks: [],
    chips: ["Stripe", "Saga"],
    category: "Payments",
  };

  const address = searchAddress(search);

  expect(address).toBe(
    "/search?q=refund&chip=Stripe&chip=Saga&category=Payments",
  );
  expect(readAddress(address)).toEqual(search);
});

test("a category alone writes plain category and nothing else", () => {
  expect(searchAddress({ category: "Workflow patterns" })).toBe(
    "/search?category=Workflow+patterns",
  );
});

test("an SDK is kept only when the catalog lists it", () => {
  const address = "/search?sdk=.NET&sdk=Python&sdk=TypeScript";

  expect(readAddress(address, ["Python"]).sdks).toEqual(["Python"]);
  expect(readAddress(address, [".NET", "TypeScript"]).sdks).toEqual([
    ".NET",
    "TypeScript",
  ]);
});

test("with no catalog to hand, every SDK in the address is dropped", () => {
  expect(readAddress("/search?q=pay&sdk=Python&chip=Stripe", [])).toEqual({
    words: "pay",
    sdks: [],
    chips: ["Stripe"],
  });
});

test("an address holding only unknown values means no filters", () => {
  expect(
    readAddress("/search?sdk=PHP&chip=More%E2%80%A6&category=More"),
  ).toEqual({
    words: "",
    sdks: [],
    chips: [],
  });
});

test("an address with no parameters means no words and no filters", () => {
  expect(readAddress("/search")).toEqual({
    words: "",
    sdks: [],
    chips: [],
  });
});

test("an empty search builds plain /search", () => {
  expect(searchAddress()).toBe("/search");
  expect(searchAddress({ words: "", sdks: [], chips: [], publisher: "" })).toBe(
    "/search",
  );
});

test("an empty q parameter means no words", () => {
  expect(readAddress("/search?q=").words).toBe("");
});

test("a publisher handle round trips", () => {
  const search: Search = {
    words: "",
    sdks: [],
    chips: [],
    publisher: "ddieruf",
  };

  const address = searchAddress({ publisher: "ddieruf" });

  expect(address).toBe("/search?publisher=ddieruf");
  expect(readAddress(address)).toEqual(search);
});

test("a publisher round trips alongside words, filters and a category", () => {
  const search: Search = {
    words: "refund",
    sdks: [".NET"],
    chips: ["Amazon S3"],
    category: "Data and storage",
    publisher: "acme-payments",
  };

  expect(readAddress(searchAddress(search))).toEqual(search);
});

test("a publisher that cannot be a handle is dropped", () => {
  expect(readAddress("/search?publisher=Not%20A%20Handle")).toEqual({
    words: "",
    sdks: [],
    chips: [],
  });
});

test("a value repeated in the address counts once", () => {
  expect(
    readAddress("/search?sdk=Python&sdk=Python&chip=Slack&chip=Slack"),
  ).toEqual({ words: "", sdks: ["Python"], chips: ["Slack"] });
});

test("a value repeated when building is written once", () => {
  expect(
    searchAddress({
      sdks: ["Python", "Python"],
      chips: ["Slack", "Slack"],
    }),
  ).toBe("/search?sdk=Python&chip=Slack");
});

test('"search" is a reserved handle, so no publisher can own /search', () => {
  expect(isReservedHandle("search")).toBe(true);
});
