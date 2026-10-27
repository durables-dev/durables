import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { expect, publisherName, test, type FakeIdentity } from "../fixtures";

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

// The Code and Detected steps: paste a file, see what the check found or why it refused the
// file, read the code that will be published, and see the eight facts on Detected.

/** A file from samples/, exactly as written. */
function sample(name: string): string {
  return readFileSync(
    new URL(`../samples/${name}.txt`, import.meta.url),
    "utf8",
  );
}

/** Every line holding `text`, numbered from 1 as the editor numbers lines. */
function linesOf(code: string, text: string): number[] {
  return code
    .split("\n")
    .flatMap((line, index) => (line.includes(text) ? [index + 1] : []));
}

/** The one line holding `text`, numbered from 1 as the editor numbers lines. */
function lineOf(code: string, text: string): number {
  const [line, ...others] = linesOf(code, text);
  if (line === undefined || others.length > 0) {
    throw new Error(`Expected exactly one line holding ${text}`);
  }
  return line;
}

/** The checks' size limit, in bytes (api: checks/size-limit.ts). */
const limitBytes = 100 * 1024;

/** A real activity padded with comment lines until it is just over the size limit. */
function overTheLimit(code: string): string {
  const filler = "# This line pads the file past the size limit.\n";
  const lines = Math.ceil(
    (limitBytes - Buffer.byteLength(code)) / filler.length,
  );
  const padded = `${code}${filler.repeat(lines + 1)}`;
  if (Buffer.byteLength(padded) <= limitBytes) {
    throw new Error("The padded file is not over the size limit");
  }
  return padded;
}

const factLabels = [
  "SDK",
  "Activity",
  "Input → output",
  "Runs as",
  "Non-retryable errors",
  "Configuration read",
  "Dependencies",
  "Heartbeats",
];

interface AcceptedSample {
  sdk: "Python" | "TypeScript" | ".NET";
  code: string;
  activity: string;
  /** The card's eight values, in the order of `factLabels`. */
  facts: string[];
}

const python = sample("python");
const typescript = sample("typescript");
const dotnet = sample("dotnet");

const accepted: AcceptedSample[] = [
  {
    sdk: "Python",
    code: python,
    activity: "post_slack_message",
    facts: [
      "Python",
      "post_slack_message",
      "SlackMessage → MessageRef",
      "Async",
      `Raised on line ${String(lineOf(python, "non_retryable=True"))}`,
      `SLACK_TOKEN (line ${String(lineOf(python, 'os.environ["SLACK_TOKEN"]'))})`,
      "httpx",
      `Yes, line ${String(lineOf(python, "activity.heartbeat("))}`,
    ],
  },
  {
    sdk: "TypeScript",
    code: typescript,
    activity: "uploadReport",
    facts: [
      "TypeScript",
      "uploadReport",
      "ReportUpload → StoredReport",
      "Async",
      `Raised on lines ${linesOf(typescript, "ApplicationFailure.nonRetryable(").join(", ")}`,
      `AWS_REGION (line ${String(lineOf(typescript, "process.env.AWS_REGION"))}), REPORTS_BUCKET (line ${String(lineOf(typescript, 'process.env["REPORTS_BUCKET"]'))})`,
      "@aws-sdk/client-s3",
      `Yes, line ${String(lineOf(typescript, "heartbeat({ key })"))}`,
    ],
  },
  {
    sdk: ".NET",
    code: dotnet,
    activity: "RefundPaymentAsync",
    facts: [
      ".NET",
      "RefundPaymentAsync",
      "RefundRequest → RefundResult",
      "Async",
      `Raised on line ${String(lineOf(dotnet, "nonRetryable: true"))}`,
      `STRIPE_API_KEY (line ${String(lineOf(dotnet, 'GetEnvironmentVariable("STRIPE_API_KEY")'))})`,
      "Stripe",
      `Yes, line ${String(lineOf(dotnet, ".Heartbeat("))}`,
    ],
  },
];

