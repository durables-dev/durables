import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
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
    async ({
      page,
      expectAccessible,
      publishListing,
      setChips,
      uniqueWord,
    }) => {
      const title = `Upload report ${uniqueWord()}`;
      const listing = await publishListing({
        code: sample("typescript"),
        title,
        name: "report-upload",
        description: "Uploads a CSV report to S3 and returns where it is.",
      });
      // Publishing gives a listing no chips; an operator's migration gives it Amazon S3.
      await setChips(listing, ["Amazon S3"]);
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
      setChips,
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

      if (journey.integration !== undefined) {
        const { integration } = journey;
        await test.step(`a release gives the listing its ${integration} chip`, async () => {
          // Publishing gives a listing no chips; an operator's migration gives them.
          await setChips({ handle, name: journey.name }, [integration]);
        });
      }

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

// Publishing a new version, deprecating a version and taking an activity out of search (API map
// D22 to D31, D33 to D46). Every version in these journeys is published from python.txt, so the
// Details step suggests the next minor version.

/** The Slack activity in python.txt, as its publisher describes it. */
const slackDescription =
  "Posts a message to a Slack channel and returns its reference.";

function listingControls(page: Page) {
  return page
    .getByRole("main")
    .getByRole("region", { name: "Your listing controls" });
}

/** The Versions section's rows, newest first. */
function versionRows(page: Page) {
  return page
    .getByRole("main")
    .getByRole("list", { name: "Versions" })
    .getByRole("listitem");
}

/** A notice at the top of a version's page, found by its own words. */
function notice(page: Page, text: string) {
  return page.getByRole("main").getByRole("status").filter({ hasText: text });
}

function olderVersionNotice(page: Page) {
  return notice(page, "an older version");
}

function deprecatedNotice(page: Page) {
  return notice(page, "is deprecated by the publisher");
}

function removedNotice(page: Page) {
  return notice(page, "Removed by the publisher.");
}

const removedNoticeText =
  "Removed by the publisher. This activity no longer appears in search. Its page and every version's address still work, so existing links and workflows don't break.";

/**
 * The page's robots marking. Head metadata has no role, label or text, so this is the one
 * place these journeys locate an element by CSS.
 */
function robotsMeta(page: Page) {
  return page.locator('meta[name="robots"]');
}

/** A version's radio in the Create a new version dialog, named by its number then its note. */
function versionChoice(page: Page, version: string) {
  return page
    .getByRole("dialog", { name: "Create a new version" })
    .getByRole("radio", {
      name: new RegExp(`^${version.replaceAll(".", "\\.")}(?![\\d.])`),
    });
}

/**
 * From the Code step in new-version mode, pastes python.txt and goes through Detected to
 * Details, then uses the suggested version, types the What changed note and continues to Review.
 */
async function newVersionToReview(
  page: Page,
  paste: (field: Locator, text: string) => Promise<void>,
  { version, whatChanged }: { version: string; whatChanged: string },
) {
  const continueButton = page.getByRole("button", { name: "Continue" });
  await expect(page).toHaveURL("/contribute/code");
  await paste(
    page.getByLabel("Paste your file", { exact: true }),
    sample("python"),
  );
  await expect(
    page.getByText(/^✓ Found post_slack_message \(Python\)/),
  ).toBeVisible();
  await continueButton.click();
  await expect(page).toHaveURL("/contribute/detected");
  await continueButton.click();
  await expect(page).toHaveURL("/contribute/details");

  await page.getByRole("button", { name: `Use ${version}` }).click();
  await expect(page.getByLabel("Version", { exact: true })).toHaveValue(
    version,
  );
  await page.getByLabel("What changed", { exact: true }).fill(whatChanged);
  await continueButton.click();
  await expect(page).toHaveURL("/contribute/review");
}

/** Checks the six confirmations on the Review step. */
async function confirmAll(page: Page) {
  const confirmations = page
    .getByRole("group", { name: "Before you publish, confirm each of these" })
    .getByRole("checkbox");
  await expect(confirmations).toHaveCount(6);
  for (const box of await confirmations.all()) {
    await box.check();
  }
}

test.describe("publishing new versions", () => {
  test(
    "a publisher starts a new version from an older version, publishes it with a What changed note, and the older version's page points to the new latest",
    { tag: "@journey" },
    async ({
      page,
      expectAccessible,
      paste,
      publishOwnListing,
      publishVersionThroughApi,
      uniqueWord,
    }) => {
      const code = sample("python");
      const title = `Post slack message ${uniqueWord()}`;
      const first = await publishOwnListing({
        code,
        title,
        name: "post-slack-message",
        description: slackDescription,
      });
      const retryNote = "Retries when Slack rate-limits the call.";
      await publishVersionThroughApi(first, {
        code,
        title,
        description: slackDescription,
        version: "1.1.0",
        basedOn: "1.0.0",
        whatChanged: retryNote,
      });
      const { handle, name } = first;
      const threadNote = "Posts a threaded reply when a thread is given.";
      const newest = `${handle}/${name}@1.2.0`;
      const main = page.getByRole("main");
      const dialog = page.getByRole("dialog", { name: "Create a new version" });
      const continueButton = page.getByRole("button", { name: "Continue" });
      const published = page.getByRole("region", { name: "Published" });

      await test.step("the older version's page says it's older and links to 1.1.0, the latest", async () => {
        await page.goto(`/${first.address}`);

        await expect(
          main.getByRole("heading", { level: 1, name: title }),
        ).toBeVisible();
        await expect(olderVersionNotice(page)).toContainText(
          "You're viewing 1.0.0, an older version. It stays available at its own address, unchanged.",
        );
        await expect(
          olderVersionNotice(page).getByRole("link", {
            name: "View the latest, 1.1.0",
          }),
        ).toBeVisible();
        await expectAccessible();
      });

      await test.step("Create new version opens the dialog, starting on the version being viewed", async () => {
        await listingControls(page)
          .getByRole("button", { name: "Create new version" })
          .click();

        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("radio")).toHaveCount(2);
        await expect(versionChoice(page, "1.1.0")).toBeVisible();
        await expect(versionChoice(page, "1.0.0")).toBeChecked();
        await expect(
          dialog.getByText(
            "The new version number must be higher than 1.1.0, the latest.",
          ),
        ).toBeVisible();
        await expectAccessible();
      });

      await test.step("Start from 1.0.0 opens Contribute in new-version mode at the Code step", async () => {
        await dialog.getByRole("button", { name: "Start from 1.0.0" }).click();

        await expect(page).toHaveURL("/contribute/code");
        await expect(
          page.getByRole("heading", { level: 1, name: "New version" }),
        ).toBeVisible();
        await expect(main).toContainText(`${handle}/${name}`);
        await expect(main).toContainText(
          "Based on 1.0.0. Title and description are filled in from it. The code and its behavior start fresh.",
        );
        await expect(stepLink(page, "Code")).toHaveAttribute(
          "aria-current",
          "step",
        );
        await expectAccessible();
      });

      await test.step("paste the activity and go through Detected to Details", async () => {
        await paste(page.getByLabel("Paste your file", { exact: true }), code);
        await expect(
          page.getByText(/^✓ Found post_slack_message \(Python\)/),
        ).toBeVisible();
        await continueButton.click();
        await expect(page).toHaveURL("/contribute/detected");
        await continueButton.click();

        await expect(page).toHaveURL("/contribute/details");
      });

      await test.step("Details starts from 1.0.0 and suggests 1.2.0, above the latest", async () => {
        const version = page.getByLabel("Version", { exact: true });
        await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
          title,
        );
        await expect(
          page.getByLabel("Name in the address", { exact: true }),
        ).toHaveValue(name);
        await expect(
          page.getByLabel("One-line description", { exact: true }),
        ).toHaveValue(slackDescription);
        await expect(version).toHaveValue("");
        await expect(version).toHaveAttribute("placeholder", "1.2.0");
        await expect(page.getByText("Suggested: 1.2.0.")).toBeVisible();
        await expect(continueButton).toBeDisabled();

        await page.getByRole("button", { name: "Use 1.2.0" }).click();
        await page.getByLabel("What changed", { exact: true }).fill(threadNote);

        await expect(version).toHaveValue("1.2.0");
        await expect(page.getByText("✓ 1.2.0 is available.")).toBeVisible();
        await expect(page.getByText(`durables.dev/${newest}`)).toBeVisible();
        await expect(continueButton).toBeEnabled();
        await expectAccessible();
        await continueButton.click();
      });

      await test.step("review, leave 1.0.0 as it is, confirm the six terms and publish 1.2.0", async () => {
        const publishButton = page.getByRole("button", {
          name: "Publish 1.2.0",
        });
        await expect(page).toHaveURL("/contribute/review");
        await expect(
          page.getByRole("checkbox", { name: "Deprecate 1.0.0" }),
        ).not.toBeChecked();
        await expect(
          page.getByText("Publishing returns this activity to search."),
        ).toHaveCount(0);
        await expect(publishButton).toBeDisabled();
        await expectAccessible();

        await confirmAll(page);
        await publishButton.click();

        await expect(page).toHaveURL("/contribute/published");
        await expect(published.getByText(/is live\./)).toHaveText(
          `${newest} is live. It's now the latest version. Earlier versions stay available at their own addresses.`,
        );
        await expectAccessible();
      });

      await test.step("View the listing opens 1.2.0 as the latest, with its note in the Versions list", async () => {
        await published.getByRole("link", { name: "View the listing" }).click();

        await expect(page).toHaveURL(`/${newest}`);
        await expect(
          main.getByRole("heading", { level: 1, name: title }),
        ).toBeVisible();
        await expect(main).toContainText(newest);
        await expect(olderVersionNotice(page)).toHaveCount(0);

        await page
          .getByRole("navigation", { name: "Page sections" })
          .getByRole("link", { name: "Versions", exact: true })
          .click();
        const rows = versionRows(page);
        await expect(rows).toHaveCount(3);
        await expect(rows.nth(0)).toContainText("1.2.0 · latest");
        await expect(rows.nth(0)).toContainText(threadNote);
        await expect(rows.nth(0)).toContainText("Based on 1.0.0");
        await expect(rows.nth(0)).toContainText("Viewing");
        await expect(rows.nth(1)).toContainText("1.1.0");
        await expect(rows.nth(1)).not.toContainText("latest");
        await expect(rows.nth(1)).toContainText(retryNote);
        await expect(rows.nth(1)).toContainText("Based on 1.0.0");
        await expect(rows.nth(2)).toContainText("1.0.0");
        await expect(rows.nth(2)).toContainText("First release.");
        await expect(rows.nth(2)).toContainText("First version");
        await expectAccessible();
      });

      await test.step("the older version's page now links to 1.2.0, which opens the latest", async () => {
        await versionRows(page)
          .nth(2)
          .getByRole("link", { name: "View 1.0.0" })
          .click();

        await expect(page).toHaveURL(`/${first.address}`);
        await expect(olderVersionNotice(page)).toContainText(
          "You're viewing 1.0.0, an older version.",
        );
        await olderVersionNotice(page)
          .getByRole("link", { name: "View the latest, 1.2.0" })
          .click();

        await expect(page).toHaveURL(`/${newest}`);
        await expect(
          main.getByRole("heading", { level: 1, name: title }),
        ).toBeVisible();
        await expect(olderVersionNotice(page)).toHaveCount(0);
      });
    },
  );

  test(
    "a publisher publishes a new version that deprecates its base, and the base's page shows the reason and links to the new version",
    { tag: "@journey" },
    async ({
      page,
      expectAccessible,
      paste,
      publishOwnListing,
      uniqueWord,
    }) => {
      const title = `Post slack message ${uniqueWord()}`;
      const first = await publishOwnListing({
        code: sample("python"),
        title,
        name: "post-slack-message",
        description: slackDescription,
      });
      const replacement = `${first.handle}/${first.name}@1.1.0`;
      const reason =
        "Replaced by 1.1.0, which retries when Slack rate-limits the call.";
      const main = page.getByRole("main");
      const published = page.getByRole("region", { name: "Published" });
      const dialog = page.getByRole("dialog", { name: "Create a new version" });

      await test.step("start a new version from 1.0.0, the only version", async () => {
        await page.goto(`/${first.address}`);
        await expect(
          main.getByRole("heading", { level: 1, name: title }),
        ).toBeVisible();
        await expect(deprecatedNotice(page)).toHaveCount(0);

        await listingControls(page)
          .getByRole("button", { name: "Create new version" })
          .click();
        await expect(dialog.getByRole("radio")).toHaveCount(1);
        await expect(versionChoice(page, "1.0.0")).toBeChecked();
        await dialog.getByRole("button", { name: "Start from 1.0.0" }).click();

        await newVersionToReview(page, paste, {
          version: "1.1.0",
          whatChanged: "Retries when Slack rate-limits the call.",
        });
      });

      await test.step("check Deprecate 1.0.0 and see the reason start as Replaced by 1.1.0", async () => {
        const deprecateBase = page.getByRole("checkbox", {
          name: "Deprecate 1.0.0",
        });
        const reasonField = page.getByLabel("Reason", { exact: true });
        await expect(deprecateBase).not.toBeChecked();
        await expect(reasonField).toHaveCount(0);

        await deprecateBase.check();

        await expect(reasonField).toHaveValue("Replaced by 1.1.0");
        await reasonField.fill(reason);
        await confirmAll(page);
        await expectAccessible();
      });

      await test.step("publish 1.1.0 and open it, with 1.0.0 marked deprecated in the Versions list", async () => {
        await page.getByRole("button", { name: "Publish 1.1.0" }).click();
        await expect(published.getByText(/is live\./)).toContainText(
          `${replacement} is live. It's now the latest version.`,
        );
        await published.getByRole("link", { name: "View the listing" }).click();

        await expect(page).toHaveURL(`/${replacement}`);
        await expect(deprecatedNotice(page)).toHaveCount(0);
        const rows = versionRows(page);
        await expect(rows).toHaveCount(2);
        await expect(rows.nth(0)).toContainText("1.1.0 · latest");
        await expect(rows.nth(0)).not.toContainText("Deprecated");
        await expect(rows.nth(1)).toContainText("Deprecated · use 1.1.0");
        await expectAccessible();
      });

      await test.step("the base's page shows the deprecated notice with the reason, and no older-version notice", async () => {
        await versionRows(page)
          .nth(1)
          .getByRole("link", { name: "View 1.0.0" })
          .click();

        await expect(page).toHaveURL(`/${first.address}`);
        await expect(deprecatedNotice(page)).toContainText(
          "1.0.0 is deprecated by the publisher",
        );
        await expect(deprecatedNotice(page)).toContainText(reason);
        await expect(olderVersionNotice(page)).toHaveCount(0);
        await expect(
          listingControls(page).getByRole("button", {
            name: "Undo deprecation",
          }),
        ).toBeVisible();
        await expectAccessible();
      });

      await test.step("Use 1.1.0 instead opens the new version", async () => {
        await deprecatedNotice(page)
          .getByRole("link", { name: "Use 1.1.0 instead" })
          .click();

        await expect(page).toHaveURL(`/${replacement}`);
        await expect(
          main.getByRole("heading", { level: 1, name: title }),
        ).toBeVisible();
        await expect(main).toContainText(replacement);
      });
    },
  );
});

