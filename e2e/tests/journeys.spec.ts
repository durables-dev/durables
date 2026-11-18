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
      const main = page.getByRole("main");
      const signIn = main
        .getByRole("link", { name: /sign in/i })
        .or(main.getByRole("button", { name: /sign in/i }));

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
  "a publisher updates their listing's description from the publisher bar and sees it on the page, after a reload and on their search result card, while an older version's page keeps its own",
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
    // The publisher updates 1.1.0, the version they land on.
    const dialog = page.getByRole("dialog", { name: "Update 1.1.0" });
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
      // The closed dialogs inside the bar are hidden, so these are the bar's own buttons. The
      // publisher is on 1.1.0, the latest.
      await expect(bar.getByRole("button")).toHaveText([
        "Update",
        "Deprecate 1.1.0",
        "Create new version",
        "Remove",
      ]);
      await expectAccessible();
    });

    await test.step("open the Update dialog and see the description and what can't be changed", async () => {
      await bar.getByRole("button", { name: "Update" }).click();

      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("heading", { level: 2, name: "Update 1.1.0" }),
      ).toBeVisible();
      await expect(dialog).toHaveAccessibleDescription(
        "This changes the description of 1.1.0 only. Anything about how the activity behaves needs a new version instead.",
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

    await test.step("open the older version's page and still see its own description", async () => {
      await page.goto(`/${older}`);

      await expect(
        main.getByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
      await expect(main.getByText(older, { exact: true })).toBeVisible();
      await expect(main.getByText(before, { exact: true })).toBeVisible();
      await expect(main.getByText(after, { exact: true })).toHaveCount(0);
      await expectAccessible();
    });
  },
);

/** A non-Python SDK's sample and what its listing shows once published. */
interface SdkJourney {
  sdk: "Go" | "Java" | "Ruby" | "PHP" | "Rust";
  sample: string;
  activity: string;
  /** The listing's title, before the test's unique word, and its name in the address. */
  title: string;
  name: string;
  description: string;
  /** The About card's SDK row: the SDK, then its package from the SDK catalog. */
  aboutSdk: string;
  /** The integration the sample's imports imply, or none. */
  integration?: "Amazon S3" | "Postgres" | "Slack" | "Stripe";
  /** Lines the install command holds. */
  install: string[];
  /** The Implement tabs, in order: the published activity, then the generated files. */
  files: string[];
  /** Lines the run commands hold. */
  run: string[];
}

const sdkJourneys: SdkJourney[] = [
  {
    sdk: "Go",
    sample: "go",
    activity: "ArchiveReport",
    title: "Archive report",
    name: "archive-report",
    description: "Uploads a CSV report to S3 and returns where it is kept.",
    aboutSdk: "Go, go.temporal.io/sdk",
    integration: "Amazon S3",
    install: [
      "go get go.temporal.io/sdk",
      "go get github.com/aws/aws-sdk-go-v2/aws github.com/aws/aws-sdk-go-v2/config github.com/aws/aws-sdk-go-v2/service/s3",
    ],
    files: ["activity.go", "workflow.go", "worker/main.go", "start/main.go"],
    run: [
      "temporal server start-dev",
      "export ARCHIVE_BUCKET=...",
      "go run worker/main.go",
      "go run start/main.go",
    ],
  },
  {
    // The Java sample's own acceptance is in contribute.spec.ts; this checks it through publish
    // and the SDK filter.
    sdk: "Java",
    sample: "java",
    activity: "sendSms",
    title: "Send SMS",
    name: "send-sms",
    description: "Sends a text message through Twilio and returns its SID.",
    aboutSdk: "Java, io.temporal:temporal-sdk",
    install: [
      "<groupId>io.temporal</groupId>",
      "<artifactId>temporal-sdk</artifactId>",
    ],
    files: [
      "Activities.java",
      "SendSmsWorkflow.java",
      "SendSmsWorker.java",
      "Starter.java",
    ],
    run: [
      "temporal server start-dev",
      "export TWILIO_ACCOUNT_SID=...",
      "mvn compile exec:java -Dexec.mainClass=SendSmsWorker",
      "mvn compile exec:java -Dexec.mainClass=Starter",
    ],
  },
  {
    sdk: "Ruby",
    sample: "ruby",
    activity: "SendInvoice",
    title: "Send invoice",
    name: "send-invoice",
    description: "Creates a Stripe invoice for a customer and sends it.",
    aboutSdk: "Ruby, temporalio",
    integration: "Stripe",
    install: ["bundle add temporalio"],
    files: ["activities.rb", "workflow.rb", "worker.rb", "starter.rb"],
    run: [
      "temporal server start-dev",
      "export STRIPE_API_KEY=...",
      "bundle exec ruby worker.rb",
      "bundle exec ruby starter.rb",
    ],
  },
  {
    // PHP adds a fifth file, the RoadRunner config that runs the worker.
    sdk: "PHP",
    sample: "php",
    activity: "postMessage",
    title: "Post message",
    name: "post-message",
    description:
      "Posts a message to a Slack channel and returns its reference.",
    aboutSdk: "PHP, temporal/sdk",
    integration: "Slack",
    install: ["composer require temporal/sdk", "./vendor/bin/rr get"],
    files: [
      "Activities.php",
      "PostMessageWorkflow.php",
      "worker.php",
      "starter.php",
      ".rr.yaml",
    ],
    run: [
      "temporal server start-dev",
      "export SLACK_BOT_TOKEN=...",
      "./rr serve",
      "php starter.php",
    ],
  },
  {
    sdk: "Rust",
    sample: "rust",
    activity: "record_order_status",
    title: "Record order status",
    name: "record-order-status",
    description: "Records an order's new status in Postgres.",
    aboutSdk: "Rust, temporalio-sdk",
    integration: "Postgres",
    install: ["[dependencies]", 'temporalio-sdk = "1.0.0"'],
    files: ["activities.rs", "workflows.rs", "main.rs", "starter.rs"],
    run: [
      "temporal server start-dev",
      "export DATABASE_URL=...",
      "cargo run",
      "cargo run -- start",
    ],
  },
];

const fileCountWords = ["four", "five"];

for (const journey of sdkJourneys) {
  test(
    `a ${journey.sdk} publisher pastes and publishes an activity, finds it with the ${journey.sdk} chip and reads Implement in ${journey.sdk}`,
    { tag: "@journey" },
    async ({
      page,
      expectAccessible,
      signIn,
      uniqueHandle,
      uniqueWord,
      paste,
    }) => {
      const handle = uniqueHandle(journey.sample);
      const word = uniqueWord();
      const code = sample(journey.sample);
      const title = `${journey.title} ${word}`;
      const address = `${handle}/${journey.name}@1.0.0`;
      const main = page.getByRole("main");
      const continueButton = page.getByRole("button", { name: "Continue" });
      const resultCard = main.getByRole("article", {
        name: title,
        exact: true,
      });
      const codeBlock = (label: string) =>
        main.getByRole("region", { name: label, exact: true });

      await test.step("sign in as a new publisher, choose a handle and reach the Code step", async () => {
        await signIn({
          name: publisherName,
          provider: "github",
          username: handle,
        });
        await openContributeFromHome(page);
        await expect(page.getByText(`${handle} is available.`)).toBeVisible();
        await continueButton.click();

        await expectOnCodeStep(page);
      });

      await test.step(`paste the ${journey.sdk} activity and see the Found line naming ${journey.sdk}`, async () => {
        await paste(page.getByLabel("Paste your file", { exact: true }), code);

        await expect(
          page.getByText(
            `✓ Found ${journey.activity} (${journey.sdk}). Next, check what we detected.`,
            { exact: true },
          ),
        ).toBeVisible();
        await expect(continueButton).toBeEnabled();
        await expectAccessible();
      });

      await test.step(`see ${journey.sdk} detected on the What we found card`, async () => {
        await continueButton.click();

        await expect(page).toHaveURL("/contribute/detected");
        const card = page.getByRole("region", { name: "What we found" });
        await expect(card.getByRole("definition").nth(0)).toHaveText(
          journey.sdk,
        );
        await expect(card.getByRole("definition").nth(1)).toHaveText(
          "Detected",
        );
        await expect(card.getByRole("definition").nth(2)).toHaveText(
          journey.activity,
        );
        await expectAccessible();
      });

      await test.step("describe the listing and review it", async () => {
        await continueButton.click();
        await expect(page).toHaveURL("/contribute/details");
        await page.getByLabel("Title", { exact: true }).fill(title);
        await page
          .getByLabel("Name in the address", { exact: true })
          .fill(journey.name);
        await page
          .getByLabel("One-line description", { exact: true })
          .fill(journey.description);
        await continueButton.click();

        await expect(page).toHaveURL("/contribute/review");
        const preview = page.getByRole("region", { name: "Listing preview" });
        await expect(
          preview.getByRole("heading", { name: title }),
        ).toBeVisible();
        await expect(
          preview.getByText(journey.sdk, { exact: true }),
        ).toBeVisible();
        await expectAccessible();
      });

      await test.step("confirm the six terms and publish", async () => {
        const confirmations = page
          .getByRole("group", {
            name: "Before you publish, confirm each of these",
          })
          .getByRole("checkbox");
        await expect(confirmations).toHaveCount(6);
        for (const box of await confirmations.all()) {
          await box.check();
        }
        await page.getByRole("button", { name: "Publish 1.0.0" }).click();

        await expect(page).toHaveURL("/contribute/published");
        await expect(
          page
            .getByRole("region", { name: "Published" })
            .getByText(/is live\./),
        ).toContainText(`${address} is live.`);
      });

      await test.step(`choose the ${journey.sdk} chip in search and see the activity listed`, async () => {
        await page.goto(`/search?q=${word}`);
        await expect(resultCard).toBeVisible();

        await page
          .getByRole("complementary", { name: "Filters" })
          .getByRole("group", { name: "Temporal SDK", exact: true })
          .getByRole("button", { name: journey.sdk, exact: true })
          .click();

        await expect(page).toHaveURL(
          new RegExp(`[?&]sdk=${encodeURIComponent(journey.sdk)}(&|$)`),
        );
        await expect(resultCard).toBeVisible();
        await expect(resultCard).toContainText(address);
        await expect(
          resultCard.getByText(journey.sdk, { exact: true }),
        ).toBeVisible();
        await expect(
          main.getByRole("article").filter({
            hasNot: page.getByText(journey.sdk, { exact: true }),
          }),
        ).toHaveCount(0);
        if (journey.integration !== undefined) {
          await expect(
            resultCard.getByRole("link", {
              name: journey.integration,
              exact: true,
            }),
          ).toBeVisible();
        }
        await expectAccessible();
      });

      await test.step("open the listing and see the SDK tag and the About card", async () => {
        await resultCard.getByRole("link", { name: "View" }).click();

        await expect(page).toHaveURL(`/${address}`);
        await expect(
          main.getByRole("heading", { level: 1, name: title }),
        ).toBeVisible();
        await expect(
          main.getByText(journey.sdk, { exact: true }),
        ).toBeVisible();

        const about = page.getByRole("region", { name: "About" });
        const terms = ["SDK", "Dependencies", "Published", "License"];
        if (journey.integration !== undefined) {
          terms.splice(1, 0, "Integrates with");
        }
        await expect(about.getByRole("term")).toHaveText(terms);
        await expect(about.getByRole("definition").first()).toHaveText(
          journey.aboutSdk,
        );
        if (journey.integration !== undefined) {
          await expect(about.getByRole("definition").nth(1)).toHaveText(
            journey.integration,
          );
          await expect(
            about.getByRole("link", { name: journey.integration, exact: true }),
          ).toBeVisible();
        }
        await expectAccessible();
      });

      await test.step(`Implement shows the ${journey.sdk} install command`, async () => {
        const install = codeBlock("install command");
        await expect(install).toBeVisible();
        for (const line of journey.install) {
          await expect(install.getByRole("code")).toContainText(line);
        }
      });

      await test.step(`Implement shows the ${journey.sdk} files as tabs, the activity first and as published`, async () => {
        await expect(
          main.getByRole("heading", {
            level: 3,
            name: `2. Add these ${fileCountWords[journey.files.length - 4] ?? ""} files to your project`,
          }),
        ).toBeVisible();
        const tabs = main
          .getByRole("tablist", { name: "Files" })
          .getByRole("tab");
        await expect(tabs).toHaveText(journey.files);
        await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
        const [activityFile, ...generated] = journey.files;
        await expect(
          codeBlock(activityFile ?? "").getByRole("code"),
        ).toHaveJSProperty("textContent", code);

        for (const file of generated) {
          await main.getByRole("tab", { name: file, exact: true }).click();

          await expect(
            main.getByRole("tabpanel", { name: file, exact: true }),
          ).toBeVisible();
          await expect(codeBlock(file).getByRole("code")).not.toBeEmpty();
        }
      });

      await test.step(`Implement shows the ${journey.sdk} run commands`, async () => {
        const run = codeBlock("run commands");
        await expect(run).toBeVisible();
        for (const line of journey.run) {
          await expect(run.getByRole("code")).toContainText(line);
        }
        await expectAccessible();
      });
    },
  );
}

test(
  "a publisher whose SDK can't be identified chooses it, corrects a wrong choice, publishes, and the activity page shows the SDK they declared",
  { tag: "@journey" },
  async ({
    page,
    expectAccessible,
    signIn,
    uniqueHandle,
    uniqueWord,
    paste,
  }) => {
    const handle = uniqueHandle("declared");
    const word = uniqueWord();
    // java-no-import.txt writes its Temporal annotations in full and imports nothing from
    // Temporal, so no SDK identifies it.
    const code = sample("java-no-import");
    const title = `Issue refund ${word}`;
    const name = "issue-refund";
    const address = `${handle}/${name}@1.0.0`;
    const main = page.getByRole("main");
    const continueButton = page.getByRole("button", { name: "Continue" });
    const sdkDropdown = page.getByRole("combobox", {
      name: "SDK",
      exact: true,
    });
    const hint = page.getByText("Choose the SDK this activity is for", {
      exact: true,
    });

    await test.step("sign in as a new publisher, choose a handle and reach the Code step", async () => {
      await signIn({
        name: publisherName,
        provider: "github",
        username: handle,
      });
      await openContributeFromHome(page);
      await expect(page.getByText(`${handle} is available.`)).toBeVisible();
      await continueButton.click();

      await expectOnCodeStep(page);
    });

    await test.step("paste the activity and be asked to choose its SDK", async () => {
      await paste(page.getByLabel("Paste your file", { exact: true }), code);

      await expect(
        page.getByText(
          "We couldn't tell which SDK this is. Choose the one it's written for.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(sdkDropdown).toHaveValue("");
      await expect(continueButton).toBeDisabled();
      await expect(hint).toBeVisible();
      await expectAccessible();
    });

    await test.step("choose Go and see that Go finds no activity, with the dropdown still there", async () => {
      await sdkDropdown.selectOption("Go");

      await expect(
        page.getByText(
          "No activity found for Go. Check the code, or choose a different SDK.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(sdkDropdown).toHaveValue("Go");
      await expect(continueButton).toBeDisabled();
      await expect(hint).toBeVisible();
    });

    await test.step("choose Java and see the activity found, declared by the publisher", async () => {
      await sdkDropdown.selectOption("Java");

      await expect(
        page.getByText(
          "✓ Found issueRefund (Java, declared by you). Next, check what we detected.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Change the SDK, Java", exact: true }),
      ).toBeVisible();
      await expect(continueButton).toBeEnabled();
      await expectAccessible();
    });

    await test.step("see Java declared by the publisher on the What we found card", async () => {
      await continueButton.click();

      await expect(page).toHaveURL("/contribute/detected");
      const values = page
        .getByRole("region", { name: "What we found" })
        .getByRole("definition");
      await expect(values.nth(0)).toHaveText("Java");
      await expect(values.nth(1)).toHaveText("Declared by you");
      await expect(values.nth(2)).toHaveText("issueRefund");
      await expectAccessible();
    });

    await test.step("describe the listing and see Java on the preview", async () => {
      await continueButton.click();
      await expect(page).toHaveURL("/contribute/details");
      await page.getByLabel("Title", { exact: true }).fill(title);
      await page.getByLabel("Name in the address", { exact: true }).fill(name);
      await page
        .getByLabel("One-line description", { exact: true })
        .fill("Refunds a payment and returns the refund's receipt.");
      await continueButton.click();

      await expect(page).toHaveURL("/contribute/review");
      const preview = page.getByRole("region", { name: "Listing preview" });
      await expect(preview.getByRole("heading", { name: title })).toBeVisible();
      await expect(preview.getByText("Java", { exact: true })).toBeVisible();
      await expectAccessible();
    });

    await test.step("confirm the six terms and publish", async () => {
      const confirmations = page
        .getByRole("group", {
          name: "Before you publish, confirm each of these",
        })
        .getByRole("checkbox");
      await expect(confirmations).toHaveCount(6);
      for (const box of await confirmations.all()) {
        await box.check();
      }
      await page.getByRole("button", { name: "Publish 1.0.0" }).click();

      await expect(page).toHaveURL("/contribute/published");
      await expect(
        page.getByRole("region", { name: "Published" }).getByText(/is live\./),
      ).toContainText(`${address} is live.`);
    });

    await test.step("open the activity page and see the SDK the publisher declared", async () => {
      await page.goto(`/${address}`);

      await expect(
        main.getByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
      await expect(main.getByText("Java", { exact: true })).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "About" })
          .getByRole("definition")
          .first(),
      ).toHaveText("Java, io.temporal:temporal-sdk");
      await expect(
        main.getByRole("tablist", { name: "Files" }).getByRole("tab").first(),
      ).toHaveText("Activities.java");
      await expectAccessible();
    });
  },
);

// Signing in from the header and the profile (API map D1 to D6, D9). A provider's consent
// screen is another origin, which these tests never reach, so the sign-in in the middle is the
// local fake provider's. It starts the session but lands nowhere, so the page the provider's
// callback would land on is not exercised here. The Sign in page, opened again signed in,
// offers the way back to the starting page it carries.

/** The Sign in page's address when it was opened from `from`. */
function signInPageFrom(from: string): string {
  return `/sign-in?${new URLSearchParams({ returnTo: from }).toString()}`;
}

/** The API route a provider button starts sign-in with, carrying the starting page. */
function startPath(provider: string, from: string): string {
  return `/api/session/providers/${provider}?${new URLSearchParams({ returnTo: from }).toString()}`;
}

test.describe("signing in from the header", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "a returning publisher signs in from the header on an activity page and is carried back to it",
    { tag: "@journey" },
    async ({
      page,
      expectAccessible,
      publishListing,
      seedAccount,
      signIn,
      uniqueWord,
    }) => {
      const title = `Post slack message ${uniqueWord()}`;
      const listing = await publishListing({
        code: sample("python"),
        title,
        name: "post-slack-message",
        description:
          "Posts a message to a Slack channel and returns its reference.",
      });
      const account = await seedAccount();
      const from = `/${listing.address}`;
      const header = page.getByRole("banner");
      const signInLink = header.getByRole("link", {
        name: "Sign in",
        exact: true,
      });

      await test.step("the signed-out activity page offers Sign in left of Contribute", async () => {
        await page.goto(from);

        await expect(
          page.getByRole("heading", { level: 1, name: title }),
        ).toBeVisible();
        await expect(header.getByRole("link")).toHaveText([
          "Durables",
          "Sign in",
          "Contribute",
        ]);
        await expectAccessible();
      });

      await test.step("Sign in opens the Sign in page, which starts every provider from the activity page", async () => {
        await signInLink.click();

        await expect(page).toHaveURL(signInPageFrom(from));
        await expect(
          page.getByRole("heading", { level: 1, name: "Sign in" }),
        ).toBeVisible();
        await expect(signInLink).toHaveCount(0);
        for (const [id, name] of [
          ["github", "GitHub"],
          ["gitlab", "GitLab"],
          ["google", "Google"],
          ["microsoft", "Microsoft"],
        ] as const) {
          await expect(
            page.getByRole("link", { name: `Continue with ${name}` }),
          ).toHaveAttribute("href", startPath(id, from));
        }
        await expectAccessible();
      });

      await test.step("signed in, the Sign in page carries the publisher back to the activity page", async () => {
        await signIn({
          name: publisherName,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        });
        await page.reload();

        await expect(page.getByText("You're already signed in.")).toBeVisible();
        await page.getByRole("link", { name: "Go back" }).click();

        await expect(page).toHaveURL(from);
        await expect(
          page.getByRole("heading", { level: 1, name: title }),
        ).toBeVisible();
        await expect(accountMenu(page)).toHaveText(publisherInitials);
        await expect(signInLink).toHaveCount(0);
        await expectAccessible();
      });
    },
  );

  test(
    "a signed-out publisher opens their profile, signs in, is carried back to it, sees only their own details and activities, and signs out to the home page",
    { tag: "@journey" },
    async ({
      page,
      expectAccessible,
      publishListing,
      publishOwnListing,
      signIn,
      uniqueWord,
    }) => {
      const python = sample("python");
      const theirTitle = `Post slack message ${uniqueWord()}`;
      const other = await publishListing({
        code: python,
        title: theirTitle,
        name: "post-slack-message",
        description:
          "Posts a message to a Slack channel and returns its reference.",
      });
      const myTitle = `Post slack message ${uniqueWord()}`;
      const listing = await publishOwnListing({
        code: python,
        title: myTitle,
        name: "post-slack-message",
        description:
          "Posts a message to a Slack channel and returns its reference.",
      });
      // Publishing signed the page in. The journey starts signed out.
      await page.context().clearCookies();
      const main = page.getByRole("main");

      await test.step("opening the profile signed out goes to Sign in, with the profile to return to", async () => {
        await page.goto("/profile");

        await expect(page).toHaveURL(signInPageFrom("/profile"));
        await expect(
          page.getByRole("heading", { level: 1, name: "Sign in" }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Continue with GitHub" }),
        ).toHaveAttribute("href", startPath("github", "/profile"));
        await expect(main.getByText(listing.handle)).toHaveCount(0);
        await expectAccessible();
      });

      await test.step("signed in, the Sign in page carries the owner back to the profile", async () => {
        await signIn(listing.identity);
        await page.reload();
        await page.getByRole("link", { name: "Go back" }).click();

        await expect(page).toHaveURL("/profile");
        await expect(
          main.getByRole("heading", { level: 1, name: listing.handle }),
        ).toBeVisible();
      });

      await test.step("the profile shows the owner's handle, provider and activities, and nobody else's", async () => {
        await expect(main.getByText("Signed in with GitHub")).toBeVisible();
        await expect(
          main.getByRole("region", { name: "Handle" }),
        ).toContainText(listing.handle);
        await expect(
          main.getByRole("region", { name: "From GitHub" }),
        ).toContainText(listing.identity.providerAccountId);
        const items = main
          .getByRole("region", { name: "Your activities" })
          .getByRole("listitem");
        await expect(items).toHaveCount(1);
        await expect(
          items.getByRole("link", { name: myTitle }),
        ).toHaveAttribute("href", `/${listing.address}`);
        await expect(main.getByText(theirTitle)).toHaveCount(0);
        await expect(main.getByText(other.handle)).toHaveCount(0);
        await expectAccessible();
      });

      await test.step("signing out on the profile goes to the home page, signed out", async () => {
        await accountMenu(page).click();
        await page.getByRole("menuitem", { name: "Sign out" }).click();

        await expect(page).toHaveURL("/");
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: "Temporal activities, ready to use.",
          }),
        ).toBeVisible();
        await expect(accountMenu(page)).toHaveCount(0);
        await expect(
          page.getByRole("banner").getByRole("link", {
            name: "Sign in",
            exact: true,
          }),
        ).toBeVisible();
        await expectAccessible();
      });
    },
  );
});