const twoActivitiesMessage =
  "This file has 2 activities. Durables publishes one activity per file. Paste a file with only the one you want to share.";

const refusals = [
  {
    file: "a file with no activity",
    code: sample("python-workflow-only"),
    message:
      "Found the SDK but no activity function with typed input and output.",
  },
  {
    file: "a file in no recognised SDK",
    code: sample("not-temporal"),
    message:
      "This doesn't look like a Python, TypeScript or .NET Temporal activity.",
  },
  {
    file: "a Java activity",
    code: sample("java"),
    message:
      "Durables accepts Python, TypeScript and .NET activities. This file looks like a Java activity.",
  },
  {
    file: "a file with two activities",
    code: sample("python-two-activities"),
    message: twoActivitiesMessage,
  },
  {
    file: "a file over 100 KB",
    code: overTheLimit(python),
    message: "This file is too large to check. The limit is 100 KB.",
  },
];

function foundLine(page: Page, { activity, sdk }: AcceptedSample) {
  return page.getByText(
    `✓ Found ${activity} (${sdk}). Next, check what we detected.`,
    { exact: true },
  );
}

function anyFoundLine(page: Page) {
  return page.getByText(/^✓ Found /);
}

function editor(page: Page) {
  return page.getByLabel("Paste your file", { exact: true });
}

function continueButton(page: Page) {
  return page.getByRole("button", { name: "Continue" });
}

function viewButton(page: Page) {
  return page.getByRole("button", { name: "View what will be published" });
}

function publishedDialog(page: Page) {
  return page.getByRole("dialog", { name: "What will be published" });
}

function factsCard(page: Page) {
  return page.getByRole("region", { name: "What we found" });
}

/** The editor's gutter numbers, 1 to the last line, as its text reads. */
function gutterText(code: string): string {
  const count = code.split("\n").length;
  return Array.from({ length: count }, (_, at) => String(at + 1)).join(" ");
}

async function openCodeStep(page: Page) {
  await page.goto("/contribute/code");
  await expect(page).toHaveURL("/contribute/code");
  await expect(
    page.getByRole("heading", { level: 2, name: "Paste your activity" }),
  ).toBeVisible();
}

async function expectDetectedCard(page: Page, file: AcceptedSample) {
  await expect(page).toHaveURL("/contribute/detected");
  await expect(
    page.getByRole("heading", { level: 2, name: "Detected" }),
  ).toBeVisible();
  await expect(
    page.getByText(`Here's what detection found in ${file.activity}.`),
  ).toBeVisible();
  const card = factsCard(page);
  await expect(
    card.getByRole("heading", { level: 3, name: "What we found" }),
  ).toBeVisible();
  await expect(card.getByText("Regex, no AI", { exact: true })).toBeVisible();
  await expect(card.getByRole("term")).toHaveText(factLabels);
  await expect(card.getByRole("definition")).toHaveText(file.facts);
}

