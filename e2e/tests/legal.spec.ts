import { expect, test } from "../fixtures";

const legalPages = [
  { path: "/terms", heading: "Terms", title: "Terms · Durables" },
  { path: "/privacy", heading: "Privacy", title: "Privacy · Durables" },
  { path: "/security", heading: "Security", title: "Security · Durables" },
] as const;

// The legal pages are for anyone, so every test here is an anonymous visitor.
test.use({ storageState: { cookies: [], origins: [] } });

for (const { path, heading, title } of legalPages) {
  test(`opening ${path} directly shows the ${heading} page inside the frame`, async ({
    page,
    expectAccessible,
  }) => {
    await page.goto(path);

    await expect(
      page.getByRole("main").getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Durables home" }),
    ).toBeVisible();
    await expect(page.getByRole("main")).toContainText("Last updated");
    await expect(
      page.getByRole("note", { name: "Placeholder notice" }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);
    await expect(page).toHaveTitle(title);
    await expectAccessible();
  });

  test(`${path} passes the accessibility scan under a light colour scheme`, async ({
    page,
    expectAccessible,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(path);

    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
    await expectAccessible();
  });
}
