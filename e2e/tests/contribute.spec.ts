import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
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
