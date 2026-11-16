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

test("words, several SDKs and several integrations read back exactly as built", () => {
  const search: Search = {
    words: "charge card",
    sdks: ["TypeScript", "Python"],
    integrations: ["Stripe", "Amazon S3", "Slack"],
  };

  const address = searchAddress(search);

  expect(address).toBe(
    "/search?q=charge+card&sdk=TypeScript&sdk=Python&integration=Stripe&integration=Amazon+S3&integration=Slack",
  );
  expect(readAddress(address)).toEqual(search);
});

test("an address typed by hand reads back as the values in it", () => {
  expect(
    readAddress("/search?q=send%20email&sdk=.NET&integration=Postgres"),
  ).toEqual({
    words: "send email",
    sdks: [".NET"],
    integrations: ["Postgres"],
  });
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

test("an unknown SDK and an unknown integration are dropped", () => {
  expect(
    readAddress(
      "/search?q=pay&sdk=Java&sdk=Python&sdk=python&integration=Stripe&integration=AWS+S3&integration=Twilio",
    ),
  ).toEqual({ words: "pay", sdks: ["Python"], integrations: ["Stripe"] });
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
  expect(
    readAddress("/search?q=pay&sdk=Python&integration=Stripe", []),
  ).toEqual({ words: "pay", sdks: [], integrations: ["Stripe"] });
});

test("an address holding only unknown values means no filters", () => {
  expect(readAddress("/search?sdk=PHP&integration=More%E2%80%A6")).toEqual({
    words: "",
    sdks: [],
    integrations: [],
  });
});

test("an address with no parameters means no words and no filters", () => {
  expect(readAddress("/search")).toEqual({
    words: "",
    sdks: [],
    integrations: [],
  });
});

test("an empty search builds plain /search", () => {
  expect(searchAddress()).toBe("/search");
  expect(
    searchAddress({ words: "", sdks: [], integrations: [], publisher: "" }),
  ).toBe("/search");
});

test("an empty q parameter means no words", () => {
  expect(readAddress("/search?q=").words).toBe("");
});

test("a publisher handle round trips", () => {
  const search: Search = {
    words: "",
    sdks: [],
    integrations: [],
    publisher: "ddieruf",
  };

  const address = searchAddress({ publisher: "ddieruf" });

  expect(address).toBe("/search?publisher=ddieruf");
  expect(readAddress(address)).toEqual(search);
});

test("a publisher round trips alongside words and filters", () => {
  const search: Search = {
    words: "refund",
    sdks: [".NET"],
    integrations: ["Amazon S3"],
    publisher: "acme-payments",
  };

  expect(readAddress(searchAddress(search))).toEqual(search);
});

test("a publisher that cannot be a handle is dropped", () => {
  expect(readAddress("/search?publisher=Not%20A%20Handle")).toEqual({
    words: "",
    sdks: [],
    integrations: [],
  });
});

test("a value repeated in the address counts once", () => {
  expect(
    readAddress(
      "/search?sdk=Python&sdk=Python&integration=Slack&integration=Slack",
    ),
  ).toEqual({ words: "", sdks: ["Python"], integrations: ["Slack"] });
});

test("a value repeated when building is written once", () => {
  expect(
    searchAddress({
      sdks: ["Python", "Python"],
      integrations: ["Slack", "Slack"],
    }),
  ).toBe("/search?sdk=Python&integration=Slack");
});

test('"search" is a reserved handle, so no publisher can own /search', () => {
  expect(isReservedHandle("search")).toBe(true);
});
