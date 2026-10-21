import { expect, test } from "../fixtures";

const providers = ["GitHub", "GitLab", "Google", "Microsoft"] as const;

const formatMessage =
  "Use 3 to 39 lowercase letters, numbers and single hyphens.";
const signInFailedMessage =
  "Sign-in didn't finish. Try again, or choose another provider.";

test(
  "a handle outside the format rule, in use or reserved is refused with its message and Continue stays disabled",
  { tag: "@journey" },
  async ({ page, expectAccessible, seedAccount, uniqueHandle }) => {
    const used = await seedAccount();
    const field = page.getByLabel("Handle", { exact: true });
    const continueButton = page.getByRole("button", { name: "Continue" });

    await test.step("open the handle step as a signed-in publisher", async () => {
      await page.goto("/contribute");
      await expect(
        page.getByRole("heading", { level: 2, name: "Choose your handle" }),
      ).toBeVisible();
    });

    await test.step("an available handle enables Continue", async () => {
      const free = uniqueHandle("free");
      await field.fill(free);
      await expect(page.getByText(`${free} is available.`)).toBeVisible();
      await expect(continueButton).toBeEnabled();
    });

    await test.step("a handle outside the format rule shows the format message", async () => {
      await field.fill("a--b");
      await expect(
        page.getByText(formatMessage, { exact: true }),
      ).toBeVisible();
      await expect(continueButton).toBeDisabled();
      await expectAccessible();
    });

    await test.step("a handle in use shows that it is taken", async () => {
      await field.fill(used.handle);
      await expect(page.getByText(`${used.handle} is taken.`)).toBeVisible();
      await expect(continueButton).toBeDisabled();
    });

    await test.step("a reserved word shows that it is taken", async () => {
      await field.fill("admin");
      await expect(page.getByText("admin is taken.")).toBeVisible();
      await expect(continueButton).toBeDisabled();
    });
  },
);

test.describe("as an anonymous visitor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "the sign-in step offers four providers with no verification marks and no password field",
    { tag: "@journey" },
    async ({ page, expectAccessible }) => {
      await page.goto("/contribute");

      await expect(page).toHaveURL("/contribute/profile");
      await expect(
        page.getByRole("heading", { level: 2, name: "Sign in to contribute" }),
      ).toBeVisible();

      const choices = page
        .getByRole("list", { name: "Sign-in providers" })
        .getByRole("link");
      await expect(choices).toHaveText(
        providers.map((name) => `Continue with ${name}`),
      );
      // The verification mark is a decorative graphic hidden from assistive technology, so no
      // role locator reaches it. The buttons carry no graphic at all today.
      await expect(
        page
          .getByRole("list", { name: "Sign-in providers" })
          .locator("svg, img"),
      ).toHaveCount(0);
      await expect(page.getByText(/verif/i)).toHaveCount(0);

      await expect(page.getByRole("textbox")).toHaveCount(0);
      await expect(page.getByLabel(/password/i)).toHaveCount(0);
      // A password input has no ARIA role, so only its type can find it.
      await expect(page.locator('input[type="password"]')).toHaveCount(0);
      await expectAccessible();
    },
  );

  test(
    "a sign-in that did not finish returns to the sign-in step with the failure message",
    { tag: "@journey" },
    async ({ page, expectAccessible }) => {
      await page.goto("/contribute");
      await expect(
        page.getByRole("heading", { level: 2, name: "Sign in to contribute" }),
      ).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);

      for (const name of providers) {
        await test.step(`${name} sends the visitor back without finishing`, async () => {
          // What a provider sends back when the visitor cancels on its consent screen. The
          // consent screen itself is another origin, which these tests never reach.
          await page.goto(
            `/api/session/providers/${name.toLowerCase()}/callback?error=access_denied`,
          );

          await expect(page).toHaveURL("/contribute/profile?sign-in=failed");
          await expect(
            page.getByRole("heading", {
              level: 2,
              name: "Sign in to contribute",
            }),
          ).toBeVisible();
          await expect(page.getByRole("alert")).toHaveText(signInFailedMessage);
          await expect(
            page
              .getByRole("banner")
              .getByRole("button", { name: "Account menu" }),
          ).toHaveCount(0);
        });
      }
      await expectAccessible();
    },
  );
});