test.describe("deprecating a version", () => {
  test(
    "a publisher deprecates an older version with a reason and the latest as its replacement, sees the notice after a reload, then undoes it",
    { tag: "@journey" },
    async ({
      page,
      expectAccessible,
      publishOwnListing,
      publishVersionThroughApi,
      uniqueWord,
    }) => {
      const code = sample("python");
      const title = `Post slack message ${uniqueWord()}`;
      const first = await publishOwnListing({
        code,
        title,
        name: "post-slack-message",
        description: slackDescription,
      });
      const latest = await publishVersionThroughApi(first, {
        code,
        title,
        description: slackDescription,
        version: "1.1.0",
        basedOn: "1.0.0",
        whatChanged: "Retries when Slack rate-limits the call.",
      });
      const reason = "Posts twice when Slack is slow to answer.";
      const main = page.getByRole("main");
      const controls = listingControls(page);
      const dialog = page.getByRole("dialog", { name: "Deprecate 1.0.0" });
      const undo = controls.getByRole("button", { name: "Undo deprecation" });

      await test.step("the older version's page offers Deprecate 1.0.0 in the publisher bar", async () => {
        await page.goto(`/${first.address}`);

        await expect(
          main.getByRole("heading", { level: 1, name: title }),
        ).toBeVisible();
        await expect(olderVersionNotice(page)).toBeVisible();
        await expect(deprecatedNotice(page)).toHaveCount(0);
        // The closed dialogs inside the bar are hidden, so these are the bar's own buttons.
        await expect(controls.getByRole("button")).toHaveText([
          "Update",
          "Deprecate 1.0.0",
          "Create new version",
          "Remove",
        ]);
      });

      await test.step("Deprecate 1.0.0 opens the dialog, pointing to the latest, with Deprecate disabled until a reason is typed", async () => {
        await controls.getByRole("button", { name: "Deprecate 1.0.0" }).click();

        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAccessibleDescription(
          "The version stays available at its address and doesn't change. Its page shows your notice.",
        );
        const pointTo = dialog.getByLabel("Point people to", { exact: true });
        await expect(pointTo).toHaveValue("1.1.0");
        await expect(pointTo.getByRole("option")).toHaveText([
          "No replacement",
          "1.1.0 (latest)",
        ]);
        await expect(
          dialog.getByRole("button", { name: "Deprecate 1.0.0" }),
        ).toBeDisabled();
        await expectAccessible();
      });

      await test.step("type a reason and deprecate, and the notice shows with the reason and a link to 1.1.0", async () => {
        await dialog.getByLabel("Reason", { exact: true }).fill(reason);
        await dialog.getByRole("button", { name: "Deprecate 1.0.0" }).click();

        await expect(dialog).toBeHidden();
        await expect(deprecatedNotice(page)).toContainText(
          "1.0.0 is deprecated by the publisher",
        );
        await expect(deprecatedNotice(page)).toContainText(reason);
        await expect(
          deprecatedNotice(page).getByRole("link", {
            name: "Use 1.1.0 instead",
          }),
        ).toHaveAttribute("href", `/${latest.address}`);
        await expect(olderVersionNotice(page)).toHaveCount(0);
        await expect(undo).toBeVisible();
        await expect(versionRows(page).nth(1)).toContainText(
          "Deprecated · use 1.1.0",
        );
        await expectAccessible();
      });

      await test.step("after a reload the deprecation is still there", async () => {
        await page.reload();

        await expect(deprecatedNotice(page)).toContainText(reason);
        await expect(undo).toBeVisible();
      });

      await test.step("Undo deprecation removes the notice at once and brings back the older-version notice", async () => {
        await undo.click();

        await expect(deprecatedNotice(page)).toHaveCount(0);
        await expect(
          controls.getByRole("button", { name: "Deprecate 1.0.0" }),
        ).toBeVisible();
        await expect(olderVersionNotice(page)).toBeVisible();
        await expectAccessible();
      });

      await test.step("after a reload the notice is still gone", async () => {
        await page.reload();

        await expect(
          main.getByRole("heading", { level: 1, name: title }),
        ).toBeVisible();
        await expect(olderVersionNotice(page)).toBeVisible();
        await expect(deprecatedNotice(page)).toHaveCount(0);
        await expect(versionRows(page)).toHaveCount(2);
        await expect(versionRows(page).nth(1)).not.toContainText("Deprecated");
      });
    },
  );
});

