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

// WCAG 2.1 relative luminance and contrast ratio, for two #rrggbb colours.
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  );
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

test.each([
  ["Ink", ink],
  ["Cream", cream],
])(
  "the footer's muted text keeps AA contrast on the footer band under %s",
  (_theme, block) => {
    const text = resolve(block, "--fg-muted") ?? resolve(ink, "--fg-muted");
    const band = resolve(block, "--footer");
    expect(text).toMatch(/^#[0-9a-f]{6}$/);
    expect(band).toMatch(/^#[0-9a-f]{6}$/);
    expect(contrast(text ?? "", band ?? "")).toBeGreaterThanOrEqual(4.5);
  },
);

test.each([
  ["Ink", ink],
  ["Cream", cream],
])(
  "link-coloured text keeps AA contrast on the link surface under %s",
  (_theme, block) => {
    const text = resolve(block, "--link") ?? resolve(ink, "--link");
    const panel =
      resolve(block, "--surface-link") ?? resolve(ink, "--surface-link");
    expect(text).toMatch(/^#[0-9a-f]{6}$/);
    expect(panel).toMatch(/^#[0-9a-f]{6}$/);
    expect(contrast(text ?? "", panel ?? "")).toBeGreaterThanOrEqual(4.5);
  },
);

test.each([
  ["Ink", ink],
  ["Cream", cream],
])("the code panel stays Ink with Cream text under %s", (_theme, block) => {
  expect(
    resolve(block, "--code-background") ?? resolve(ink, "--code-background"),
  ).toBe("#0b0806");
  expect(
    resolve(block, "--code-foreground") ?? resolve(ink, "--code-foreground"),
  ).toBe("#fffbf5");
});

test("the code panel's line numbers and placeholder keep AA contrast", () => {
  const muted = resolve(ink, "--code-muted");
  const panel = resolve(ink, "--code-background");
  expect(muted).toMatch(/^#[0-9a-f]{6}$/);
  expect(panel).toMatch(/^#[0-9a-f]{6}$/);
  expect(contrast(muted ?? "", panel ?? "")).toBeGreaterThanOrEqual(4.5);
});
