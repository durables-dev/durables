import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import {
  expect,
  publisherInitials,
  publisherName,
  sample,
  test,
} from "../fixtures";

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
            name: "Temporal activities, ready to use.",
          }),
        ).toBeVisible();
        // The legal pages, then GitHub, which is the mark alone and so has no text.
        await expect(footer.getByRole("link")).toHaveText([
          "Terms",
          "Privacy",
          "Security",
          "",
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
  test(
    "an activity consumer opens a result's activity page and follows its integration and publisher links back into results",
    { tag: "@journey" },
    async ({ page, expectAccessible, publishListing, uniqueWord }) => {
      const title = `Upload report ${uniqueWord()}`;
      const listing = await publishListing({
        code: sample("typescript"),
        title,
        name: "report-upload",
        description: "Uploads a CSV report to S3 and returns where it is.",
      });
      const main = page.getByRole("main");
      const result = main.getByRole("article", { name: title, exact: true });
      const about = page.getByRole("region", { name: "About" });
      const publisher = page.getByRole("region", { name: "Publisher" });
      const publisherResults = `/search?publisher=${listing.handle}`;

      async function expectOnActivityPage() {
        await expect(page).toHaveURL(`/${listing.address}`);
        await expect(
          main.getByRole("heading", { level: 1, name: title }),
        ).toBeVisible();
        await expect(
          main.getByText(listing.address, { exact: true }),
        ).toBeVisible();
      }

      async function expectPublisherResults() {
        await expect(page).toHaveURL(publisherResults);
        await expect(main.getByText(/ · sorted by /)).toHaveText(
          "1 activity · sorted by newest",
        );
        await expect(main.getByRole("article")).toHaveCount(1);
        await expect(result).toBeVisible();
      }

      await test.step("search home for the title and press View on its card", async () => {
        await page.goto("/");
        await page
          .getByRole("searchbox", { name: "Search activities" })
          .fill(title);
        await page.getByRole("button", { name: "Search", exact: true }).click();
        await expect(result).toBeVisible();

        await result.getByRole("link", { name: "View" }).click();

        await expectOnActivityPage();
        await expectAccessible();
      });

      await test.step("the About card's Amazon S3 link opens results for Amazon S3", async () => {
        await about
          .getByRole("link", { name: "Amazon S3", exact: true })
          .click();

        await expect(page).toHaveURL("/search?integration=Amazon+S3");
        await expect(
          page
            .getByRole("complementary", { name: "Filters" })
            .getByRole("group", { name: "Integrates with" })
            .getByRole("button", { name: "Amazon S3" }),
        ).toHaveAttribute("aria-pressed", "true");
        await expect(main.getByText(/ · sorted by /)).toHaveText(
          /^[\d,]+ activit(y|ies) · sorted by newest$/,
        );
        // Newest first, and published moments ago.
        await expect(result).toBeVisible();
        await expectAccessible();
      });

      await test.step("Back returns to the activity page", async () => {
        await page.goBack();

        await expectOnActivityPage();
      });

      await test.step("Search all activities by the publisher opens their activities", async () => {
        await publisher
          .getByRole("link", {
            name: `Search all activities by ${listing.handle}`,
          })
          .click();

        await expectPublisherResults();
        await expectAccessible();
      });

      await test.step("the Publisher card's handle opens the same results", async () => {
        await page.goBack();
        await expectOnActivityPage();

        await publisher
          .getByRole("link", { name: listing.handle, exact: true })
          .click();

        await expectPublisherResults();
      });
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

test(
  "a first-time publisher describes a checked activity, confirms the six terms, publishes it and opens the live listing",
  { tag: "@journey" },
  async ({ page, expectAccessible, signIn, uniqueHandle, paste }) => {
    const handle = uniqueHandle("first");
    const code = readFileSync(
      new URL("../samples/python.txt", import.meta.url),
      "utf8",
    );
    const title = "Post slack message";
    const name = "post-slack-message";
    const description =
      "Posts a message to a Slack channel and returns its reference.";
    const address = `${handle}/${name}@1.0.0`;
    const editor = page.getByLabel("Paste your file", { exact: true });
    const continueButton = page.getByRole("button", { name: "Continue" });
    const publishButton = page.getByRole("button", { name: "Publish 1.0.0" });
    const confirmations = page
      .getByRole("group", { name: "Before you publish, confirm each of these" })
      .getByRole("checkbox");
    const published = page.getByRole("region", { name: "Published" });

    await test.step("sign in as a new publisher, choose a handle and reach the Code step", async () => {
      await signIn({
        name: publisherName,
        provider: "github",
        username: handle,
      });
      await openContributeFromHome(page);
      await expect(page.getByLabel("Handle", { exact: true })).toHaveValue(
        handle,
      );
      await expect(page.getByText(`${handle} is available.`)).toBeVisible();
      await continueButton.click();

      await expectOnCodeStep(page);
    });

    await test.step("paste the activity and go through Detected to Details", async () => {
      await paste(editor, code);
      await expect(
        page.getByText(/^✓ Found post_slack_message \(Python\)/),
      ).toBeVisible();
      await continueButton.click();
      await expect(page).toHaveURL("/contribute/detected");
      await continueButton.click();

      await expect(page).toHaveURL("/contribute/details");
      await expect(stepLink(page, "Details")).toHaveAttribute(
        "aria-current",
        "step",
      );
    });

    await test.step("fill Details and see the address the listing will have", async () => {
      await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
        title,
      );
      await expect(
        page.getByLabel("Name in the address", { exact: true }),
      ).toHaveValue(name);
      await expect(page.getByLabel("Version", { exact: true })).toHaveValue(
        "1.0.0",
      );
      await expect(page.getByText(`durables.dev/${address}`)).toBeVisible();
      await expect(continueButton).toBeDisabled();

      await page
        .getByLabel("One-line description", { exact: true })
        .fill(description);

      await expect(continueButton).toBeEnabled();
      await expectAccessible();
      await continueButton.click();
    });

    await test.step("review the preview card and check all six confirmations", async () => {
      await expect(page).toHaveURL("/contribute/review");
      const card = page.getByRole("region", { name: "Listing preview" });
      await expect(card.getByRole("heading", { name: title })).toBeVisible();
      await expect(card).toContainText(address);
      await expect(card).toContainText(description);
      await expect(confirmations).toHaveCount(6);
      await expect(publishButton).toBeDisabled();
      await expectAccessible();

      for (const box of await confirmations.all()) {
        await box.check();
      }

      await expect(publishButton).toBeEnabled();
    });

    await test.step("publish and see the live address and the new account", async () => {
      await publishButton.click();

      await expect(page).toHaveURL("/contribute/published");
      await expect(
        published.getByRole("heading", { level: 2, name: "Published" }),
      ).toBeVisible();
      await expect(published.getByText(/is live\./)).toHaveText(
        `${address} is live. Your Durables account, ${handle}, now exists.`,
      );
      await expect(page.getByRole("navigation", { name: "Steps" })).toHaveCount(
        0,
      );
      await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
      await expectAccessible();
    });

    await test.step("view the listing at its address", async () => {
      await published.getByRole("link", { name: "View the listing" }).click();

      await expect(page).toHaveURL(`/${address}`);
      await expect(
        page.getByRole("main").getByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
      await expect(page.getByRole("main")).toContainText(address);
      await expect(page.getByRole("main")).toContainText(description);
      await expectAccessible();
    });

    await test.step("open Contribute again and start a new activity at the Code step", async () => {
      await page
        .getByRole("banner")
        .getByRole("link", { name: "Contribute" })
        .click();

      await expectOnCodeStep(page);
      await expect(editor).toHaveValue("");
      await expect(continueButton).toBeDisabled();
      await expectAccessible();
    });
  },
);

test(
  "a publisher updates their listing's description from the publisher bar and sees it on the page, after a reload, on an older version's page and on their search result card",
  { tag: "@journey" },
  async ({
    page,
    expectAccessible,
    publishOwnListing,
    seedVersion,
    uniqueWord,
  }) => {
    const word = uniqueWord();
    const title = `Post slack message ${word}`;
    const before = "Posts a message to a Slack channel.";
    const after =
      "Posts a message to a Slack channel and returns its reference.";
    const listing = await publishOwnListing({
      code: sample("python"),
      title,
      name: "post-slack-message",
      description: before,
    });
    // The card links to the highest version, so the publisher lands on 1.1.0 and 1.0.0 is the
    // older one.
    const latest = await seedVersion(listing, "1.1.0");
    const older = listing.address;

    const main = page.getByRole("main");
    const resultCard = main.getByRole("article", { name: title, exact: true });
    const bar = main.getByRole("region", { name: "Your listing controls" });
    const dialog = page.getByRole("dialog", { name: "Update listing" });
    const field = dialog.getByLabel("One-line description", { exact: true });
    const fixedNote = dialog.getByText(
      "Can't change here: the code, its detected facts and its address. Those are fixed when a version is published.",
      { exact: true },
    );

    await test.step("find the listing in search results with its description", async () => {
      await page.goto(`/search?q=${word}`);

      await expect(resultCard).toContainText(before);
      await expectAccessible();
    });

    await test.step("open the listing and see the publisher bar with Update", async () => {
      await resultCard.getByRole("link", { name: "View" }).click();

      await expect(page).toHaveURL(`/${latest}`);
      await expect(
        main.getByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
      await expect(main.getByText(before, { exact: true })).toBeVisible();
      await expect(
        bar.getByText(
          "You published this activity. Only you see these controls.",
          { exact: true },
        ),
      ).toBeVisible();
      // The closed dialog inside the bar is hidden, so Update is the bar's only button.
      await expect(bar.getByRole("button")).toHaveText(["Update"]);
      await expectAccessible();
    });

    await test.step("open the Update dialog and see the description and what can't be changed", async () => {
      await bar.getByRole("button", { name: "Update" }).click();

      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("heading", { level: 2, name: "Update listing" }),
      ).toBeVisible();
      await expect(dialog).toHaveAccessibleDescription(
        "This changes on every version's page right away. Anything about how the activity behaves needs a new version instead.",
      );
      await expect(field).toHaveValue(before);
      await expect(
        dialog.getByText(
          `Shown on search results. ${160 - before.length} characters left.`,
          { exact: true },
        ),
      ).toBeVisible();
      await expect(fixedNote).toBeVisible();
      await expect(fixedNote.getByRole("link")).toHaveCount(0);
      await expectAccessible();
    });

    await test.step("change the description, save, and see it on the page as the dialog closes", async () => {
      await field.fill(after);
      await dialog.getByRole("button", { name: "Save changes" }).click();

      await expect(dialog).toBeHidden();
      await expect(main.getByText(after, { exact: true })).toBeVisible();
      await expect(main.getByText(before, { exact: true })).toHaveCount(0);
      await expect(page.getByText(/^Saved/)).toHaveCount(0);
      await expectAccessible();
    });

    await test.step("go back to search in the same visit and see the new text on the card", async () => {
      await page.goBack();

      await expect(page).toHaveURL(`/search?q=${word}`);
      await expect(resultCard).toContainText(after);
      await expect(resultCard).not.toContainText(before);
    });

    await test.step("reload the search results and still see the new text on the card", async () => {
      await page.reload();

      await expect(resultCard).toContainText(after);
      await expect(resultCard).not.toContainText(before);
    });

    await test.step("reload the listing and still see the new description", async () => {
      await page.goto(`/${latest}`);
      await page.reload();

      await expect(
        main.getByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
      await expect(main.getByText(after, { exact: true })).toBeVisible();
      await expect(main.getByText(before, { exact: true })).toHaveCount(0);
    });

    await test.step("open the older version's page and see the new description", async () => {
      await page.goto(`/${older}`);

      await expect(
        main.getByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
      await expect(main.getByText(older, { exact: true })).toBeVisible();
      await expect(main.getByText(after, { exact: true })).toBeVisible();
      await expect(main.getByText(before, { exact: true })).toHaveCount(0);
      await expectAccessible();
    });
  },
);
