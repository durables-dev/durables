import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";

const marks = {
  light: "/durables-mark-on-cream.svg",
  dark: "/durables-mark-on-ink.svg",
} as const;

// The site's image policy, read from the headers file the deployed site serves. The dev
// server sends no policy, so the test applies this directive to the page itself. Only
// img-src governs the marks; the full policy would also block the dev server's own inline
// script, which production does not have.
function imagePolicy(): string {
  const headers = readFileSync(
    new URL("../../web/public/_headers", import.meta.url),
    "utf8",
  );
  const policy = /Content-Security-Policy:\s*(.+)/.exec(headers)?.[1] ?? "";
  const directive = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("img-src "));
  if (!directive)
    throw new Error("No img-src directive in web/public/_headers");
  return directive;
}

async function enforceImagePolicy(page: Page) {
  const policy = imagePolicy();
  await page.route("/", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), "content-security-policy": policy },
    });
  });
  await page.addInitScript(() => {
    const blocked: string[] = [];
    Object.assign(window, { blocked });
    document.addEventListener("securitypolicyviolation", (event) => {
      blocked.push(event.blockedURI);
    });
  });
}

test("the home page shows the Durables header with the logo link", async ({
  page,
  expectAccessible,
}) => {
  await page.goto("/");

  const header = page.getByRole("banner");
  await expect(header).toBeVisible();
  await expect(
    header.getByRole("link", { name: "Durables home" }),
  ).toBeVisible();
  await expect(header.getByRole("link")).toHaveCount(1);
  await expect(header.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page).toHaveTitle("Durables");
  await expectAccessible();
});

test(
  "the logo link takes a visitor home from another address",
  { tag: "@journey" },
  async ({ page, expectAccessible }) => {
    await page.goto("/no-such-page");
    await expect(
      page.getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeVisible();
    await expectAccessible();

    await page.getByRole("link", { name: "Durables home" }).click();

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Temporal activities, ready to copy.",
      }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Durables");
    await expectAccessible();
  },
);

for (const scheme of ["light", "dark"] as const) {
  test(`under a ${scheme} colour scheme, the header loads its mark from the site's origin within the page security policy`, async ({
    page,
  }) => {
    const other = marks[scheme === "light" ? "dark" : "light"];
    const requested: string[] = [];
    page.on("request", (request) => {
      requested.push(new URL(request.url()).pathname);
    });
    await page.emulateMedia({ colorScheme: scheme });
    await enforceImagePolicy(page);

    const mark = page.waitForResponse(
      (response) => new URL(response.url()).pathname === marks[scheme],
    );
    await page.goto("/");
    const response = await mark;

    await expect(
      page.getByRole("link", { name: "Durables home" }),
    ).toBeVisible();
    expect(response.status()).toBe(200);
    expect(new URL(response.url()).origin).toBe(new URL(page.url()).origin);
    expect(requested).not.toContain(other);
    expect(
      await page.evaluate(() => (window as { blocked?: string[] }).blocked),
    ).toEqual([]);
  });
}
