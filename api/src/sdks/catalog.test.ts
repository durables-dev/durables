import { describe, expect, it } from "vitest";
import type { FactValues } from "../checks/facts";
import { generateSnippets } from "../snippets/snippets";
import { storedSdks } from "../storage/schema";
import { type SdkProfile, sdkCatalog } from "./catalog";
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
      "PHP",
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
        sdkRegistry[".NET"],
        sdkRegistry.Python,
      ],
    ],
    [
      "another shuffled order",
      [
        sdkRegistry.PHP,
        sdkRegistry[".NET"],
        sdkRegistry.Python,
        sdkRegistry.TypeScript,
        sdkRegistry.Go,
        sdkRegistry.Java,
      ],
    ],
  ])("keeps chip order when the entries come in %s", (_order, entries) => {
    expect(names(sdkCatalog(entries))).toEqual([
      "Go",
      "Java",
      "Python",
      "TypeScript",
      ".NET",
      "PHP",
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

      expect(profile()).toEqual({
        name: sdk,
        package: display.package,
        highlightLanguage: display.highlightLanguage,
        activityFileName: display.activityFileName,
        runsAs: { sync: display.runsAs.sync, async: display.runsAs.async },
        workerRequirements: {
          sync: display.workerRequirements.sync,
          async: display.workerRequirements.async,
        },
      });
    });

    it("has a non-empty value for every field", () => {
      const { name, runsAs, workerRequirements, ...plain } = profile();

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

  it("gives Python, whose sync worker sets up a thread pool, wording that says so", () => {
    const python = sdkRegistry.Python.display;

    expect(python.runsAs.sync).toMatch(threadPool);
    expect(python.workerRequirements.sync).toMatch(threadPool);
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
