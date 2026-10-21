import type { Page } from "@playwright/test";
import { expect, publisherInitials, publisherName, test } from "../fixtures";

// Where a provider's callback sends a finished sign-in (api: session/sign-in.ts).
const signedInPath = "/contribute";

function accountMenu(page: Page) {
  return page.getByRole("banner").getByRole("button", { name: "Account menu" });
}

function stepLink(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "Steps" })
    .getByRole("link", { name, exact: true });
}

async function openContributeFromHome(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Contribute" })
    .click();
}

async function expectOnCodeStep(page: Page) {
  await expect(page).toHaveURL("/contribute/code");
  await expect(stepLink(page, "Code")).toHaveAttribute("aria-current", "step");
  await expect(stepLink(page, "Profile & Handle (finished)")).toBeVisible();
}

test.describe("as an anonymous visitor", () => {
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
        if ([401, 403].includes(response.status()))
          refused.push(response.url());
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
          await expect(page.getByRole("main")).toContainText("Last updated");
          await expect(signIn).toHaveCount(0);
          await expectAccessible();
        });
      }

      expect(visited).toEqual(["/", "/terms", "/privacy", "/security"]);
      expect(refused).toEqual([]);
    },
  );

  test(
    "a first-time publisher signs in, chooses a handle and reaches the Code step with their initials in the header",
    { tag: "@journey" },
    async ({ page, expectAccessible, signIn, uniqueHandle }) => {
      const username = uniqueHandle("ada");
      const handle = uniqueHandle("pick");
      const field = page.getByLabel("Handle", { exact: true });

      await test.step("the signed-out header offers Contribute, which opens the sign-in step", async () => {
        await page.goto("/");
        await expect(
          page.getByRole("banner").getByRole("link", { name: "Contribute" }),
        ).toBeVisible();
        await expect(accountMenu(page)).toHaveCount(0);

        await page
          .getByRole("banner")
          .getByRole("link", { name: "Contribute" })
          .click();

        await expect(page).toHaveURL("/contribute/profile");
        await expect(
          page.getByRole("heading", {
            level: 2,
            name: "Sign in to contribute",
          }),
        ).toBeVisible();
        await expect(page).toHaveTitle("Contribute · Durables");
        await expectAccessible();
      });

      await test.step("sign in as a named identity and land on the handle step with the suggestion", async () => {
        await signIn({ name: publisherName, provider: "github", username });
        await page.goto(signedInPath);

        await expect(page).toHaveURL("/contribute/profile");
        await expect(
          page.getByRole("heading", { level: 2, name: "Choose your handle" }),
        ).toBeVisible();
        await expect(field).toHaveValue(username);
        await expect(
          page.getByText("Suggested from your GitHub account."),
        ).toBeVisible();
        await expect(accountMenu(page)).toHaveText(publisherInitials);
        await expectAccessible();
      });

      await test.step("pick an available handle and see the first-address preview", async () => {
        await field.fill(handle);

        await expect(page.getByText(`${handle} is available.`)).toBeVisible();
        await expect(
          page.getByText("Your first address will look like"),
        ).toBeVisible();
        await expect(
          page.getByText(`durables.dev/${handle}/my-activity@1.0.0`),
        ).toBeVisible();
      });

      await test.step("continue to the Code step with initials in the header", async () => {
        await page.getByRole("button", { name: "Continue" }).click();

        await expectOnCodeStep(page);
        await expect(accountMenu(page)).toHaveText(publisherInitials);
        await expectAccessible();
      });
    },
  );

  test(
    "a returning publisher with an account skips sign-in and handle and lands on the Code step",
    { tag: "@journey" },
    async ({ page, expectAccessible, seedAccount, signIn }) => {
      const account = await seedAccount();

      await openContributeFromHome(page);
      await expect(
        page.getByRole("heading", { level: 2, name: "Sign in to contribute" }),
      ).toBeVisible();

      await signIn({
        name: publisherName,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      });
      await page.goto(signedInPath);

      await expectOnCodeStep(page);
      await expect(
        page.getByRole("heading", { name: "Choose your handle" }),
      ).toHaveCount(0);
      await expect(accountMenu(page)).toHaveText(publisherInitials);
      await expectAccessible();
    },
  );
});

test(
  "a signed-in publisher with no account who comes back to Contribute finds their chosen handle",
  { tag: "@journey" },
  async ({ context, page, expectAccessible, uniqueHandle }) => {
    const handle = uniqueHandle("back");

    await test.step("choose a handle and continue to the Code step", async () => {
      await openContributeFromHome(page);
      const field = page.getByLabel("Handle", { exact: true });
      await expect(field).toBeVisible();

      await field.fill(handle);
      await expect(page.getByText(`${handle} is available.`)).toBeVisible();
      await page.getByRole("button", { name: "Continue" }).click();

      await expectOnCodeStep(page);
      await expectAccessible();
      await page.close();
    });

    await test.step("come back in a new tab and open Contribute", async () => {
      const returning = await context.newPage();
      await openContributeFromHome(returning);

      await expect(returning).toHaveURL("/contribute/profile");
      await expect(
        returning.getByRole("heading", {
          level: 2,
          name: "Choose your handle",
        }),
      ).toBeVisible();
      await expect(returning.getByLabel("Handle", { exact: true })).toHaveValue(
        handle,
      );
      // The handle is checked again on arrival.
      await expect(
        returning.getByText(`${handle} is available.`),
      ).toBeVisible();
      await expect(
        returning.getByRole("button", { name: "Continue" }),
      ).toBeEnabled();
      await expect(accountMenu(returning)).toHaveText(publisherInitials);
      await expectAccessible(returning);
    });
  },
);
