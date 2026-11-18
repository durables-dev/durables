import type { Locator, Page } from "@playwright/test";
import {
  expect,
  publisherInitials,
  sample,
  test,
  type PublishDetails,
} from "../fixtures";

const python = sample("python");

/** The Slack activity in python.txt, as its publisher describes it. */
const slackListing: PublishDetails = {
  code: python,
  title: "Post slack message",
  name: "post-slack-message",
  description: "Posts a message to a Slack channel and returns its reference.",
};

/** The Implement files for a Python activity, in the order their tabs show. */
const pythonFiles = ["activities.py", "workflows.py", "worker.py", "start.py"];

/** A description of the Slack activity before the publisher corrects it. */
const savedDescription = "Posts a message to a Slack channel.";

const barText = "You published this activity. Only you see these controls.";

const noReviewNote =
  "Durables doesn't review published code. You are responsible for what you run.";

function main(page: Page) {
  return page.getByRole("main");
}

function sectionLink(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "Page sections" })
    .getByRole("link", { name, exact: true });
}

function sectionHeading(page: Page, name: string) {
  return main(page).getByRole("heading", { level: 2, name, exact: true });
}

function codeBlock(page: Page, label: string) {
  return main(page).getByRole("region", { name: label, exact: true });
}

function copyButton(page: Page, label: string) {
  return main(page).getByRole("button", { name: `Copy ${label}`, exact: true });
}

/**
 * The header's account menu. It shows once the session read answers, in the same render that
 * decides the publisher bar, so a test waits for it before asserting there is no bar.
 */
function accountMenu(page: Page) {
  return page.getByRole("banner").getByRole("button", { name: "Account menu" });
}

/** Waits for the page's read of the session, which decides whether the publisher bar shows. */
function sessionRead(page: Page) {
  return page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/session",
  );
}

function publisherBar(page: Page) {
  return main(page).getByRole("region", { name: "Your listing controls" });
}

/** The Update dialog, named for the version it changes, such as "Update 1.0.0". */
function updateDialog(page: Page) {
  return page.getByRole("dialog", { name: /^Update \d+\.\d+\.\d+$/ });
}

function descriptionField(page: Page) {
  return updateDialog(page).getByLabel("One-line description", {
    exact: true,
  });
}

/** Opens the Update dialog from the publisher bar, with the saved description in the field. */
async function openUpdate(page: Page, description: string) {
  await publisherBar(page).getByRole("button", { name: "Update" }).click();
  await expect(updateDialog(page)).toBeVisible();
  await expect(descriptionField(page)).toHaveValue(description);
}

/**
 * Asserts the listing still holds its saved description: on the page, and after a reload,
 * which reads it from the API again.
 */
