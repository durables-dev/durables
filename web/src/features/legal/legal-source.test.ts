import { reservedHandles } from "@durables/schemas";
import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const folder = new URL("./", import.meta.url);
const components = readdirSync(folder).filter(
  (file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"),
);

test("terms, privacy and security stay on the reserved-handle list", () => {
  expect(reservedHandles.has("terms")).toBe(true);
  expect(reservedHandles.has("privacy")).toBe(true);
  expect(reservedHandles.has("security")).toBe(true);
});

test("the legal components inject no raw HTML", () => {
  expect(components).toEqual(
    expect.arrayContaining([
      "terms-page.tsx",
      "privacy-page.tsx",
      "security-page.tsx",
    ]),
  );
  for (const file of components) {
    const source = readFileSync(new URL(file, folder), "utf8");
    expect(source, file).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
  }
});