test.describe("the Code step", () => {
  for (const file of accepted) {
    test(`a pasted ${file.sdk} activity shows line numbers and the Found line naming it, and enables Continue`, async ({
      page,
      expectAccessible,
      paste,
      signInWithAccount,
    }) => {
      await signInWithAccount();
      await openCodeStep(page);
      await expect(continueButton(page)).toBeDisabled();

      await paste(editor(page), file.code);

      await expect(editor(page)).toHaveValue(file.code);
      // The gutter is hidden from assistive technology, so only its text reaches it.
      await expect(
        page.getByText(gutterText(file.code), { exact: true }),
      ).toBeVisible();
      await expect(foundLine(page, file)).toBeVisible();
      await expect(viewButton(page)).toBeVisible();
      await expect(continueButton(page)).toBeEnabled();
      await expect(page.getByText("Paste your activity's file")).toHaveCount(0);
      await expectAccessible();
    });

    test(`continuing with a ${file.sdk} activity shows its eight facts on Detected, with the editor's line numbers`, async ({
      page,
      expectAccessible,
      paste,
      signInWithAccount,
    }) => {
      await signInWithAccount();
      await openCodeStep(page);
      await paste(editor(page), file.code);
      await expect(foundLine(page, file)).toBeVisible();

      await continueButton(page).click();

      await expectDetectedCard(page, file);
      await expectAccessible();
    });
  }

  for (const refusal of refusals) {
    test(`${refusal.file} shows its refusal and Continue stays disabled`, async ({
      page,
      expectAccessible,
      paste,
      signInWithAccount,
    }) => {
      await signInWithAccount();
      await openCodeStep(page);

      await paste(editor(page), refusal.code);

      await expect(
        page.getByText(refusal.message, { exact: true }),
      ).toBeVisible();
      await expect(anyFoundLine(page)).toHaveCount(0);
      await expect(viewButton(page)).toHaveCount(0);
      await expect(continueButton(page)).toBeDisabled();
      await expectAccessible();
    });
  }

  test("editing an accepted file into a refused one clears the Found line and shows the refusal", async ({
    page,
    paste,
    signInWithAccount,
  }) => {
    const file = accepted[0];
    if (file === undefined) throw new Error("No accepted sample");
    await signInWithAccount();
    await openCodeStep(page);
    await paste(editor(page), file.code);
    await expect(foundLine(page, file)).toBeVisible();

    // The publisher types a second activity at the end of the file.
    await editor(page).press("ControlOrMeta+End");
    await page.keyboard.type(
      "\n\n@activity.defn\nasync def archive_slack_message(ref: MessageRef) -> MessageRef:\n    return ref\n",
    );

    await expect(anyFoundLine(page)).toHaveCount(0);
    await expect(viewButton(page)).toHaveCount(0);
    await expect(
      page.getByText(twoActivitiesMessage, { exact: true }),
    ).toBeVisible();
    await expect(continueButton(page)).toBeDisabled();
  });

  test("a reload keeps the pasted code and the Found line", async ({
    page,
    paste,
    signInWithAccount,
  }) => {
    const file = accepted[0];
    if (file === undefined) throw new Error("No accepted sample");
    await signInWithAccount();
    await openCodeStep(page);
    await paste(editor(page), file.code);
    await expect(foundLine(page, file)).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL("/contribute/code");
    await expect(editor(page)).toHaveValue(file.code);
    await expect(foundLine(page, file)).toBeVisible();
    await expect(continueButton(page)).toBeEnabled();
  });

  test("a reload keeps the pasted code and its refusal", async ({
    page,
    paste,
    signInWithAccount,
  }) => {
    const code = sample("python-two-activities");
    await signInWithAccount();
    await openCodeStep(page);
    await paste(editor(page), code);
    await expect(
      page.getByText(twoActivitiesMessage, { exact: true }),
    ).toBeVisible();

    await page.reload();

    await expect(editor(page)).toHaveValue(code);
    await expect(
      page.getByText(twoActivitiesMessage, { exact: true }),
    ).toBeVisible();
    await expect(continueButton(page)).toBeDisabled();
  });

  test("Detected is locked and Continue disabled until a file is accepted, and opening Detected returns to Code", async ({
    page,
    expectAccessible,
    signInWithAccount,
  }) => {
    await signInWithAccount();
    await openCodeStep(page);
    const steps = page.getByRole("navigation", { name: "Steps" });

    await expect(continueButton(page)).toBeDisabled();
    await expect(
      page.getByText("Paste your activity's file", { exact: true }),
    ).toBeVisible();
    await expect(steps.getByRole("link", { name: /Detected/ })).toHaveCount(0);
    await expect(
      steps.getByText("Detected (locked)", { exact: true }),
    ).toBeVisible();
    await expectAccessible();

    await page.goto("/contribute/detected");

    await expect(page).toHaveURL("/contribute/code");
    await expect(
      page.getByRole("heading", { level: 2, name: "Paste your activity" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Detected" })).toHaveCount(
      0,
    );
  });

  test("opening Detected with a refused file returns to Code with the file still there", async ({
    page,
    paste,
    signInWithAccount,
  }) => {
    const code = sample("python-workflow-only");
    await signInWithAccount();
    await openCodeStep(page);
    await paste(editor(page), code);
    await expect(
      page.getByText(
        "Found the SDK but no activity function with typed input and output.",
        { exact: true },
      ),
    ).toBeVisible();

    await page.goto("/contribute/detected");

    await expect(page).toHaveURL("/contribute/code");
    await expect(editor(page)).toHaveValue(code);
    await expect(continueButton(page)).toBeDisabled();
  });
});

test.describe("What will be published", () => {
  test("shows the code exactly as pasted, tabs included, and Escape or Close returns focus to the button", async ({
    page,
    expectAccessible,
    paste,
    signInWithAccount,
  }) => {
    const file = accepted.find(({ sdk }) => sdk === ".NET");
    if (file === undefined) throw new Error("No .NET sample");
    // The .NET sample is indented with tabs, so the dialog has tabs to keep.
    expect(file.code).toContain("\t");
    await signInWithAccount();
    await openCodeStep(page);
    await paste(editor(page), file.code);
    await expect(foundLine(page, file)).toBeVisible();
    await expect(editor(page)).toHaveValue(file.code);
    const dialog = publishedDialog(page);

    await test.step("open the dialog and read the code", async () => {
      await viewButton(page).click();

      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("heading", { name: "What will be published" }),
      ).toBeVisible();
      await expect(
        dialog.getByText(
          "This is the code your listing will hold, exactly as you pasted it.",
        ),
      ).toBeVisible();
      await expect(
        dialog.getByText("Read-only.", { exact: true }),
      ).toBeVisible();
      // toHaveText collapses whitespace, so the exact text is read from the code itself.
      await expect(
        dialog
          .getByRole("region", { name: "code that will be published" })
          .getByRole("code"),
      ).toHaveJSProperty("textContent", file.code);
      await expect(dialog.getByRole("textbox")).toHaveCount(0);
      await expectAccessible();
    });

    await test.step("Escape closes it and focus returns to the button", async () => {
      await page.keyboard.press("Escape");

      await expect(dialog).toBeHidden();
      await expect(viewButton(page)).toBeFocused();
    });

    await test.step("the close button closes it and focus returns to the button", async () => {
      await viewButton(page).click();
      await expect(dialog).toBeVisible();

      await dialog.getByRole("button", { name: "Close" }).click();

      await expect(dialog).toBeHidden();
      await expect(viewButton(page)).toBeFocused();
    });
  });
});

test.describe("as an anonymous visitor opening the Code step", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("lands on the sign-in step", async ({ page, expectAccessible }) => {
    await page.goto("/contribute/code");

    await expect(page).toHaveURL("/contribute/profile");
    await expect(
      page.getByRole("heading", { level: 2, name: "Sign in to contribute" }),
    ).toBeVisible();
    await expect(editor(page)).toHaveCount(0);
    await expectAccessible();
  });

  test(
    "a publisher signs in, pastes an activity, reads what will be published and sees what was detected",
    { tag: "@journey" },
    async ({ page, expectAccessible, paste, signInWithAccount }) => {
      const file = accepted[0];
      if (file === undefined) throw new Error("No accepted sample");

      await test.step("sign in and land on the Code step", async () => {
        await page.goto("/contribute");
        await expect(
          page.getByRole("heading", {
            level: 2,
            name: "Sign in to contribute",
          }),
        ).toBeVisible();

        await signInWithAccount();
        await page.goto("/contribute");

        await expect(page).toHaveURL("/contribute/code");
        await expect(
          page.getByRole("heading", { level: 2, name: "Paste your activity" }),
        ).toBeVisible();
        await expect(continueButton(page)).toBeDisabled();
        await expectAccessible();
      });

      await test.step("paste the file and see the Found line", async () => {
        await paste(editor(page), file.code);

        await expect(editor(page)).toHaveValue(file.code);
        await expect(foundLine(page, file)).toBeVisible();
        await expect(continueButton(page)).toBeEnabled();
        await expectAccessible();
      });

      await test.step("read what will be published and close it", async () => {
        await viewButton(page).click();
        const dialog = publishedDialog(page);
        await expect(dialog).toBeVisible();
        await expect(
          dialog
            .getByRole("region", { name: "code that will be published" })
            .getByRole("code"),
        ).toHaveJSProperty("textContent", file.code);
        await expectAccessible();

        await page.keyboard.press("Escape");

        await expect(dialog).toBeHidden();
        await expect(viewButton(page)).toBeFocused();
      });

      await test.step("continue to Detected and read the card", async () => {
        await continueButton(page).click();

        await expectDetectedCard(page, file);
        await expect(
          page
            .getByRole("navigation", { name: "Steps" })
            .getByRole("link", { name: "Code (finished)" }),
        ).toBeVisible();
        await expectAccessible();
      });
    },
  );
});

