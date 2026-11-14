import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import "@/styles/global.css";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import {
  failCatalog,
  rustProfile,
  serveCatalog,
} from "../../../test/serve-sdk-catalog";
import { testCatalog } from "../../../test/sdk-catalog";
import type { CheckedFacts } from "./check-result";
import { draftStorageKey, type Draft } from "./draft";
import { acceptedDraft, refusedCheck } from "./test-drafts";

// The real route tree, opened at an address as if typed into the browser.
async function openAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  return { screen, router };
}

type Screen = Awaited<ReturnType<typeof openAt>>["screen"];

const publisher: SessionUser = {
  name: "Dana Dieruf",
  initials: "DD",
  provider: "google",
  handle: "ddieruf",
  accountExists: false,
};

function signIn() {
  worker.use(
    http.get("/api/session", () => HttpResponse.json({ user: publisher })),
  );
}

function keepDraft(draft: Draft) {
  sessionStorage.setItem(draftStorageKey, JSON.stringify(draft));
}

/** A Python activity that reads SLACK_TOKEN on line 7, as the editor numbers it. */
const fullCode = [
  "import os",
  "import httpx",
  "from temporalio import activity",
  "from temporalio.exceptions import ApplicationError",
  "",
  "",
  'SLACK_TOKEN = os.environ["SLACK_TOKEN"]',
  "",
  "@activity.defn",
  "def post_slack_message(message: SlackMessage) -> MessageRef:",
  "\tactivity.heartbeat()",
  "\tif not message.text:",
  '\t\traise ApplicationError("empty", non_retryable=True)',
  '\treturn httpx.post("https://slack.com/api/chat.postMessage")',
].join("\n");

/** What detection reports for `fullCode`: every fact found. */
const fullFacts: CheckedFacts = {
  sdk: "Python",
  activity: { name: "post_slack_message", line: 10 },
  input: "SlackMessage",
  output: "MessageRef",
  runsAs: "sync",
  nonRetryableErrors: [{ line: 13 }],
  configurationRead: [{ name: "SLACK_TOKEN", line: 7 }],
  dependencies: [{ name: "httpx", line: 2 }],
  heartbeats: [{ line: 11 }],
};

/** The same activity with nothing found beyond its SDK and name. */
const sparseFacts: CheckedFacts = {
  ...fullFacts,
  input: null,
  output: null,
  runsAs: null,
  nonRetryableErrors: [],
  configurationRead: [],
  dependencies: [],
  heartbeats: [],
};

function draftWith(facts: CheckedFacts, code = fullCode): Draft {
  return {
    finished: ["profile"],
    code,
    check: { outcome: "accepted", facts },
  };
}

function heading(screen: Screen) {
  return screen.getByRole("heading", { level: 2, name: "Detected" });
}

function card(screen: Screen) {
  return screen.getByRole("region", { name: "What we found" });
}

/** Every label on the card with its value, in reading order. */
function cardFacts(screen: Screen): [string, string][] {
  return [...card(screen).element().querySelectorAll("dt")].map((term) => [
    term.textContent,
    term.nextElementSibling?.textContent ?? "",
  ]);
}

/** The value shown under a label on the card. */
function factValue(screen: Screen, label: string): HTMLElement {
  const term = [...card(screen).element().querySelectorAll("dt")].find(
    (dt) => dt.textContent === label,
  );
  const value = term?.nextElementSibling;
  if (!(value instanceof HTMLElement)) {
    throw new Error(`Expected a value under ${label}`);
  }
  return value;
}

