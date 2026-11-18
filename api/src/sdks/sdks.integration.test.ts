import { exports } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { problemContentType } from "../http/problem";
import { type SdkProfile, sdkLogoPath } from "./catalog";
import { registeredSdks, sdkRegistry } from "./registry";
import { sdks } from "./sdk-list";

// Reading the SDK catalog over HTTP. Tests assert the cache header the response carries, not
// that the edge honours it (api/CONVENTIONS.md).

const shortCache = "public, max-age=0, s-maxage=60";

const getCatalog = () => exports.default.fetch("http://localhost/api/sdks");

const get = (path: string) => exports.default.fetch(`http://localhost${path}`);

/** Every SDK whose registry entry has a logo. */
const sdksWithLogos = sdks.filter(
  (sdk) => sdkRegistry[sdk].display.logo !== undefined,
);

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
      "Ruby",
      "PHP",
      "Rust",
    ]);
    expect(catalog).toHaveLength(registeredSdks.length);
  });

  test("answers each SDK's package, highlight language, activity file, sync and async wording and logo fields", async () => {
    const catalog = await (await getCatalog()).json<SdkProfile[]>();

    for (const { sdk, display } of registeredSdks) {
      expect(catalog.find(({ name }) => name === sdk)).toStrictEqual({
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
    }
  });

  test("gives Java's profile no logo URL, credit or light tile", async () => {
    const catalog = await (await getCatalog()).json<SdkProfile[]>();
    const java = catalog.find(({ name }) => name === "Java");

    expect(java).toBeDefined();
    expect(Object.keys(java ?? {}).sort()).toEqual([
      "activityFileName",
      "highlightLanguage",
      "name",
      "package",
      "runsAs",
      "workerRequirements",
    ]);
  });

  test("gives Rust alone the light tile and Ruby alone the credit", async () => {
    const catalog = await (await getCatalog()).json<SdkProfile[]>();

    expect(
      catalog.filter((p) => "lightTile" in p).map(({ name }) => name),
    ).toEqual(["Rust"]);
    expect(catalog.find(({ name }) => name === "Rust")?.lightTile).toBe(true);
    expect(
      catalog
        .filter((p) => "credit" in p)
        .map(({ name, credit }) => [name, credit]),
    ).toEqual([["Ruby", "Ruby logo © 2006 Yukihiro Matsumoto, CC BY-SA 2.5"]]);
  });

  test("never carries SVG markup", async () => {
    const body = await (await getCatalog()).text();

    expect(body).not.toMatch(/<svg|<\/svg>|<\?xml|xmlns/i);
  });

  test("gives each logo URL that the logo route serves", async () => {
    const catalog = await (await getCatalog()).json<SdkProfile[]>();
    const withLogos = catalog.filter(({ logoUrl }) => logoUrl !== undefined);

    expect(withLogos.map(({ name }) => name)).toEqual(sdksWithLogos);
    for (const { name, logoUrl } of withLogos) {
      const response = await get(logoUrl ?? "");

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
      expect(await response.text()).toBe(sdkRegistry[name].display.logo);
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

describe("reading an SDK's logo", () => {
  test("has a logo to serve for every SDK but Java", () => {
    expect(sdksWithLogos).toEqual(sdks.filter((sdk) => sdk !== "Java"));
  });

  test.each(sdksWithLogos)(
    "answers %s's logo as image/svg+xml with the short cache",
    async (sdk) => {
      const response = await get(sdkLogoPath(sdk));

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
      expect(response.headers.get("Cache-Control")).toBe(shortCache);
      const body = await response.text();
      expect(body).toBe(sdkRegistry[sdk].display.logo);
    },
  );

  test("answers .NET's logo at its unencoded path too", async () => {
    const response = await get("/api/sdks/.NET/logo.svg");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(sdkRegistry[".NET"].display.logo);
  });

  test("answers 404 Problem Details for Java, which has no logo", async () => {
    const response = await get("/api/sdks/Java/logo.svg");

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
    expect(await response.json()).toMatchObject({
      type: "about:blank",
      title: "Not Found",
      status: 404,
    });
  });

  test.each(["Cobol", "go", "java", "%2E%2E", "Go%2Flogo.svg"])(
    "answers 404 Problem Details for an unknown SDK, %s",
    async (name) => {
      const response = await get(`/api/sdks/${name}/logo.svg`);

      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Type")).toBe(problemContentType);
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Not Found",
        status: 404,
      });
    },
  );
});