// The Details, Review and Published steps: describe the checked activity, confirm the six
// terms and publish it. Every test here signs in a new publisher of its own, with a handle of
// their own, because publishing creates their account and the listing rows hold its handle.

const reviewConfirmationTexts = [
  "I wrote this code, or I own the copyright or have permission to publish it.",
  "I'm publishing it under MIT-0: anyone may use, change and share it, with no attribution and no warranty.",
  "It contains no secrets, credentials, keys or personal data.",
  "It isn't malicious and doesn't knowingly harm the systems it runs on.",
  "I understand Durables doesn't review or warrant published code and takes no responsibility for it. I'm responsible for what I publish.",
  "I agree to the Durables Terms.",
];

const confirmHint = "Confirm each item above";
const nameUsedMessage = "You already have a listing at this address.";
const handleJustTakenMessage = "That handle was just taken. Choose another.";
const publishLimitedMessage =
  "Too many publishes in a short time. Wait a minute and try again.";

/** The details the Python sample is published with, the title and name as Details fills them. */
const pythonListing = {
  title: "Post slack message",
  name: "post-slack-message",
  description: "Posts a message to a Slack channel and returns its reference.",
};

const pythonFile = accepted.find(({ sdk }) => sdk === "Python") ?? noSample();

function noSample(): never {
  throw new Error("No Python sample");
}