// Deleting an account and getting it back (API map D7, D8, D18 to D21, D27). The local fake
// provider finishes a sign-in without a redirect, so these tests open the page a provider's
// callback would land on themselves.

/** Where a provider's callback sends a sign-in whose account is pending deletion (api: session/sign-in.ts). */
const restorePromptPath = "/sign-in/restore";

/** Where Start as a new user continues: Contribute at Profile & Handle (api: session/sign-in.ts). */
const newUserPath = "/contribute/profile";

const finalDayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** The day a deletion asked for at `requested` becomes final, as the Restore prompt shows it. */
function finalDay(requested: Date): string {
  return finalDayFormat.format(
    new Date(requested.getTime() + 30 * 24 * 60 * 60 * 1000),
  );
}

/** Matches the prompt's final-date sentence for a deletion asked for between two times. */
function finalDaySentence(from: Date, to: Date): RegExp {
  const days = [...new Set([finalDay(from), finalDay(to)])];
  return new RegExp(`The deletion becomes final on (${days.join("|")})\\.`);
}

test.describe("deleting and restoring an account", () => {
  test(
    "a publisher deletes their account, their activities leave search but keep their pages, and signing in again restores only what was listed",
    { tag: "@journey" },
    async ({
      page,
      expectAccessible,
      publishOwnListing,
      publishThroughApi,
      removeFromSearch,
      signIn,
      uniqueWord,
    }) => {
      const word = uniqueWord();
      const python = sample("python");
      const description =
        "Posts a message to a Slack channel and returns its reference.";
      const first = await publishOwnListing({
        code: python,
        title: `Post slack message ${word}`,
        name: "post-slack-message",
        description,
      });
      const more = [];
      for (const [title, name] of [
        [`Send slack alert ${word}`, "send-slack-alert"],
        [`Archive slack note ${word}`, "archive-slack-note"],
      ] as const) {
        const published = await publishThroughApi({
          code: python,
          title,
          name,
          description,
        });
        more.push({
          ...published,
          title,
          address: `${published.handle}/${published.name}@${published.version}`,
        });
      }
      const [second, earlierRemoved] = more;
      if (second === undefined || earlierRemoved === undefined) {
        throw new Error("Not everything was published.");
      }
      // The publisher took this one out of search before deleting the account.
      await removeFromSearch(earlierRemoved);
      const listed = [
        { title: `Post slack message ${word}`, address: first.address },
        second,
      ];
      const handle = first.handle;

      const main = page.getByRole("main");
      const header = page.getByRole("banner");
      const cards = main.getByRole("article");
      const card = (title: string) =>
        main.getByRole("article", { name: title, exact: true });
      const removedNotice = main
        .getByRole("status")
        .filter({ hasText: "Removed by the publisher." });
      const activities = main
        .getByRole("region", { name: "Your activities" })
        .getByRole("listitem");
      const activity = (title: string) =>
        activities.filter({ has: page.getByRole("link", { name: title }) });
      let requestedFrom = new Date();
      let requestedTo = new Date();

      await test.step("search finds the two listed activities and not the one removed earlier", async () => {
        await page.goto(`/search?q=${word}`);

        await expect(cards).toHaveCount(2);
        for (const { title } of listed) {
          await expect(card(title)).toBeVisible();
        }
        await expect(card(earlierRemoved.title)).toHaveCount(0);
      });

      await test.step("the profile's Delete account opens the dialog, which counts the listed activities", async () => {
        await page.goto("/profile");
        await expect(
          main.getByRole("heading", { level: 1, name: handle }),
        ).toBeVisible();

        const section = main.getByRole("region", {
          name: "Delete your account",
        });
        await expect(section).toContainText(
          "Your activities leave search. You can restore your account by signing in within 30 days.",
        );
        await section.getByRole("button", { name: "Delete account" }).click();

        const dialog = page.getByRole("dialog", {
          name: "Delete your account?",
        });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("listitem")).toHaveText([
          "Your 2 listed activities leave search.",
          "Their pages and addresses keep working, marked removed.",
          "You can restore everything by signing in with the same account within 30 days.",
          `After 30 days your sign-in details are deleted and the handle ${handle} is retired for good.`,
        ]);
        await expect(
          dialog.getByRole("button", { name: "Delete account" }),
        ).toBeDisabled();
        await expectAccessible();
      });

      await test.step("typing the handle and pressing Delete account shows the deleted screen, signed out", async () => {
        const dialog = page.getByRole("dialog", {
          name: "Delete your account?",
        });
        await dialog.getByLabel("Type your handle to confirm").fill(handle);
        const confirm = dialog.getByRole("button", { name: "Delete account" });
        await expect(confirm).toBeEnabled();

        requestedFrom = new Date();
        await confirm.click();

        await expect(
          main.getByRole("heading", {
            level: 1,
            name: "Your account has been deleted",
          }),
        ).toBeVisible();
        requestedTo = new Date();
        await expect(main).toContainText(
          "Your activities are out of search. Sign in with the same account within 30 days to restore it.",
        );
        await expect(dialog).toHaveCount(0);
        await expect(accountMenu(page)).toHaveCount(0);
        await expect(
          header.getByRole("link", { name: "Sign in", exact: true }),
        ).toBeVisible();
        await expectAccessible();
      });

      await test.step("Go to Durables goes home, and search no longer finds any of the activities", async () => {
        await main.getByRole("link", { name: "Go to Durables" }).click();
        await expect(page).toHaveURL("/");

        await page.goto(`/search?q=${word}`);

        await expect(
          main.getByRole("heading", { name: "No activities match" }),
        ).toBeVisible();
        await expect(cards).toHaveCount(0);
        await expectAccessible();
      });

      await test.step("each activity's page still opens at its address, marked removed by the publisher", async () => {
        for (const { title, address } of [...listed, earlierRemoved]) {
          await page.goto(`/${address}`);

          await expect(page).toHaveURL(`/${address}`);
          await expect(
            main.getByRole("heading", { level: 1, name: title }),
          ).toBeVisible();
          await expect(removedNotice).toContainText(
            "This activity no longer appears in search. Its page and every version's address still work",
          );
        }
        await expectAccessible();
      });

      await test.step("signing in again with the same provider account shows the Restore prompt", async () => {
        await signIn(first.identity);
        await page.goto(restorePromptPath);

        await expect(
          main.getByRole("heading", {
            level: 1,
            name: "Restore your account?",
          }),
        ).toBeVisible();
        await expect(main).toContainText(
          `Your account ${handle} is waiting to be deleted.`,
        );
        await expect(main).toContainText(
          finalDaySentence(requestedFrom, requestedTo),
        );
        await expect(main.getByRole("button")).toHaveText([
          "Restore",
          "Start as a new user",
        ]);
        // The prompt doesn't list the activities that come back.
        for (const { title } of [...listed, earlierRemoved]) {
          await expect(main.getByText(title)).toHaveCount(0);
        }
        await expectAccessible();
      });

      await test.step("Restore lands on the profile with the restored message", async () => {
        await main.getByRole("button", { name: "Restore" }).click();

        await expect(page).toHaveURL("/profile");
        await expect(
          page
            .getByRole("status")
            .filter({ hasText: "Your account is restored." }),
        ).toBeVisible();
        await expect(
          main.getByRole("heading", { level: 1, name: handle }),
        ).toBeVisible();
        await expect(accountMenu(page)).toHaveText(publisherInitials);
        await expectAccessible();
      });

      await test.step("the profile shows the listed activities back and the earlier one still removed", async () => {
        await expect(activities).toHaveCount(3);
        for (const { title } of listed) {
          await expect(activity(title)).toContainText("Listed");
          await expect(activity(title)).not.toContainText(
            "Removed from search",
          );
        }
        await expect(activity(earlierRemoved.title)).toContainText(
          "Removed from search",
        );
      });

      await test.step("search finds the listed activities again, and not the one removed earlier", async () => {
        await page.goto(`/search?q=${word}`);

        await expect(cards).toHaveCount(2);
        for (const { title } of listed) {
          await expect(card(title)).toBeVisible();
        }
        await expect(card(earlierRemoved.title)).toHaveCount(0);
        await expectAccessible();
      });

      await test.step("the listed activities' pages lose the removed notice, and the earlier one keeps it", async () => {
        for (const { title, address } of listed) {
          await page.goto(`/${address}`);

          await expect(
            main.getByRole("heading", { level: 1, name: title }),
          ).toBeVisible();
          await expect(removedNotice).toHaveCount(0);
        }

        await page.goto(`/${earlierRemoved.address}`);

        await expect(
          main.getByRole("heading", { level: 1, name: earlierRemoved.title }),
        ).toBeVisible();
        await expect(removedNotice).toBeVisible();
        await expectAccessible();
      });
    },
  );

  test(
    "a former publisher signs in again, starts as a new user, and chooses a new handle in Contribute because the old one is refused",
    { tag: "@journey" },
    async ({
      page,
      expectAccessible,
      deleteOwnAccount,
      publishOwnListing,
      signIn,
      uniqueHandle,
      uniqueWord,
    }) => {
      const listing = await publishOwnListing({
        code: sample("python"),
        title: `Post slack message ${uniqueWord()}`,
        name: "post-slack-message",
        description:
          "Posts a message to a Slack channel and returns its reference.",
      });
      await deleteOwnAccount(listing.handle);
      const main = page.getByRole("main");
      const field = page.getByLabel("Handle", { exact: true });
      const continueButton = page.getByRole("button", { name: "Continue" });

      await test.step("signed in again, any page leads to the Restore prompt", async () => {
        await signIn(listing.identity);
        await page.goto("/");

        await expect(page).toHaveURL(restorePromptPath);
        await expect(
          main.getByRole("heading", {
            level: 1,
            name: "Restore your account?",
          }),
        ).toBeVisible();
        await expect(main).toContainText(
          `Your account ${listing.handle} is waiting to be deleted.`,
        );
        await expectAccessible();
      });

      await test.step("Start as a new user continues into Contribute at Profile & Handle", async () => {
        await main.getByRole("button", { name: "Start as a new user" }).click();

        await expect(page).toHaveURL(newUserPath);
        await expect(
          page.getByRole("heading", { level: 2, name: "Choose your handle" }),
        ).toBeVisible();
        await expect(accountMenu(page)).toHaveText(publisherInitials);
        await expectAccessible();
      });

      await test.step("the old handle is refused as taken", async () => {
        await field.fill(listing.handle);

        await expect(
          page.getByText(`${listing.handle} is taken.`),
        ).toBeVisible();
        await expect(continueButton).toBeDisabled();
        await expectAccessible();
      });

      await test.step("a new handle is accepted and continues to the Code step", async () => {
        const fresh = uniqueHandle("again");
        await field.fill(fresh);
        await expect(page.getByText(`${fresh} is available.`)).toBeVisible();

        await continueButton.click();

        await expectOnCodeStep(page);
        await expectAccessible();
      });
    },
  );
});