/** The computed colour of a token, as the browser resolves it under the current theme. */
function tokenColour(token: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

function steps(screen: Screen) {
  return screen.getByRole("navigation", { name: "Steps" });
}

async function openDetected(draft: Draft) {
  signIn();
  keepDraft(draft);
  const opened = await openAt("/contribute/detected");
  await expect.element(heading(opened.screen)).toBeVisible();
  return opened;
}

afterEach(() => {
  sessionStorage.clear();
});

describe("the Detected step", () => {
  test("shows the heading, the intro and the card with all eight facts", async () => {
    const { screen } = await openDetected(draftWith(fullFacts));

    await expect
      .element(screen.getByText(/^Here's what detection found in/))
      .toHaveTextContent("Here's what detection found in post_slack_message.");
    await expect
      .element(card(screen).getByRole("heading", { level: 3 }))
      .toHaveTextContent("What we found");
    // The Runs as wording comes with the SDK catalog.
    await expect
      .poll(() => cardFacts(screen))
      .toEqual([
        ["SDK", "Python"],
        ["Activity", "post_slack_message"],
        ["Input → output", "SlackMessage → MessageRef"],
        ["Runs as", "Synchronous: the worker needs a thread pool"],
        ["Non-retryable errors", "Raised on line 13"],
        ["Configuration read", "SLACK_TOKEN (line 7)"],
        ["Dependencies", "httpx"],
        ["Heartbeats", "Yes, line 11"],
      ]);
  });

  test("lays the facts out in two columns, each a label above a monospace value", async () => {
    // Two columns is the desktop layout; a narrow screen stacks the facts.
    await page.viewport(1440, 900);
    const { screen } = await openDetected(draftWith(fullFacts));

    const sdk = factValue(screen, "SDK");
    const activity = factValue(screen, "Activity");
    const sdkLabel = sdk.previousElementSibling;
    if (!sdkLabel) throw new Error("Expected the SDK label");
    expect(sdkLabel.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      sdk.getBoundingClientRect().top,
    );
    // SDK and Activity share the first row.
    expect(activity.getBoundingClientRect().top).toBe(
      sdk.getBoundingClientRect().top,
    );
    expect(activity.getBoundingClientRect().left).toBeGreaterThan(
      sdk.getBoundingClientRect().right,
    );
    expect(getComputedStyle(sdk).fontFamily).toMatch(/IBM Plex Mono/);
  });

  test('says "Regex, no AI" at the right of the card\'s title', async () => {
    const { screen } = await openDetected(draftWith(fullFacts));

    const method = card(screen).getByText("Regex, no AI");
    await expect.element(method).toBeVisible();
    const title = card(screen).getByRole("heading", { name: "What we found" });
    expect(method.element().getBoundingClientRect().left).toBeGreaterThan(
      title.element().getBoundingClientRect().right,
    );
  });

  test("moves focus to its heading when it appears", async () => {
    const { screen } = await openDetected(draftWith(fullFacts));

    await expect.element(heading(screen)).toHaveFocus();
  });

  test.each([
    ["Python", "post_slack_message"],
    ["TypeScript", "postSlackMessage"],
    [".NET", "PostSlackMessage"],
  ] as const)("names the %s SDK", async (sdk, name) => {
    const { screen } = await openDetected(
      draftWith({ ...fullFacts, sdk, activity: { name, line: 10 } }),
    );

    expect(factValue(screen, "SDK").textContent).toBe(sdk);
    expect(factValue(screen, "Activity").textContent).toBe(name);
  });

  test("reads Async for an async activity", async () => {
    const { screen } = await openDetected(
      draftWith({ ...fullFacts, runsAs: "async" }),
    );

    expect(factValue(screen, "Runs as").textContent).toBe("Async");
  });

  test("a synchronous .NET activity's Runs as matches the Configure wording, with no thread pool", async () => {
    const { screen } = await openDetected(
      draftWith({ ...fullFacts, sdk: ".NET", runsAs: "sync" }),
    );

    await expect
      .poll(() => factValue(screen, "Runs as").textContent)
      .toBe("Synchronous: the .NET SDK runs it for you");
    expect(factValue(screen, "Runs as").textContent).not.toMatch(
      /thread pool/i,
    );
  });

  test("an SDK web has no code for reads the catalog's Runs as wording", async () => {
    serveCatalog([...testCatalog, rustProfile]);
    const { screen } = await openDetected(
      draftWith({ ...fullFacts, sdk: "Rust", runsAs: "sync" }),
    );

    await expect
      .poll(() => factValue(screen, "Runs as").textContent)
      .toBe(rustProfile.runsAs.sync);
    expect(factValue(screen, "SDK").textContent).toBe("Rust");
  });

  test("when the catalog cannot be read, Runs as says only how it runs and the card still shows", async () => {
    const failed = failCatalog();
    const { screen } = await openDetected(
      draftWith({ ...fullFacts, runsAs: "sync" }),
    );
    await failed;

    expect(factValue(screen, "Runs as").textContent).toBe("Synchronous");
    expect(factValue(screen, "SDK").textContent).toBe("Python");
    expect(factValue(screen, "Activity").textContent).toBe(
      "post_slack_message",
    );
  });
});

describe("on a narrow screen", () => {
  test("stacks the facts in one column", async () => {
    await page.viewport(414, 896);
    const { screen } = await openDetected(draftWith(fullFacts));

    const sdk = factValue(screen, "SDK").getBoundingClientRect();
    const activity = factValue(screen, "Activity").getBoundingClientRect();
    expect(activity.left).toBe(sdk.left);
    expect(activity.top).toBeGreaterThan(sdk.bottom);
  });
});

describe("a fact detection couldn't find", () => {
  test("shows its fallback text", async () => {
    const { screen } = await openDetected(draftWith(sparseFacts));

    expect(cardFacts(screen)).toEqual([
      ["SDK", "Python"],
      ["Activity", "post_slack_message"],
      ["Input → output", "—"],
      ["Runs as", "—"],
      ["Non-retryable errors", "None raised"],
      ["Configuration read", "None"],
      ["Dependencies", "None beyond the SDK"],
      ["Heartbeats", "Not detected"],
    ]);
  });

  test("is muted, while the facts beside it that were found are not", async () => {
    const { screen } = await openDetected(
      draftWith({ ...sparseFacts, dependencies: [{ name: "httpx", line: 2 }] }),
    );

    const muted = tokenColour("--fg-muted");
    const plain = tokenColour("--fg");
    expect(muted).not.toBe(plain);
    for (const label of [
      "Input → output",
      "Runs as",
      "Non-retryable errors",
      "Configuration read",
      "Heartbeats",
    ]) {
      expect(getComputedStyle(factValue(screen, label)).color, label).toBe(
        muted,
      );
    }
    for (const label of ["SDK", "Activity", "Dependencies"]) {
      expect(getComputedStyle(factValue(screen, label)).color, label).toBe(
        plain,
      );
    }
  });

  test('an activity with no third-party imports reads "None beyond the SDK", muted', async () => {
    const { screen } = await openDetected(
      draftWith({ ...fullFacts, dependencies: [] }),
    );

    const value = factValue(screen, "Dependencies");
    expect(value.textContent).toBe("None beyond the SDK");
    expect(getComputedStyle(value).color).toBe(tokenColour("--fg-muted"));
  });
});

describe("line numbers", () => {
  test("each variable shows with the line the editor gives it", async () => {
    const { screen } = await openDetected(draftWith(fullFacts));

    expect(factValue(screen, "Configuration read").textContent).toBe(
      "SLACK_TOKEN (line 7)",
    );

    await screen.getByRole("button", { name: "Back" }).click();

    const editor = screen.getByLabelText("Paste your file");
    await expect.element(editor).toBeVisible();
    const lines = (editor.element() as HTMLTextAreaElement).value.split("\n");
    expect(lines[7 - 1]).toContain("SLACK_TOKEN");
  });

  test("several variables each show with their line", async () => {
    const { screen } = await openDetected(
      draftWith({
        ...fullFacts,
        configurationRead: [
          { name: "SLACK_TOKEN", line: 7 },
          { name: "SLACK_CHANNEL", line: 8 },
        ],
      }),
    );

    expect(factValue(screen, "Configuration read").textContent).toBe(
      "SLACK_TOKEN (line 7), SLACK_CHANNEL (line 8)",
    );
  });
});

describe("long values", () => {
  const longName = `post_${"very_long_".repeat(20)}message`;
  const manyVariables = Array.from({ length: 12 }, (_, at) => ({
    name: `SLACK_SETTING_NUMBER_${String(at + 1)}`,
    line: at + 1,
  }));
  const manyPackages = Array.from({ length: 12 }, (_, at) => ({
    name: `package-with-a-long-name-${String(at + 1)}`,
    line: at + 1,
  }));

  test.each([
    ["two columns", 1440, 900],
    ["one column", 320, 640],
  ] as const)(
    "wrap within their column without widening the card, in %s",
    async (_, width, height) => {
      await page.viewport(width, height);
      const { screen } = await openDetected(
        draftWith({
          ...fullFacts,
          activity: { name: longName, line: 10 },
          input: `${"Very".repeat(30)}Input`,
          output: `${"Very".repeat(30)}Output`,
          configurationRead: manyVariables,
          dependencies: manyPackages,
        }),
      );

      const region = card(screen).element();
      expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth);
      for (const label of [
        "Activity",
        "Input → output",
        "Configuration read",
        "Dependencies",
      ]) {
        const value = factValue(screen, label);
        const column = value.parentElement;
        if (!column) throw new Error(`Expected the ${label} column`);
        expect(value.scrollWidth, label).toBeLessThanOrEqual(
          column.clientWidth,
        );
      }
      expect(factValue(screen, "Activity").textContent).toBe(longName);
      const intro = screen
        .getByText(/^Here's what detection found in/)
        .element();
      expect(intro.scrollWidth).toBeLessThanOrEqual(intro.clientWidth);
    },
  );
});

describe("the declaration questions", () => {
  test("are not shown", async () => {
    const { screen } = await openDetected(draftWith(sparseFacts));

    const step = screen.getByRole("region", { name: "Detected" }).element();
    expect(step.textContent).not.toMatch(
      /idempoten|compensation|not applicable/i,
    );
    expect(
      screen
        .getByRole("region", { name: "Detected" })
        .getByRole("button")
        .elements()
        .map((button) => button.textContent),
    ).toEqual(["Back", "Continue"]);
    expect(step.querySelectorAll("input, textarea, select")).toHaveLength(0);
  });
});

describe("Back", () => {
  test("returns to Code with the pasted code still in the editor", async () => {
    const { screen, router } = await openDetected(draftWith(fullFacts));

    await screen.getByRole("button", { name: "Back" }).click();

    await expect
      .poll(() => router.state.location.pathname)
      .toBe("/contribute/code");
    await expect
      .element(screen.getByLabelText("Paste your file"))
      .toHaveValue(fullCode);
  });
});

describe("Continue", () => {
  test("is enabled without any answer, and opens Details", async () => {
    const { screen, router } = await openDetected(draftWith(sparseFacts));

    const next = screen.getByRole("button", { name: "Continue" });
    await expect.element(next).toBeEnabled();
    await next.click();

    await expect
      .poll(() => router.state.location.pathname)
      .toBe("/contribute/details");
    await expect
      .element(steps(screen).getByRole("link", { name: "Details" }))
      .toHaveAttribute("aria-current", "step");
    await expect
      .element(steps(screen).getByRole("link", { name: "Detected (finished)" }))
      .toBeVisible();
  });
});

describe("the address", () => {
  test("with no code pasted sends the publisher to Code", async () => {
    signIn();
    keepDraft({ finished: ["profile"] });
    const { screen, router } = await openAt("/contribute/detected");

    await expect
      .element(
        screen.getByRole("heading", { level: 2, name: "Paste your activity" }),
      )
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/code");
  });

  test("after a refusal sends the publisher to Code", async () => {
    signIn();
    keepDraft({ ...acceptedDraft, check: refusedCheck });
    const { screen, router } = await openAt("/contribute/detected");

    await expect
      .element(
        screen.getByRole("heading", { level: 2, name: "Paste your activity" }),
      )
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/code");
  });
});

describe("reloading the page", () => {
  test("shows the same facts from the draft", async () => {
    const first = await openDetected(draftWith(fullFacts));
    // The Runs as wording comes with the SDK catalog, so wait for it before reading the card.
    await expect
      .poll(() => factValue(first.screen, "Runs as").textContent)
      .toBe("Synchronous: the worker needs a thread pool");
    const before = cardFacts(first.screen);
    await first.screen.unmount();

    // The reload: a fresh page at the same address, with the browser session kept.
    const { screen, router } = await openAt("/contribute/detected");

    await expect.element(heading(screen)).toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/detected");
    await expect.poll(() => cardFacts(screen)).toEqual(before);
    expect(before).toHaveLength(8);
  });
});

describe("from the Code step", () => {
  test("shows what the check found for the pasted file", async () => {
    signIn();
    keepDraft({ finished: ["profile"] });
    worker.use(http.post("/api/checks", () => HttpResponse.json(fullFacts)));
    const { screen, router } = await openAt("/contribute/code");

    const editor = screen.getByLabelText("Paste your file");
    await expect.element(editor).toBeVisible();
    const source = document.createElement("textarea");
    document.body.append(source);
    source.value = fullCode;
    source.select();
    await userEvent.copy();
    source.remove();
    (editor.element() as HTMLTextAreaElement).focus();
    await userEvent.paste();
    const next = screen.getByRole("button", { name: "Continue" });
    await expect.element(next).toBeEnabled();
    await next.click();

    await expect.element(heading(screen)).toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/detected");
    expect(factValue(screen, "Configuration read").textContent).toBe(
      "SLACK_TOKEN (line 7)",
    );
  });
});