/** The publish limit per publisher per minute, locally (api: wrangler.toml PUBLISH_LIMIT). */
const publishLimit = 10;

function confirmationsBox(page: Page) {
  return page.getByRole("group", {
    name: "Before you publish, confirm each of these",
  });
}

function publishButton(page: Page) {
  return page.getByRole("button", { name: "Publish 1.0.0" });
}

function footerHint(page: Page) {
  return page.getByRole("status").filter({ hasText: confirmHint });
}

function previewCard(page: Page) {
  return page.getByRole("region", { name: "Listing preview" });
}

function publishedScreen(page: Page) {
  return page.getByRole("region", { name: "Published" });
}

/**
 * Signs a new publisher in, with no account yet, and chooses their handle on the handle step,
 * which opens the Code step. The handle comes from the provider username.
 */
async function startAsNewPublisher(
  page: Page,
  signIn: (identity: FakeIdentity) => Promise<void>,
  handle: string,
) {
  await signIn({ name: publisherName, provider: "github", username: handle });
  await page.goto("/contribute");
  const field = page.getByLabel("Handle", { exact: true });
  await expect(field).toHaveValue(handle);
  await expect(page.getByText(`${handle} is available.`)).toBeVisible();
  await continueButton(page).click();
  await expect(page).toHaveURL("/contribute/code");
}