async function expectDescriptionKept(page: Page, description: string) {
  await expect(
    main(page).getByText(description, { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    main(page).getByText(description, { exact: true }),
  ).toBeVisible();
}

/** The gutter's numbers for the code: one per line, from 1, as the gutter's text joins them. */
function gutterText(code: string): string {
  return code
    .split("\n")
    .map((_line, index) => String(index + 1))
    .join("");
}

/**
 * Asserts a code block shows the code exactly, with a line number for every line. The gutter
 * is hidden from assistive technology, so its numbers are read from the block's text, which is
 * the gutter's numbers followed by the code.
 */
async function expectNumberedCode(block: Locator, code: string) {
  await expect(block.getByRole("code")).toHaveJSProperty("textContent", code);
  await expect(block).toHaveJSProperty("textContent", gutterText(code) + code);
}

/** The code a block shows, read once the block is on the page. */
async function shownCode(block: Locator): Promise<string> {
  await expect(block).toBeVisible();
  return (await block.getByRole("code").textContent()) ?? "";
}

test.describe("as an anonymous visitor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "an activity consumer opens a listing, copies its address, jumps to Implement and reaches Configure and Source from the section bar",
    { tag: "@journey" },
    async ({ page, expectAccessible, publishListing, readClipboard }) => {
      const listing = await publishListing(slackListing);

      await test.step("open the listing at its address and read the top of the page", async () => {
        await page.goto(`/${listing.address}`);

        await expect(
          main(page).getByRole("heading", {
            level: 1,
            name: slackListing.title,
          }),
        ).toBeVisible();
        await expect(page).toHaveTitle(`${slackListing.title} · Durables`);
        await expect(
          main(page).getByText("Python", { exact: true }),
        ).toBeVisible();
        await expect(
          main(page).getByText(listing.address, { exact: true }),
        ).toBeVisible();
        await expect(
          main(page).getByText(slackListing.description, { exact: true }),
        ).toBeVisible();

        const publisherLine = main(page)
          .getByRole("paragraph")
          .filter({ hasText: /Published just now/ });
        await expect(publisherLine).toContainText(listing.handle);
        await expect(publisherLine).toContainText("MIT-0");
        await expect(publisherLine.getByRole("link")).toHaveCount(0);
        await expectAccessible();
      });

      await test.step("no popularity signals appear", async () => {
        await expect(
          page.getByText(
            /\b(stars?|downloads?|ratings?|popularity|weekly installs)\b/i,
          ),
        ).toHaveCount(0);
        await expect(
          page.getByRole("img", { name: /star|rating/i }),
        ).toHaveCount(0);
      });

      await test.step("copy the address and see Copied", async () => {
        await main(page).getByRole("button", { name: "Copy address" }).click();

        await expect(
          main(page).getByText("Copied", { exact: true }),
        ).toBeVisible();
        await expect.poll(readClipboard).toBe(listing.address);
      });

      await test.step("press Implement in the section bar and land on Implement", async () => {
        await main(page)
          .getByRole("navigation", { name: "Page sections" })
          .getByRole("link", { name: "Implement" })
          .click();

        await expect(sectionHeading(page, "Implement")).toBeInViewport();
        await expect(
          main(page).getByRole("heading", { level: 1 }),
        ).not.toBeInViewport();
      });

      await test.step("Implement shows the install command with line numbers and Copy", async () => {
        await expect(
          main(page).getByRole("heading", {
            level: 3,
            name: "1. Install the dependencies",
          }),
        ).toBeVisible();
        const install = codeBlock(page, "install command");
        const code = await shownCode(install);
        expect(code).toContain("pip install temporalio");
        await expectNumberedCode(install, code);

        await copyButton(page, "install command").click();
        await expect.poll(readClipboard).toBe(code);
      });

      await test.step("Implement shows the four files as tabs, the activity first and as published", async () => {
        await expect(
          main(page).getByRole("heading", {
            level: 3,
            name: "2. Add these four files to your project",
          }),
        ).toBeVisible();
        const tabs = main(page)
          .getByRole("tablist", { name: "Files" })
          .getByRole("tab");
        await expect(tabs).toHaveText(pythonFiles);
        await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
        await expect(
          main(page).getByRole("tabpanel", { name: "activities.py" }),
        ).toContainText(
          `The activity itself, exactly as published in ${listing.address}.`,
        );
        await expectNumberedCode(codeBlock(page, "activities.py"), python);

        await copyButton(page, "activities.py").click();
        await expect.poll(readClipboard).toBe(python);
      });

      for (const file of pythonFiles.slice(1)) {
        await test.step(`open the ${file} tab and see it with line numbers and Copy`, async () => {
          const tab = main(page).getByRole("tab", { name: file, exact: true });
          await tab.click();

          await expect(tab).toHaveAttribute("aria-selected", "true");
          await expect(
            main(page).getByRole("tabpanel", { name: file, exact: true }),
          ).toBeVisible();
          const block = codeBlock(page, file);
          const code = await shownCode(block);
          expect(code).not.toBe("");
          await expectNumberedCode(block, code);

          await copyButton(page, file).click();
          await expect.poll(readClipboard).toBe(code);
        });
      }

      await test.step("Implement shows the run commands with line numbers and Copy", async () => {
        await expect(
          main(page).getByRole("heading", { level: 3, name: "3. Run it" }),
        ).toBeVisible();
        const run = codeBlock(page, "run commands");
        const code = await shownCode(run);
        expect(code).toContain("temporal server start-dev");
        expect(code).toContain("export SLACK_TOKEN=");
        expect(code).toContain("python worker.py");
        expect(code).toContain("python start.py");
        await expectNumberedCode(run, code);

        await copyButton(page, "run commands").click();
        await expect.poll(readClipboard).toBe(code);
        await expectAccessible();
      });

      await test.step("reach Configure from the section bar and see names with no options table", async () => {
        await sectionLink(page, "Configure").click();

        await expect(sectionHeading(page, "Configure")).toBeInViewport();
        await expect(sectionHeading(page, "Implement")).not.toBeInViewport();
        await expect(
          main(page)
            .getByRole("list", { name: "Environment variables" })
            .getByRole("listitem"),
        ).toHaveText(["SLACK_TOKEN"]);
        await expect(
          main(page)
            .getByRole("list", { name: "Input and output types" })
            .getByRole("listitem"),
        ).toHaveText([/^Input\s*SlackMessage$/, /^Output\s*MessageRef$/]);
        await expect(
          main(page).getByRole("heading", {
            level: 3,
            name: "Worker requirements",
          }),
        ).toBeVisible();
        await expect(
          main(page).getByText(
            "This is an async activity. Your worker needs no special setup to run it.",
            { exact: true },
          ),
        ).toBeVisible();

        await expect(page.getByRole("table")).toHaveCount(0);
        await expect(
          page.getByText(/activity options|already filled in/i),
        ).toHaveCount(0);
      });

      await test.step("reach Source from the section bar and see the code as published", async () => {
        await sectionLink(page, "Source").click();

        await expect(sectionHeading(page, "Source")).toBeInViewport();
        // python.txt is 56 lines and ends in a line break, which starts no line of its own.
        await expect(
          main(page).getByText("activities.py · 56 lines", { exact: true }),
        ).toBeVisible();
        await expectNumberedCode(codeBlock(page, "published code"), python);

        await copyButton(page, "published code").click();
        await expect.poll(readClipboard).toBe(python);
      });

      await test.step("the sidebar shows the About and Publisher cards and the no-review note", async () => {
        const about = page.getByRole("region", { name: "About" });
        await expect(about.getByRole("term")).toHaveText([
          "SDK",
          "Dependencies",
          "Published",
          "License",
        ]);
        await expect(about.getByRole("definition")).toHaveText([
          "Python, temporalio",
          "httpx",
          "just now",
          "MIT-0",
        ]);

        const publisher = page.getByRole("region", { name: "Publisher" });
        await expect(publisher).toContainText(listing.handle);
        // The handle and "Search all activities by" both open that publisher's activities.
        const publisherSearchPath = `/search?publisher=${listing.handle}`;
        await expect(publisher.getByRole("link")).toHaveCount(2);
        await expect(
          publisher.getByRole("link", { name: listing.handle, exact: true }),
        ).toHaveAttribute("href", publisherSearchPath);
        await expect(
          publisher.getByRole("link", {
            name: `Search all activities by ${listing.handle}`,
          }),
        ).toHaveAttribute("href", publisherSearchPath);

        await expect(
          page.getByText(noReviewNote, { exact: true }),
        ).toBeVisible();
        await expectAccessible();
      });
    },
  );

  test("an address with nothing published shows Page not found", async ({
    page,
    expectAccessible,
    uniqueHandle,
  }) => {
    await page.goto(`/${uniqueHandle("nobody")}/nothing-here@1.0.0`);

    await expect(
      main(page).getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Page not found · Durables");
    await expect(sectionLink(page, "Implement")).toHaveCount(0);
    await expectAccessible();
  });

  test("a version of a listing that was never published shows Page not found", async ({
    page,
    expectAccessible,
    publishListing,
  }) => {
    const listing = await publishListing(slackListing);

    await page.goto(`/${listing.handle}/${listing.name}@2.0.0`);

    await expect(
      main(page).getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeVisible();
    await expect(
      main(page).getByRole("heading", { name: slackListing.title }),
    ).toHaveCount(0);
    await expectAccessible();
  });

  test("a listing that reads no environment variables and imports no integrations shows the empty states", async ({
    page,
    expectAccessible,
    publishListing,
  }) => {
    const listing = await publishListing({
      code: sample("python-no-configuration"),
      title: "Slugify title",
      name: "slugify-title",
      description: "Turns a title into a URL slug.",
    });

    await page.goto(`/${listing.address}`);

    await expect(sectionHeading(page, "Configure")).toBeVisible();
    await expect(
      main(page).getByText("No environment variables found in the code.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      main(page).getByRole("list", { name: "Environment variables" }),
    ).toHaveCount(0);
    await expect(
      main(page).getByText(
        "This is a synchronous activity. Your worker needs a thread pool to run it, which the worker file in Implement already sets up.",
        { exact: true },
      ),
    ).toBeVisible();

    const about = page.getByRole("region", { name: "About" });
    await expect(about.getByRole("term")).toHaveText([
      "SDK",
      "Dependencies",
      "Published",
      "License",
    ]);
    await expect(about.getByRole("definition")).toHaveText([
      "Python, temporalio",
      "None beyond the SDK",
      "just now",
      "MIT-0",
    ]);
    await expectAccessible();
  });

  test("a listing whose imports imply an integration shows it in the About card", async ({
    page,
    expectAccessible,
    publishListing,
  }) => {
    const listing = await publishListing({
      code: sample("typescript"),
      title: "Upload report",
      name: "upload-report",
      description: "Uploads a CSV report to S3 and returns where it is.",
    });

    await page.goto(`/${listing.address}`);

    const about = page.getByRole("region", { name: "About" });
    await expect(about.getByRole("term")).toHaveText([
      "SDK",
      "Integrates with",
      "Dependencies",
      "Published",
      "License",
    ]);
    await expect(about.getByRole("definition").nth(1)).toHaveText("Amazon S3");
    await expect(
      main(page).getByRole("tablist", { name: "Files" }).getByRole("tab"),
    ).toHaveText(["activities.ts", "workflows.ts", "worker.ts", "start.ts"]);
    await expectAccessible();
  });
});

test.describe("an activity whose SDK was only inferred", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // go-no-marker.txt imports no Temporal package, so its SDK is inferred from the code.
  test("publishes, and its page shows the SDK and Implement in Go", async ({
    page,
    expectAccessible,
    publishListing,
  }) => {
    const listing = await publishListing({
      code: sample("go-no-marker"),
      title: "Compose greeting",
      name: "compose-greeting",
      description: "Returns a greeting for a name.",
    });

    await page.goto(`/${listing.address}`);

    await expect(
      main(page).getByRole("heading", { level: 1, name: "Compose greeting" }),
    ).toBeVisible();
    await expect(main(page).getByText("Go", { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "About" })
        .getByRole("definition")
        .first(),
    ).toHaveText("Go, go.temporal.io/sdk");
    await expect(
      main(page).getByRole("tablist", { name: "Files" }).getByRole("tab"),
    ).toHaveText([
      "activity.go",
      "workflow.go",
      "worker/main.go",
      "start/main.go",
    ]);
    await expectAccessible();
  });
});

test.describe("the publisher bar and Update dialog", () => {
  const ownListing: PublishDetails = {
    ...slackListing,
    description: savedDescription,
  };

  test.describe("as an anonymous visitor", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("a signed-out visitor sees no publisher bar and no Update button", async ({
      page,
      expectAccessible,
      publishListing,
    }) => {
      const listing = await publishListing(ownListing);
      const session = sessionRead(page);

      await page.goto(`/${listing.address}`);

      expect((await session).status()).toBe(200);
      await expect(
        main(page).getByRole("heading", { level: 1, name: ownListing.title }),
      ).toBeVisible();
      await expect(
        main(page).getByText(savedDescription, { exact: true }),
      ).toBeVisible();
      await expect(accountMenu(page)).toHaveCount(0);
      await expect(publisherBar(page)).toHaveCount(0);
      await expect(page.getByText(barText)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Update" })).toHaveCount(0);
      await expectAccessible();
    });
  });

  test("a visitor signed in with an account under another handle sees no publisher bar", async ({
    page,
    expectAccessible,
    publishListing,
    signInWithAccount,
  }) => {
    const listing = await publishListing(ownListing);
    const account = await signInWithAccount();
    expect(account.handle).not.toBe(listing.handle);

    await page.goto(`/${listing.address}`);

    await expect(
      main(page).getByRole("heading", { level: 1, name: ownListing.title }),
    ).toBeVisible();
    await expect(accountMenu(page)).toHaveText(publisherInitials);
    await expect(publisherBar(page)).toHaveCount(0);
    await expect(page.getByText(barText)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Update" })).toHaveCount(0);
    await expectAccessible();
  });

  test("a visitor signed in with no account yet sees no publisher bar", async ({
    page,
    publishListing,
  }) => {
    const listing = await publishListing(ownListing);

    await page.goto(`/${listing.address}`);

    await expect(
      main(page).getByRole("heading", { level: 1, name: ownListing.title }),
    ).toBeVisible();
    await expect(accountMenu(page)).toHaveText(publisherInitials);
    await expect(publisherBar(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Update" })).toHaveCount(0);
  });

  test("a returning publisher who signed in again sees the publisher bar on their own listing", async ({
    page,
    expectAccessible,
    publishOwnListing,
    signIn,
  }) => {
    const listing = await publishOwnListing(ownListing);
    // A fresh sign-in by the same identity: the account exists and no handle is chosen.
    await signIn({
      name: listing.identity.name,
      providerAccountId: listing.identity.providerAccountId,
    });

    await page.goto(`/${listing.address}`);

    await expect(publisherBar(page).getByText(barText)).toBeVisible();
    await expect(
      publisherBar(page).getByRole("button", { name: "Update" }),
    ).toBeVisible();
    await expectAccessible();
  });

  for (const close of ["Cancel", "Close", "Escape"] as const) {
    test(`closing the Update dialog with ${close === "Close" ? "×" : close} after editing keeps the saved description`, async ({
      page,
      publishOwnListing,
    }) => {
      const listing = await publishOwnListing(ownListing);
      const abandoned = "A description the publisher thought better of.";
      await page.goto(`/${listing.address}`);
      await openUpdate(page, savedDescription);

      await descriptionField(page).fill(abandoned);
      if (close === "Escape") {
        await descriptionField(page).press("Escape");
      } else {
        await updateDialog(page).getByRole("button", { name: close }).click();
      }

      await expect(updateDialog(page)).toBeHidden();
      await expect(
        main(page).getByText(abandoned, { exact: true }),
      ).toHaveCount(0);
      await expectDescriptionKept(page, savedDescription);
    });
  }

  test("saving an empty description shows Enter a description. and keeps the dialog open", async ({
    page,
    expectAccessible,
    publishOwnListing,
  }) => {
    const listing = await publishOwnListing(ownListing);
    await page.goto(`/${listing.address}`);
    await openUpdate(page, savedDescription);

    await descriptionField(page).fill("");
    await updateDialog(page)
      .getByRole("button", { name: "Save changes" })
      .click();

    await expect(
      updateDialog(page).getByText("Enter a description.", { exact: true }),
    ).toBeVisible();
    await expect(descriptionField(page)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(updateDialog(page)).toBeVisible();
    await expectAccessible();
    await expectDescriptionKept(page, savedDescription);
  });

  test("a description over 160 characters shows Use at most 160 characters. and saves nothing", async ({
    page,
    expectAccessible,
    publishOwnListing,
  }) => {
    const listing = await publishOwnListing(ownListing);
    const tooLong = `${savedDescription} ${"x".repeat(161)}`.slice(0, 161);
    await page.goto(`/${listing.address}`);
    await openUpdate(page, savedDescription);

    await descriptionField(page).fill(tooLong);

    const message = updateDialog(page).getByText(
      "Use at most 160 characters.",
      { exact: true },
    );
    await expect(message).toBeVisible();
    await expect(descriptionField(page)).toHaveValue(tooLong);

    await updateDialog(page)
      .getByRole("button", { name: "Save changes" })
      .click();

    await expect(message).toBeVisible();
    await expect(updateDialog(page)).toBeVisible();
    await expect(descriptionField(page)).toHaveValue(tooLong);
    await expectAccessible();
    await expectDescriptionKept(page, savedDescription);
  });
});