test.describe("removing an activity from search", () => {
  /**
   * Scrolls the results to the last card, as a consumer does to load the next batch, until the
   * target finds the number of elements expected.
   */
  async function scrollUntil(page: Page, target: Locator) {
    const cards = page.getByRole("main").getByRole("article");
    await expect(async () => {
      await cards.last().scrollIntoViewIfNeeded();
      await expect(target).toBeVisible({ timeout: 1_000 });
    }).toPass();
  }

  test(
    "a publisher removes an activity from search, it leaves search, browse, search by publisher and the sitemap while every version's page still works, and returning it brings it back",
    { tag: "@journey" },
    async ({
      page,
      expectAccessible,
      publishOwnListing,
      publishThroughApi,
      publishVersionThroughApi,
      uniqueWord,
    }) => {
      const word = uniqueWord();
      const code = sample("python");
      // Three activities by one publisher. Browse is newest first, and activities published in
      // the same second are ordered by name, so it shows them as alert, post, send. Once the
      // two either side of the removed one have loaded, its absence from browse is certain.
      const send = await publishOwnListing({
        code,
        title: `Send slack digest ${word}`,
        name: "send-slack-digest",
        description: slackDescription,
      });
      const postTitle = `Post slack message ${word}`;
      const postFirst = await publishThroughApi({
        code,
        title: postTitle,
        name: "post-slack-message",
        description: slackDescription,
      });
      const post = await publishVersionThroughApi(
        {
          ...postFirst,
          address: `${postFirst.handle}/${postFirst.name}@${postFirst.version}`,
        },
        {
          code,
          title: postTitle,
          description: slackDescription,
          version: "1.1.0",
          basedOn: "1.0.0",
          whatChanged: "Retries when Slack rate-limits the call.",
        },
      );
      const alertTitle = `Alert slack channel ${word}`;
      await publishThroughApi({
        code,
        title: alertTitle,
        name: "alert-slack-channel",
        description: slackDescription,
      });
      const { handle } = send;
      const allThree = [alertTitle, postTitle, `Send slack digest ${word}`];
      const listedTwo = [alertTitle, `Send slack digest ${word}`];
      const postAddresses = [
        `${handle}/post-slack-message@1.0.0`,
        post.address,
      ];
      const sitemapEntry = `/${handle}/post-slack-message@`;

      const main = page.getByRole("main");
      const cards = main.getByRole("article");
      const card = (title: string) =>
        main.getByRole("article", { name: title, exact: true });
      const mine = cards.filter({ hasText: word });
      const controls = listingControls(page);
      const dialog = page.getByRole("dialog", { name: "Remove from search?" });

      async function sitemap(): Promise<string> {
        const response = await page.request.get("/sitemap.xml");
        expect(response.status()).toBe(200);
        return response.text();
      }

      async function expectFound(titles: string[]) {
        await page.goto(`/search?q=${word}`);
        await expect(cards).toHaveCount(titles.length);
        for (const title of titles) {
          await expect(card(title)).toBeVisible();
        }

        await page.goto(`/search?publisher=${handle}`);
        await expect(cards.getByRole("heading")).toHaveText(titles);

        await page.goto("/search");
        await scrollUntil(page, card(`Send slack digest ${word}`));
        await expect(mine.getByRole("heading")).toHaveText(titles);
      }

      await test.step("before removal, search, browse and search by publisher list all three, and the sitemap lists its latest version", async () => {
        await expectFound(allThree);
        expect(await sitemap()).toContain(`/${post.address}</loc>`);
      });

      await test.step("Remove opens the dialog, which says what keeps working", async () => {
        await page.goto(`/${post.address}`);
        await expect(
          main.getByRole("heading", { level: 1, name: postTitle }),
        ).toBeVisible();
        await expect(removedNotice(page)).toHaveCount(0);
        await expect(robotsMeta(page)).toHaveCount(0);

        await controls.getByRole("button", { name: "Remove" }).click();

        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAccessibleDescription(
          `Removing ${handle}/post-slack-message takes every version out of search.`,
        );
        await expect(dialog.getByRole("listitem")).toHaveText([
          "Its page stays up, marked “Removed by the publisher.”",
          "Every version's address keeps working.",
          "Copies people already took are theirs and aren't affected.",
          "You can return it to search later.",
        ]);
        await expectAccessible();
      });

      await test.step("Remove from search marks the page removed and not to be indexed", async () => {
        await dialog
          .getByRole("button", { name: "Remove from search" })
          .click();

        await expect(dialog).toBeHidden();
        await expect(removedNotice(page)).toHaveText(removedNoticeText);
        await expect(controls).toContainText(
          "You published this activity. It's hidden from search.",
        );
        await expect(
          controls.getByRole("button", { name: "Return to search" }),
        ).toBeVisible();
        await expect(robotsMeta(page)).toHaveAttribute("content", "noindex");
        await expectAccessible();
      });

      await test.step("search, browse, search by publisher and the sitemap leave it out", async () => {
        await expectFound(listedTwo);
        await expect(card(postTitle)).toHaveCount(0);
        expect(await sitemap()).not.toContain(sitemapEntry);
      });

      await test.step("every version's page and address still work, marked removed and not to be indexed", async () => {
        for (const address of postAddresses) {
          const version = address.split("@")[1] ?? "";
          const read = await page.request.get(
            `/api/activities/${handle}/post-slack-message/versions/${version}`,
          );
          expect(read.status()).toBe(200);

          await page.goto(`/${address}`);

          await expect(page).toHaveURL(`/${address}`);
          await expect(
            main.getByRole("heading", { level: 1, name: postTitle }),
          ).toBeVisible();
          await expect(main).toContainText(address);
          await expect(removedNotice(page)).toHaveText(removedNoticeText);
          await expect(robotsMeta(page)).toHaveAttribute("content", "noindex");
          await expectAccessible();
        }
      });

      await test.step("Return to search brings it back at once, and a reload agrees", async () => {
        await page.goto(`/${post.address}`);
        await controls
          .getByRole("button", { name: "Return to search" })
          .click();

        await expect(removedNotice(page)).toHaveCount(0);
        await expect(controls).toContainText(
          "You published this activity. Only you see these controls.",
        );
        await expect(
          controls.getByRole("button", { name: "Remove" }),
        ).toBeVisible();
        await expect(robotsMeta(page)).toHaveCount(0);
        await expectAccessible();

        await page.reload();

        await expect(
          main.getByRole("heading", { level: 1, name: postTitle }),
        ).toBeVisible();
        await expect(removedNotice(page)).toHaveCount(0);
        await expect(robotsMeta(page)).toHaveCount(0);
      });

      await test.step("search, browse, search by publisher and the sitemap list it again", async () => {
        await expectFound(allThree);
        expect(await sitemap()).toContain(`/${post.address}</loc>`);
      });
    },
  );

  test(
    "a publisher publishes a new version of a removed activity, and publishing returns it to search",
    { tag: "@journey" },
    async ({
      page,
      expectAccessible,
      paste,
      publishOwnListing,
      removeFromSearch,
      uniqueWord,
    }) => {
      const word = uniqueWord();
      const title = `Post slack message ${word}`;
      const first = await publishOwnListing({
        code: sample("python"),
        title,
        name: "post-slack-message",
        description: slackDescription,
      });
      await removeFromSearch(first);
      const newest = `${first.handle}/${first.name}@1.1.0`;
      const main = page.getByRole("main");
      const resultCard = main.getByRole("article", {
        name: title,
        exact: true,
      });
      const published = page.getByRole("region", { name: "Published" });
      const controls = listingControls(page);

      await test.step("search doesn't find the removed activity", async () => {
        await page.goto(`/search?q=${word}`);

        await expect(
          main.getByRole("heading", { name: "No activities match" }),
        ).toBeVisible();
        await expect(resultCard).toHaveCount(0);
      });

      await test.step("from its page, start a new version and see that publishing returns it to search", async () => {
        await page.goto(`/${first.address}`);
        await expect(removedNotice(page)).toBeVisible();
        await expect(controls).toContainText("It's hidden from search.");

        await controls
          .getByRole("button", { name: "Create new version" })
          .click();
        await page
          .getByRole("dialog", { name: "Create a new version" })
          .getByRole("button", { name: "Start from 1.0.0" })
          .click();
        await newVersionToReview(page, paste, {
          version: "1.1.0",
          whatChanged: "Retries when Slack rate-limits the call.",
        });

        await expect(
          page.getByText("Publishing returns this activity to search.", {
            exact: true,
          }),
        ).toBeVisible();
        await expectAccessible();
      });

      await test.step("publish 1.1.0 and open it, listed again", async () => {
        await confirmAll(page);
        await page.getByRole("button", { name: "Publish 1.1.0" }).click();
        await published.getByRole("link", { name: "View the listing" }).click();

        await expect(page).toHaveURL(`/${newest}`);
        await expect(removedNotice(page)).toHaveCount(0);
        await expect(robotsMeta(page)).toHaveCount(0);
        await expect(controls).toContainText("Only you see these controls.");
        await expect(
          controls.getByRole("button", { name: "Remove" }),
        ).toBeVisible();
        await expectAccessible();
      });

      await test.step("search finds it again at its new version, and its first version loses the removed notice", async () => {
        await page.goto(`/search?q=${word}`);

        await expect(resultCard).toContainText(newest);

        await page.goto(`/${first.address}`);

        await expect(
          main.getByRole("heading", { level: 1, name: title }),
        ).toBeVisible();
        await expect(removedNotice(page)).toHaveCount(0);
      });
    },
  );
});

