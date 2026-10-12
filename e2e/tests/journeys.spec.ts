import { expect, test } from "../fixtures";

// The legal pages are for anyone, so this journey is an anonymous visitor.
test.use({ storageState: { cookies: [], origins: [] } });

test(
  "an anonymous visitor reaches every legal page from the footer without being asked to sign in",
  { tag: "@journey" },
  async ({ page, expectAccessible }) => {
    // Every address the tab visits, and every response refusing an anonymous visitor.
    // A sign-in prompt would show up as a detour in the first or an entry in the second.
    const visited: string[] = [];
    const refused: string[] = [];
    // The router writes its own history entry on load, so one address can be reported
    // twice in a row. A repeat is the same page; only a change of address is recorded.
    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) return;
      const path = new URL(frame.url()).pathname;
      if (visited.at(-1) !== path) visited.push(path);
    });
    page.on("response", (response) => {
      if ([401, 403].includes(response.status())) refused.push(response.url());
    });

    const footer = page
      .getByRole("contentinfo")
      .getByRole("navigation", { name: "Footer" });
    const signIn = page
      .getByRole("link", { name: /sign in/i })
      .or(page.getByRole("button", { name: /sign in/i }));

    await test.step("start on the home page", async () => {
      await page.goto("/");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Temporal activities, ready to copy.",
        }),
      ).toBeVisible();
      await expect(footer.getByRole("link")).toHaveText([
        "Terms",
        "Privacy",
        "Security",
      ]);
      await expectAccessible();
    });

    for (const { name, path } of [
      { name: "Terms", path: "/terms" },
      { name: "Privacy", path: "/privacy" },
      { name: "Security", path: "/security" },
    ]) {
      await test.step(`follow the footer's ${name} link`, async () => {
        await footer.getByRole("link", { name }).click();

        await expect(page).toHaveURL(path);
        await expect(
          page.getByRole("main").getByRole("heading", { level: 1, name }),
        ).toBeVisible();
        await expect(
          page.getByRole("note", { name: "Placeholder notice" }),
        ).toBeVisible();
        await expect(signIn).toHaveCount(0);
        await expectAccessible();
      });
    }

    expect(visited).toEqual(["/", "/terms", "/privacy", "/security"]);
    expect(refused).toEqual([]);
  },
);
