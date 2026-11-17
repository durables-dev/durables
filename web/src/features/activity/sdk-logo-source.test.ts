import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

// Web holds no SDK logo files and no mapping from an SDK to its logo (ADR 0013, API map T5).
// Each logo, its credit and its tile reach web in the SDK catalog's profile.

const web = new URL("../../../", import.meta.url);

/** Every file under a folder of web, as a path relative to that folder. */
function filesUnder(folder: string): string[] {
  return readdirSync(new URL(folder, web), {
    recursive: true,
    encoding: "utf8",
  }).filter((path) => /\.[a-z]+$/i.test(path));
}

const isImage = (path: string) =>
  /\.(svg|png|jpe?g|gif|webp|avif|ico)$/i.test(path);

test("web holds no image files beyond Durables' own marks and icons", () => {
  // Component tests' screenshots are test output, not images the site shows.
  expect(
    filesUnder("src/")
      .filter(isImage)
      .filter((path) => !path.includes("__screenshots__")),
  ).toEqual([]);
  expect(filesUnder("public/").filter(isImage).sort()).toEqual([
    "apple-touch-icon.png",
    "durables-mark-on-cream.svg",
    "durables-mark-on-ink.svg",
    "favicon.ico",
    "favicon.svg",
    "og-image.png",
  ]);
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
