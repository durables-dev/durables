import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, publisherInitials, test } from "../fixtures";

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

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

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
    // Signed out, the header's right side holds the Contribute pill and no account menu.
    await expect(
      header.getByRole("link", { name: "Contribute" }),
    ).toBeVisible();
    await expect(header.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page).toHaveTitle("Durables");
    await expectAccessible();
  });
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
        name: "Temporal activities, ready to use.",
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

// The footer's links, in the order the design gives them (API map D3).
const footerLinks = [
  { name: "Terms", path: "/terms", title: "Terms · Durables" },
  { name: "Privacy", path: "/privacy", title: "Privacy · Durables" },
  { name: "Security", path: "/security", title: "Security · Durables" },
] as const;

function footerNav(page: Page) {
  return page
    .getByRole("contentinfo")
    .getByRole("navigation", { name: "Footer" });
}

test.describe("the footer", () => {
  // The legal pages are for anyone, so the footer is tested as an anonymous visitor.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("lists Terms, Privacy and Security, in that order, then GitHub", async ({
    page,
    expectAccessible,
  }) => {
    await page.goto("/");

    // The GitHub link is the mark alone, so its text is empty and its name is its label.
    await expect(footerNav(page).getByRole("link")).toHaveText([
      ...footerLinks.map((link) => link.name),
      "",
    ]);
    await expect(
      footerNav(page).getByRole("link", { name: "Durables on GitHub" }),
    ).toHaveAttribute("href", "https://github.com/durables-dev");
    await expectAccessible();
  });

  for (const { name, path, title } of footerLinks) {
    test(`the home page footer's ${name} link lands on the ${name} page`, async ({
      page,
      expectAccessible,
    }) => {
      await page.goto("/");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Temporal activities, ready to use.",
        }),
      ).toBeVisible();

      await footerNav(page).getByRole("link", { name }).click();

      await expect(page).toHaveURL(path);
      await expect(
        page.getByRole("main").getByRole("heading", { level: 1, name }),
      ).toBeVisible();
      await expect(page).toHaveTitle(title);
      await expect(page.getByRole("contentinfo")).toBeVisible();
      await expectAccessible();
    });
  }

  test("from the Terms page, the footer reaches Privacy and then Security", async ({
    page,
    expectAccessible,
  }) => {
    await page.goto("/terms");
    await expect(
      page.getByRole("main").getByRole("heading", { level: 1, name: "Terms" }),
    ).toBeVisible();

    await footerNav(page).getByRole("link", { name: "Privacy" }).click();

    await expect(page).toHaveURL("/privacy");
    await expect(
      page
        .getByRole("main")
        .getByRole("heading", { level: 1, name: "Privacy" }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Privacy · Durables");
    await expectAccessible();

    await footerNav(page).getByRole("link", { name: "Security" }).click();

    await expect(page).toHaveURL("/security");
    await expect(
      page
        .getByRole("main")
        .getByRole("heading", { level: 1, name: "Security" }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Security · Durables");
    await expectAccessible();
  });

  for (const scheme of ["dark", "light"] as const) {
    test(`on the home page under a ${scheme} colour scheme, in view, passes the accessibility scan`, async ({
      page,
      expectAccessible,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");

      const footer = page.getByRole("contentinfo");
      await footer.scrollIntoViewIfNeeded();
      await expect(footer).toBeInViewport();
      // Kisasa in the credit, the legal pages, then GitHub.
      await expect(footer.getByRole("link")).toHaveCount(
        footerLinks.length + 2,
      );
      await expectAccessible();
    });
  }
});

test(
  "signing out from the initials menu returns the header to its signed-out state",
  { tag: "@journey" },
  async ({ page, expectAccessible }) => {
    const header = page.getByRole("banner");
    const initials = header.getByRole("button", { name: "Account menu" });

    await test.step("the signed-in header shows Contribute and the initials", async () => {
      await page.goto("/");
      await expect(initials).toHaveText(publisherInitials);
      await expect(
        header.getByRole("link", { name: "Contribute" }),
      ).toBeVisible();
    });

    await test.step("the initials menu holds one item, Sign out", async () => {
      await initials.click();

      const menu = page.getByRole("menu", { name: "Account" });
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("menuitem")).toHaveText(["Sign out"]);
      await expectAccessible();
    });

    await test.step("choosing Sign out returns the header to signed out", async () => {
      await page.getByRole("menuitem", { name: "Sign out" }).click();

      await expect(initials).toHaveCount(0);
      await expect(
        header.getByRole("link", { name: "Contribute" }),
      ).toBeVisible();
      await expect(header.getByRole("button")).toHaveCount(0);
    });

    await test.step("the session has ended, so a reload stays signed out", async () => {
      await page.reload();

      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(
        header.getByRole("link", { name: "Contribute" }),
      ).toBeVisible();
      await expect(header.getByRole("button")).toHaveCount(0);
      await expectAccessible();
    });
  },
);
