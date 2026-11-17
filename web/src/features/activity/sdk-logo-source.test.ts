import { readdirSync, readFileSync } from "node:fs";
import { basename, sep } from "node:path";
import { expect, test } from "vitest";

// Web holds no SDK logo files and no mapping from an SDK to its logo (ADR 0013, API map T5).
// Each logo, its credit and its tile reach web in the SDK catalog's profile.

const web = new URL("../../../", import.meta.url);

/** Every file under a folder of web, as a `/`-separated path relative to that folder. */
function filesUnder(folder: string): string[] {
  return readdirSync(new URL(folder, web), {
    recursive: true,
    encoding: "utf8",
  })
    .map((path) => path.split(sep).join("/"))
    .filter((path) => /\.[a-z]+$/i.test(path));
}

const isImage = (path: string) =>
  /\.(svg|png|jpe?g|gif|webp|avif|ico)$/i.test(path);

/** A file name that names one of the eight SDKs, or a logo. Go counts only as a whole word. */
const namesSdkOrLogo = (path: string) =>
  /logo|typescript|python|java|dotnet|\.net|ruby|php|rust|(?<![a-z0-9])go(?![a-z0-9])/i.test(
    basename(path),
  );

test("the SDK-or-logo file name check catches SDK and logo names, and ordinary names pass", () => {
  for (const name of [
    "ruby-logo.svg",
    "Logo.png",
    "go.svg",
    "go-gopher.png",
    "TypeScript.svg",
    "python.png",
    "java.svg",
    "dotnet.svg",
    ".NET.svg",
    "php.webp",
    "rust_crab.png",
    "brand/ruby.svg",
  ]) {
    expect(namesSdkOrLogo(name), name).toBe(true);
  }
  for (const name of [
    "durables-mark-on-ink.svg",
    "og-image.png",
    "favicon.ico",
    "apple-touch-icon.png",
    "google.png",
    "cargo.svg",
    "ruby/hero.png",
  ]) {
    expect(namesSdkOrLogo(name), name).toBe(false);
  }
});

test("web holds no image named after an SDK or a logo", () => {
  const images = [
    ...filesUnder("src/")
      // Component tests' screenshots are test output, not images the site shows.
      .filter((path) => !path.includes("__screenshots__"))
      .map((path) => `src/${path}`),
    ...filesUnder("public/").map((path) => `public/${path}`),
  ].filter(isImage);
  expect(images.filter(namesSdkOrLogo)).toEqual([]);
});

test("no web source names a logo's address or carries a logo's credit", () => {
  const sources = filesUnder("src/").filter(
    (path) => /\.(tsx?|css)$/.test(path) && !/\.test\.tsx?$/.test(path),
  );
  expect(sources).toContain("features/activity/sdk-about-value.tsx");
  for (const path of sources) {
    const source = readFileSync(new URL(`src/${path}`, web), "utf8");
    expect(source, path).not.toMatch(/logo\.svg|\/api\/sdks|Matsumoto|CC BY/);
  }
});