test.describe("a consumer viewing a deprecated and removed activity", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "a signed-out consumer sees the deprecated and removed notices, follows the replacement, and sees no publisher controls",
    { tag: "@journey" },
    async ({
      page,
      expectAccessible,
      deprecateThroughApi,
      publishOwnListing,
      publishVersionThroughApi,
      removeFromSearch,
      uniqueWord,
    }) => {
      const code = sample("python");
      const title = `Post slack message ${uniqueWord()}`;
      const reason = "Posts twice when Slack is slow to answer.";
      // The publisher deprecates 1.0.0 for 1.1.0 and takes the activity out of search, then
      // signs out, so the page visits as a consumer.
      const first = await publishOwnListing({
        code,
        title,
        name: "post-slack-message",
        description: slackDescription,
      });
      const latest = await publishVersionThroughApi(first, {
        code,
        title,
        description: slackDescription,
        version: "1.1.0",
        basedOn: "1.0.0",
        whatChanged: "Retries when Slack rate-limits the call.",
      });
      await deprecateThroughApi(first, reason, "1.1.0");
      await removeFromSearch(first);
      await page.context().clearCookies();

      const main = page.getByRole("main");
      const publisherButtons = [
        "Update",
        "Deprecate 1.0.0",
        "Deprecate 1.1.0",
        "Undo deprecation",
        "Create new version",
        "Remove",
        "Return to search",
      ];

      async function expectNoPublisherControls() {
        await expect(
          page.getByRole("banner").getByRole("link", {
            name: "Sign in",
            exact: true,
          }),
        ).toBeVisible();
        await expect(accountMenu(page)).toHaveCount(0);
        await expect(listingControls(page)).toHaveCount(0);
        await expect(
          page.getByText("You published this activity."),
        ).toHaveCount(0);
        for (const name of publisherButtons) {
          await expect(
            page.getByRole("button", { name, exact: true }),
          ).toHaveCount(0);
        }
      }

      await test.step("the deprecated version's page shows both notices and no publisher controls", async () => {
        const session = page.waitForResponse(
          (response) => new URL(response.url()).pathname === "/api/session",
        );
        await page.goto(`/${first.address}`);
        expect((await session).status()).toBe(200);

        await expect(
          main.getByRole("heading", { level: 1, name: title }),
        ).toBeVisible();
        await expect(deprecatedNotice(page)).toContainText(
          "1.0.0 is deprecated by the publisher",
        );
        await expect(deprecatedNotice(page)).toContainText(reason);
        await expect(removedNotice(page)).toHaveText(removedNoticeText);
        await expect(olderVersionNotice(page)).toHaveCount(0);
        await expect(versionRows(page).nth(1)).toContainText(
          "Deprecated · use 1.1.0",
        );
        await expectNoPublisherControls();
        await expectAccessible();
      });

      await test.step("Use 1.1.0 instead opens the replacement, still marked removed and with no publisher controls", async () => {
        await deprecatedNotice(page)
          .getByRole("link", { name: "Use 1.1.0 instead" })
          .click();

        await expect(page).toHaveURL(`/${latest.address}`);
        await expect(
          main.getByRole("heading", { level: 1, name: title }),
        ).toBeVisible();
        await expect(removedNotice(page)).toHaveText(removedNoticeText);
        await expect(deprecatedNotice(page)).toHaveCount(0);
        await expectNoPublisherControls();
        await expectAccessible();
      });
    },
  );
});
