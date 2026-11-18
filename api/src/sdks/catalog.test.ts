import { describe, expect, it } from "vitest";
import type { FactValues } from "../checks/facts";
import { generateSnippets } from "../snippets/snippets";
import { storedSdks } from "../storage/schema";
import { type SdkProfile, sdkCatalog, sdkLogoPath } from "./catalog";
import { registeredSdks, sdkRegistry } from "./registry";
import { type Sdk, sdks } from "./sdk-list";

/** The catalog's SDK names, in the order it lists them. */
const names = (catalog: readonly SdkProfile[]) =>
  catalog.map(({ name }) => name);

/** The registry's SDKs in chip order, worked out independently of the catalog. */
const inChipOrder = (sdkList: readonly Sdk[]) =>
  storedSdks.filter((sdk): sdk is Sdk =>
    (sdkList as readonly string[]).includes(sdk),
  );

/** Mentions a thread pool, in prose or in code. */
const threadPool = /thread[ _]?pool/i;

/** A sync activity's facts, enough to generate an SDK's worker. */
const syncFacts = (sdk: Sdk): FactValues => ({
  sdk,
  activity: { name: "ChargeCard", line: 1 },
  input: "ChargeRequest",
  output: "ChargeResult",
  runsAs: "sync",
  nonRetryableErrors: [],
  configurationRead: [],
  dependencies: [],
  heartbeats: [],
});

