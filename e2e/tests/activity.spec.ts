import type { Locator, Page } from "@playwright/test";
import { expect, sample, test, type PublishDetails } from "../fixtures";

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

      await test.step("press Quickstart and land on Implement", async () => {
        await main(page).getByRole("link", { name: "Quickstart" }).click();

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
        await expect(publisher.getByRole("link")).toHaveCount(0);

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
    await expect(about.getByRole("definition").nth(1)).toHaveText("AWS S3");
    await expect(
      main(page).getByRole("tablist", { name: "Files" }).getByRole("tab"),
    ).toHaveText(["activities.ts", "workflows.ts", "worker.ts", "start.ts"]);
    await expectAccessible();
  });
});