/**
 * From the Code step: pastes the Python sample, goes through Detected, fills Details and opens
 * Review. The title and name stay as Details fills them unless a name is given.
 */
async function describeAndReview(
  page: Page,
  paste: (field: Locator, text: string) => Promise<void>,
  { name, description }: { name?: string; description: string },
) {
  await paste(editor(page), python);
  await expect(foundLine(page, pythonFile)).toBeVisible();
  await continueButton(page).click();
  await expect(page).toHaveURL("/contribute/detected");
  await continueButton(page).click();

  await expect(page).toHaveURL("/contribute/details");
  await expect(
    page.getByRole("heading", { level: 2, name: "Listing details" }),
  ).toBeVisible();
  if (name !== undefined) {
    await page.getByLabel("Name in the address", { exact: true }).fill(name);
  }
  await page
    .getByLabel("One-line description", { exact: true })
    .fill(description);
  await expect(continueButton(page)).toBeEnabled();
  await continueButton(page).click();

  await expect(page).toHaveURL("/contribute/review");
  await expect(
    page.getByRole("heading", { level: 2, name: "Review and publish" }),
  ).toBeVisible();
}

async function confirmAll(page: Page) {
  for (const text of reviewConfirmationTexts) {
    await confirmationsBox(page).getByLabel(text, { exact: true }).check();
  }
  await expect(publishButton(page)).toBeEnabled();
}