describe("the SDK catalog", () => {
  it("lists every SDK in the registry, in chip order", () => {
    const catalog = sdkCatalog(registeredSdks);

    expect(names(catalog)).toEqual(inChipOrder(sdks));
    expect([...names(catalog)].sort()).toEqual([...sdks].sort());
    expect(names(catalog)).toEqual([
      "Go",
      "Java",
      "Python",
      "TypeScript",
      ".NET",
      "Ruby",
      "PHP",
      "Rust",
    ]);
  });

  it.each([
    ["the registry's order", [...registeredSdks]],
    ["reverse order", [...registeredSdks].reverse()],
    [
      "a shuffled order",
      [
        sdkRegistry.TypeScript,
        sdkRegistry.Go,
        sdkRegistry.PHP,
        sdkRegistry.Java,
        sdkRegistry.Ruby,
        sdkRegistry.Rust,
        sdkRegistry[".NET"],
        sdkRegistry.Python,
      ],
    ],
    [
      "another shuffled order",
      [
        sdkRegistry.Rust,
        sdkRegistry.PHP,
        sdkRegistry[".NET"],
        sdkRegistry.Python,
        sdkRegistry.TypeScript,
        sdkRegistry.Go,
        sdkRegistry.Java,
        sdkRegistry.Ruby,
      ],
    ],
  ])("keeps chip order when the entries come in %s", (_order, entries) => {
    expect(names(sdkCatalog(entries))).toEqual([
      "Go",
      "Java",
      "Python",
      "TypeScript",
      ".NET",
      "Ruby",
      "PHP",
      "Rust",
    ]);
  });

  it("names no thread pool in Go's sync Runs as or its Configure wording", () => {
    const go = sdkRegistry.Go.display;

    expect(go.runsAs.sync).not.toMatch(threadPool);
    expect(go.workerRequirements.sync).not.toMatch(threadPool);
  });

  it("does not reorder the entries it is given", () => {
    const entries = [...registeredSdks].reverse();
    const before = [...entries];

    sdkCatalog(entries);

    expect(entries).toEqual(before);
  });

  describe.each(sdks)("the %s profile", (sdk) => {
    const profile = () => {
      const found = sdkCatalog(registeredSdks).find(({ name }) => name === sdk);
      if (found === undefined) {
        throw new Error(`The catalog has no ${sdk} profile.`);
      }
      return found;
    };

    it("carries every display field from the registry entry, and nothing else", () => {
      const { display } = sdkRegistry[sdk];

      // toStrictEqual, so a field the catalog should not carry fails here even when it is
      // undefined.
      expect(profile()).toStrictEqual({
        name: sdk,
        package: display.package,
        highlightLanguage: display.highlightLanguage,
        activityFileName: display.activityFileName,
        runsAs: { sync: display.runsAs.sync, async: display.runsAs.async },
        workerRequirements: {
          sync: display.workerRequirements.sync,
          async: display.workerRequirements.async,
        },
        ...(display.logo === undefined ? {} : { logoUrl: sdkLogoPath(sdk) }),
        ...(display.credit === undefined ? {} : { credit: display.credit }),
        ...(display.lightTile === undefined
          ? {}
          : { lightTile: display.lightTile }),
      });
    });

    it("has a non-empty value for every field", () => {
      const { name, runsAs, workerRequirements, lightTile, ...plain } =
        profile();

      expect(name).toBe(sdk);
      for (const value of [
        ...Object.values(plain),
        runsAs.sync,
        runsAs.async,
        workerRequirements.sync,
        workerRequirements.async,
      ]) {
        expect(value.trim()).not.toBe("");
      }
      expect([undefined, true]).toContain(lightTile);
    });

    it("publishes its logo as the logo route's address, never as SVG markup", () => {
      const { logoUrl } = profile();

      if (sdkRegistry[sdk].display.logo === undefined) {
        expect(logoUrl).toBeUndefined();
      } else {
        expect(logoUrl).toBe(`/api/sdks/${encodeURIComponent(sdk)}/logo.svg`);
      }
      expect(JSON.stringify(profile())).not.toMatch(/<svg|<\/svg>|<\?xml/i);
    });

    it("words sync and async differently, in Runs as and in Worker requirements", () => {
      const { runsAs, workerRequirements } = profile();

      expect(runsAs.sync).not.toBe(runsAs.async);
      expect(workerRequirements.sync).not.toBe(workerRequirements.async);
    });

    it("mentions a thread pool for a sync activity only when its generated worker sets one up", () => {
      const { runsAs, workerRequirements } = profile();
      const generated = generateSnippets(syncFacts(sdk), {
        handle: "kris",
        name: "charge-card",
        version: "1.0.0",
      })
        .map(({ code }) => code)
        .join("\n");
      const setsUpThreadPool = threadPool.test(generated);

      expect(threadPool.test(runsAs.sync)).toBe(setsUpThreadPool);
      expect(threadPool.test(workerRequirements.sync)).toBe(setsUpThreadPool);
    });

    it("never mentions a thread pool for an async activity", () => {
      const { runsAs, workerRequirements } = profile();

      expect(runsAs.async).not.toMatch(threadPool);
      expect(workerRequirements.async).not.toMatch(threadPool);
    });
  });

  describe("the logo fields", () => {
    const catalog = () => sdkCatalog(registeredSdks);

    it("gives every SDK but Java a logo URL", () => {
      expect(
        catalog()
          .filter(({ logoUrl }) => logoUrl !== undefined)
          .map(({ name }) => name),
      ).toEqual(["Go", "Python", "TypeScript", ".NET", "Ruby", "PHP", "Rust"]);
    });

    it("gives Rust alone the light tile", () => {
      expect(
        catalog()
          .filter((profile) => "lightTile" in profile)
          .map(({ name, lightTile }) => [name, lightTile]),
      ).toEqual([["Rust", true]]);
    });

    it("gives Ruby alone the credit, with the exact text", () => {
      expect(
        catalog()
          .filter((profile) => "credit" in profile)
          .map(({ name, credit }) => [name, credit]),
      ).toEqual([
        ["Ruby", "Ruby logo © 2006 Yukihiro Matsumoto, CC BY-SA 2.5"],
      ]);
    });

    it("gives Java no logo URL, credit or light tile", () => {
      const java = catalog().find(({ name }) => name === "Java");

      expect(java).toBeDefined();
      expect(Object.keys(java ?? {})).not.toContain("logoUrl");
      expect(Object.keys(java ?? {})).not.toContain("credit");
      expect(Object.keys(java ?? {})).not.toContain("lightTile");
    });

    it("never carries SVG markup", () => {
      const json = JSON.stringify(catalog());

      expect(json).not.toMatch(/<svg|<\/svg>|<\?xml|xmlns/i);
      for (const { display } of registeredSdks) {
        if (display.logo !== undefined) {
          expect(json).not.toContain(display.logo);
        }
      }
    });

    it("addresses each SDK's logo under its own name, encoded for a path", () => {
      expect(sdkLogoPath("Go")).toBe("/api/sdks/Go/logo.svg");
      expect(sdkLogoPath(".NET")).toBe("/api/sdks/.NET/logo.svg");
      expect(sdkLogoPath("TypeScript")).toBe("/api/sdks/TypeScript/logo.svg");
    });
  });

  it("gives Python, whose sync worker sets up a thread pool, wording that says so", () => {
    const python = sdkRegistry.Python.display;

    expect(python.runsAs.sync).toMatch(threadPool);
    expect(python.workerRequirements.sync).toMatch(threadPool);
  });

  it("tells Ruby, whose worker sets up nothing, that it needs no special setup, with no thread pool", () => {
    const ruby = sdkRegistry.Ruby.display;

    for (const wording of [
      ruby.runsAs.sync,
      ruby.runsAs.async,
      ruby.workerRequirements.sync,
      ruby.workerRequirements.async,
    ]) {
      expect(wording).not.toMatch(threadPool);
    }
    expect(ruby.workerRequirements.sync).toContain("no special setup");
    expect(ruby.workerRequirements.async).toContain("no special setup");
  });

  it("names no thread pool in .NET's sync Runs as or its Configure wording", () => {
    const dotnet = sdkRegistry[".NET"].display;

    expect(dotnet.runsAs.sync).not.toMatch(threadPool);
    expect(dotnet.workerRequirements.sync).not.toMatch(threadPool);
    expect(dotnet.workerRequirements.sync).toBe(
      "This is a synchronous activity. The .NET SDK runs it for you, so your worker needs no special setup.",
    );
  });
});
