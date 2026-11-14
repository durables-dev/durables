import { exports } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import type { SdkProfile } from "./catalog";
import { registeredSdks } from "./registry";

// Reading the SDK catalog over HTTP. Tests assert the cache header the response carries, not
// that the edge honours it (api/CONVENTIONS.md).

const shortCache = "public, max-age=0, s-maxage=60";

const getCatalog = () => exports.default.fetch("http://localhost/api/sdks");

describe("reading the SDK catalog", () => {
  test("answers every registry SDK's display profile, in chip order", async () => {
    const response = await getCatalog();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(/^application\/json/);
    const catalog = await response.json<SdkProfile[]>();
    expect(catalog.map(({ name }) => name)).toEqual([
      "Go",
      "Java",
      "Python",
      "TypeScript",
      ".NET",
    ]);
    expect(catalog).toHaveLength(registeredSdks.length);
  });

  test("answers each SDK's package, highlight language, activity file and sync and async wording", async () => {
    const catalog = await (await getCatalog()).json<SdkProfile[]>();

    for (const { sdk, display } of registeredSdks) {
      expect(catalog.find(({ name }) => name === sdk)).toEqual({
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
    }
  });

  test("carries the short-cache header, never the immutable one", async () => {
    const response = await getCatalog();

    expect(response.status).toBe(200);
    const cacheControl = response.headers.get("Cache-Control") ?? "";
    expect(cacheControl).toBe(shortCache);
    expect(cacheControl).not.toContain("immutable");
    expect(cacheControl).not.toContain("max-age=31536000");
  });

  test("carries the short-cache header on a repeated read", async () => {
    await getCatalog();

    const response = await getCatalog();

    expect(response.headers.get("Cache-Control")).toBe(shortCache);
  });
});