test.describe("Review and publish", () => {
  test("Publish stays disabled until all six confirmations are checked", async ({
    page,
    expectAccessible,
    paste,
    signIn,
    uniqueHandle,
  }) => {
    await startAsNewPublisher(page, signIn, uniqueHandle("six"));
    await describeAndReview(page, paste, pythonListing);
    const boxes = confirmationsBox(page).getByRole("checkbox");

    await expect(boxes).toHaveCount(reviewConfirmationTexts.length);
    for (const box of await boxes.all()) {
      await expect(box).not.toBeChecked();
    }
    await expect(publishButton(page)).toBeDisabled();
    await expect(footerHint(page)).toBeVisible();
    await expectAccessible();

    for (const [index, text] of reviewConfirmationTexts.entries()) {
      await confirmationsBox(page).getByLabel(text, { exact: true }).check();
      if (index < reviewConfirmationTexts.length - 1) {
        await expect(publishButton(page)).toBeDisabled();
        await expect(footerHint(page)).toBeVisible();
      }
    }

    await expect(publishButton(page)).toBeEnabled();
    await expect(footerHint(page)).toHaveCount(0);

    const [first] = reviewConfirmationTexts;
    await confirmationsBox(page)
      .getByLabel(first ?? "", { exact: true })
      .uncheck();

    await expect(publishButton(page)).toBeDisabled();
    await expect(footerHint(page)).toBeVisible();
  });

  test("the Terms link opens the Terms page, which says everything is published under MIT-0, and Back returns to Review as it was", async ({
    page,
    expectAccessible,
    paste,
    signIn,
    uniqueHandle,
  }) => {
    const handle = uniqueHandle("terms");
    const checked = reviewConfirmationTexts.slice(0, 3);
    const unchecked = reviewConfirmationTexts.slice(3);
    await startAsNewPublisher(page, signIn, handle);
    await describeAndReview(page, paste, pythonListing);
    for (const text of checked) {
      await confirmationsBox(page).getByLabel(text, { exact: true }).check();
    }

    await test.step("follow the Terms link to the Terms page", async () => {
      await confirmationsBox(page)
        .getByRole("link", { name: "Terms", exact: true })
        .click();

      await expect(page).toHaveURL("/terms");
      await expect(
        page
          .getByRole("main")
          .getByRole("heading", { level: 1, name: "Terms" }),
      ).toBeVisible();
      await expect(
        page.getByRole("main").getByRole("listitem").filter({
          hasText:
            "publish it under MIT-0, like everything on Durables: anyone may use, change and share it, with no attribution and no warranty.",
        }),
      ).toBeVisible();
      await expectAccessible();
    });

    await test.step("go Back and find Review as it was", async () => {
      await page.goBack();

      await expect(page).toHaveURL("/contribute/review");
      await expect(
        page.getByRole("heading", { level: 2, name: "Review and publish" }),
      ).toBeVisible();
      await expect(
        previewCard(page).getByRole("heading", { name: pythonListing.title }),
      ).toBeVisible();
      await expect(previewCard(page)).toContainText(
        `${handle}/${pythonListing.name}@1.0.0`,
      );
      await expect(previewCard(page)).toContainText(pythonListing.description);
      for (const text of checked) {
        await expect(
          confirmationsBox(page).getByLabel(text, { exact: true }),
        ).toBeChecked();
      }
      for (const text of unchecked) {
        await expect(
          confirmationsBox(page).getByLabel(text, { exact: true }),
        ).not.toBeChecked();
      }
      await expect(publishButton(page)).toBeDisabled();
    });
  });

  test("publishing a name the publisher already used returns to Details with the message under the name", async ({
    page,
    expectAccessible,
    paste,
    publishThroughApi,
    signIn,
    uniqueHandle,
  }) => {
    await startAsNewPublisher(page, signIn, uniqueHandle("again"));
    await publishThroughApi({ code: python, ...pythonListing });
    const description = "The same name, a second time.";
    await describeAndReview(page, paste, { description });
    await confirmAll(page);

    await publishButton(page).click();

    await expect(page).toHaveURL("/contribute/details");
    const name = page.getByLabel("Name in the address", { exact: true });
    await expect(name).toHaveValue(pythonListing.name);
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toHaveAccessibleDescription(nameUsedMessage);
    await expect(
      page.getByText(nameUsedMessage, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("One-line description", { exact: true }),
    ).toHaveValue(description);
    await expectAccessible();
  });

  test("a refused publish shows its message above Publish and the boxes stay checked", async ({
    page,
    expectAccessible,
    paste,
    signIn,
    uniqueHandle,
  }) => {
    await startAsNewPublisher(page, signIn, uniqueHandle("refused"));
    await describeAndReview(page, paste, pythonListing);
    await confirmAll(page);

    // The publisher uses up their publishes for the minute. A body the API can't read still
    // counts, and publishes nothing. The limit's window is the wall-clock minute, so this
    // runs just before Publish is pressed.
    await test.step("use up the publish limit", async () => {
      for (let sent = 0; sent < publishLimit; sent += 1) {
        const response = await page.request.post("/api/activities", {
          data: {},
          headers: { "Sec-Fetch-Site": "same-origin" },
        });
        expect(response.status()).toBe(400);
      }
      const limited = await page.request.post("/api/activities", {
        data: {},
        headers: { "Sec-Fetch-Site": "same-origin" },
      });
      expect(limited.status()).toBe(429);
    });

    await publishButton(page).click();

    const alert = page.getByRole("alert");
    await expect(alert).toHaveText(publishLimitedMessage);
    await expect(page).toHaveURL("/contribute/review");
    for (const text of reviewConfirmationTexts) {
      await expect(
        confirmationsBox(page).getByLabel(text, { exact: true }),
      ).toBeChecked();
    }
    await expect(publishButton(page)).toBeEnabled();
    const alertBox = await alert.boundingBox();
    const publishBox = await publishButton(page).boundingBox();
    expect(alertBox).not.toBeNull();
    expect(publishBox).not.toBeNull();
    expect((alertBox?.y ?? 0) + (alertBox?.height ?? 0)).toBeLessThanOrEqual(
      publishBox?.y ?? 0,
    );
    await expectAccessible();
  });

  test("a handle taken between choosing it and publishing sends the publisher to the handle step with the draft kept", async ({
    page,
    expectAccessible,
    paste,
    seedAccount,
    signIn,
    uniqueHandle,
  }) => {
    const chosen = uniqueHandle("chosen");
    const other = uniqueHandle("other");
    await startAsNewPublisher(page, signIn, chosen);
    await describeAndReview(page, paste, pythonListing);
    await confirmAll(page);

    await test.step("someone else takes the handle, and publishing sends the publisher to the handle step", async () => {
      await seedAccount({ handle: chosen });

      await publishButton(page).click();

      await expect(page).toHaveURL("/contribute/profile");
      await expect(
        page.getByRole("heading", { level: 2, name: "Choose your handle" }),
      ).toBeVisible();
      await expect(page.getByLabel("Handle", { exact: true })).toHaveValue(
        chosen,
      );
      await expect(
        page.getByText(handleJustTakenMessage, { exact: true }),
      ).toBeVisible();
      await expectAccessible();
    });

    await test.step("choosing another handle returns to Review with the draft kept, and publishes", async () => {
      const field = page.getByLabel("Handle", { exact: true });
      await field.fill(other);
      await expect(page.getByText(`${other} is available.`)).toBeVisible();
      await continueButton(page).click();

      await expect(page).toHaveURL("/contribute/review");
      await expect(previewCard(page)).toContainText(
        `${other}/${pythonListing.name}@1.0.0`,
      );
      await expect(previewCard(page)).toContainText(pythonListing.description);
      for (const text of reviewConfirmationTexts) {
        await expect(
          confirmationsBox(page).getByLabel(text, { exact: true }),
        ).toBeChecked();
      }

      await publishButton(page).click();

      await expect(publishedScreen(page)).toContainText(
        `${other}/${pythonListing.name}@1.0.0 is live.`,
      );
    });
  });
});

test.describe("the Published screen", () => {
  test("a later publish by the same account shows no account line", async ({
    page,
    expectAccessible,
    paste,
    publishThroughApi,
    signIn,
    uniqueHandle,
  }) => {
    const handle = uniqueHandle("later");
    const name = "post-slack-message-again";
    await startAsNewPublisher(page, signIn, handle);
    const first = await publishThroughApi({ code: python, ...pythonListing });
    expect(first.accountCreated).toBe(true);

    // The account exists now, so Contribute opens on the Code step.
    await page.goto("/contribute");
    await expect(page).toHaveURL("/contribute/code");
    await describeAndReview(page, paste, {
      name,
      description: pythonListing.description,
    });
    await confirmAll(page);

    await publishButton(page).click();

    await expect(page).toHaveURL("/contribute/published");
    await expect(
      publishedScreen(page).getByRole("heading", {
        level: 2,
        name: "Published",
      }),
    ).toBeVisible();
    await expect(publishedScreen(page).getByText(/is live\./)).toHaveText(
      `${handle}/${name}@1.0.0 is live.`,
    );
    await expect(publishedScreen(page)).not.toContainText(
      "Your Durables account",
    );
    await expectAccessible();
  });

  test("opening Contribute after publishing starts a new activity at the Code step", async ({
    page,
    expectAccessible,
    paste,
    signIn,
    uniqueHandle,
  }) => {
    const handle = uniqueHandle("fresh");
    await startAsNewPublisher(page, signIn, handle);
    await describeAndReview(page, paste, pythonListing);
    await confirmAll(page);
    await publishButton(page).click();
    await expect(publishedScreen(page)).toContainText(
      `${handle}/${pythonListing.name}@1.0.0 is live.`,
    );

    await page.goto("/contribute");

    await expect(page).toHaveURL("/contribute/code");
    await expect(
      page.getByRole("heading", { level: 2, name: "Paste your activity" }),
    ).toBeVisible();
    await expect(editor(page)).toHaveValue("");
    await expect(continueButton(page)).toBeDisabled();
    await expect(
      page
        .getByRole("navigation", { name: "Steps" })
        .getByRole("link", { name: "Code", exact: true }),
    ).toHaveAttribute("aria-current", "step");
    await expectAccessible();
  });
});
