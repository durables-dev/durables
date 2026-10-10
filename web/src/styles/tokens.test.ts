import { expect, test } from "vitest";
import { readFileSync } from "node:fs";

// The browser follows prefers-color-scheme, which a test cannot switch, so this reads the
// two theme blocks of tokens.css and resolves each value through the palette.
const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const [ink = "", cream = ""] = tokens.split(
  "@media (prefers-color-scheme: light)",
);

function declared(block: string, name: string): string | undefined {
  return new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim();
}

function resolve(block: string, name: string): string | undefined {
  const value = declared(block, name);
  const reference = value && /^var\((--[\w-]+)\)$/.exec(value)?.[1];
  return reference ? resolve(ink, reference) : value?.toLowerCase();
}

test("the footer band is #17120D on Ink", () => {
  expect(resolve(ink, "--footer")).toBe("#17120d");
});

test("the footer band is Sand #F1E8DD on Cream", () => {
  expect(resolve(cream, "--footer")).toBe("#f1e8dd");
});

test("the surface token is unchanged", () => {
  expect(resolve(ink, "--surface")).toBe("#1a1512");
  expect(resolve(cream, "--surface")).toBe("#f1e8dd");
});
