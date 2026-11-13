import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import "@/styles/global.css";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import type { CheckedFacts } from "./check-result";
import { draftStorageKey, type Draft } from "./draft";
import {
  acceptedDraft,
  acceptedFacts,
  pastedCode,
  refusedCheck,
} from "./test-drafts";

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

// A draft kept in the browser session from earlier in the flow.
function keepDraft(draft: Draft) {
  sessionStorage.setItem(draftStorageKey, JSON.stringify(draft));
}

/** A draft whose pasted `code` was accepted as an activity in `sdk`. */
function acceptedAs(code: string, sdk: CheckedFacts["sdk"] = "Python"): Draft {
  return {
    finished: ["profile"],
    code,
    check: { outcome: "accepted", facts: { ...acceptedFacts, sdk } },
  };
}

// The Code step, through the real route tree, with `draft` kept from earlier.
async function openCodeStep(draft: Draft) {
  signIn();
  keepDraft(draft);
  const router = createMemoryRouter(routes, {
    initialEntries: ["/contribute/code"],
  });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  await expect
    .element(
      screen.getByRole("heading", { level: 2, name: "Paste your activity" }),
    )
    .toBeVisible();
  return screen;
}

type Screen = Awaited<ReturnType<typeof openCodeStep>>;

function viewButton(screen: Screen) {
  return screen.getByRole("button", { name: "View what will be published" });
}

function dialog(screen: Screen) {
  return screen.getByRole("dialog", { name: "What will be published" });
}

function closeButton(screen: Screen) {
  return dialog(screen).getByRole("button", { name: "Close" });
}

function codeRegion(screen: Screen) {
  return dialog(screen).getByRole("region", {
    name: "code that will be published",
  });
}

/** The code element's text, which is the code exactly as shown. */
function shownCode(screen: Screen) {
  return codeRegion(screen).element().querySelector("code")?.textContent;
}

/** The dialog's line numbers, top to bottom. */
function shownNumbers(screen: Screen) {
  return [
    ...codeRegion(screen)
      .element()
      .querySelectorAll('[aria-hidden="true"] > *'),
  ].map((number) => number.textContent);
}

/** The paste editor's line numbers, top to bottom. */
function editorNumbers(screen: Screen) {
  const gutter = screen
    .getByLabelText("Paste your file")
    .element().previousElementSibling;
  return gutter?.textContent?.split("\n") ?? [];
}

/** The nearest box inside the dialog that scrolls `element` vertically. */
function scrollingAncestor(element: Element): Element | null {
  let at = element.parentElement;
  while (at && at.tagName !== "DIALOG") {
    if (
      getComputedStyle(at).overflowY === "auto" &&
      at.scrollHeight > at.clientHeight
    ) {
      return at;
    }
    at = at.parentElement;
  }
  return null;
}

async function openDialog(screen: Screen) {
  await viewButton(screen).click();
  await expect.element(dialog(screen)).toBeVisible();
  await expect.element(codeRegion(screen)).toBeVisible();
}

// Tabs, trailing spaces, mixed indentation, blank lines and a trailing line break.
const oddlySpaced = [
  "from temporalio import activity",
  "",
  "",
  "@activity.defn",
  "async def post_slack_message(message: SlackMessage) -> MessageRef:   ",
  "\t# a tab",
  "\t\tx  =  1\t# two tabs, then spaces inside",
  "    \treturn await send(message)",
  "  ",
  "",
].join("\n");

// Tangerine, the keyword colour, as the browser reports it.
const keywordRgb = "rgb(255, 90, 31)";

afterEach(() => {
  sessionStorage.clear();
});

describe("View what will be published", () => {
  test("opens the dialog with its title and subtitle", async () => {
    const screen = await openCodeStep(acceptedDraft);
    await expect.element(dialog(screen)).not.toBeInTheDocument();

    await openDialog(screen);

    await expect
      .element(
        dialog(screen).getByRole("heading", { name: "What will be published" }),
      )
      .toBeVisible();
    await expect
      .element(
        dialog(screen).getByText(
          "This is the code your listing will hold, exactly as you pasted it.",
        ),
      )
      .toBeVisible();
    // A native dialog opened with showModal(), so the page behind it is inert.
    const element = dialog(screen).element() as HTMLDialogElement;
    expect(element.tagName).toBe("DIALOG");
    expect(element.matches(":modal")).toBe(true);
  });

  test("shows the whole pasted file, with a number on every line", async () => {
    const screen = await openCodeStep(acceptedDraft);

    await openDialog(screen);

    expect(shownCode(screen)).toBe(pastedCode);
    expect(shownNumbers(screen)).toEqual(["1", "2", "3", "4", "5"]);
  });

  test("shows tabs and odd spacing exactly as pasted, with tabs four spaces wide", async () => {
    const screen = await openCodeStep(acceptedAs(oddlySpaced));

    await openDialog(screen);

    expect(shownCode(screen)).toBe(oddlySpaced);
    const pre = codeRegion(screen).element().querySelector("pre");
    expect(pre && getComputedStyle(pre).tabSize).toBe("4");
  });

  test("numbers the lines as the editor does", async () => {
    const screen = await openCodeStep(acceptedAs(oddlySpaced));
    const inEditor = editorNumbers(screen);
    expect(inEditor).toHaveLength(oddlySpaced.split("\n").length);

    await openDialog(screen);

    expect(shownNumbers(screen)).toEqual(inEditor);
  });

  test("scrolls a very long file inside the dialog", async () => {
    const long = Array.from(
      { length: 400 },
      (_, at) => `    log(${String(at)})`,
    ).join("\n");
    const screen = await openCodeStep(acceptedAs(long));

    await openDialog(screen);

    const element = dialog(screen).element();
    expect(element.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight,
    );
    // The code scrolls in a box inside the dialog, so the title and Close stay in view.
    const scroller = scrollingAncestor(codeRegion(screen).element());
    expect(scroller).not.toBeNull();
    expect(element.contains(scroller)).toBe(true);
    await expect.element(closeButton(screen)).toBeInViewport();
    await expect.element(dialog(screen).getByText("Read-only.")).toBeVisible();
    expect(shownNumbers(screen)).toHaveLength(400);
  });

  test.each([
    ["Python", "python", "def", pastedCode],
    [
      "TypeScript",
      "typescript",
      "interface",
      "interface SlackMessage {\n  text: string;\n}\nexport async function postSlackMessage(message: SlackMessage): Promise<string> {\n  return message.text;\n}",
    ],
    [
      ".NET",
      "csharp",
      "namespace",
      "namespace Slack;\n\npublic class Activities\n{\n    [Activity]\n    public Task<string> PostSlackMessage(SlackMessage message) => Task.FromResult(message.Text);\n}",
    ],
  ] as const)(
    "highlights a %s activity as %s, the catalog's language for it",
    async (sdk, _language, keyword, code) => {
      const screen = await openCodeStep(acceptedAs(code, sdk));

      await openDialog(screen);

      const keywordToken = () =>
        [...codeRegion(screen).element().querySelectorAll("code span[style]")]
          .filter((span) => span.textContent === keyword)
          .map((span) => getComputedStyle(span).color);
      await expect.poll(keywordToken).toContain(keywordRgb);
      expect(shownCode(screen)).toBe(code);
    },
  );
});

describe("closing the dialog", () => {
  test("the close button has an accessible name", async () => {
    const screen = await openCodeStep(acceptedDraft);

    await openDialog(screen);

    await expect.element(closeButton(screen)).toHaveAccessibleName("Close");
  });

  test("the close button closes it and focus returns to the button", async () => {
    const screen = await openCodeStep(acceptedDraft);
    await openDialog(screen);

    await closeButton(screen).click();

    await expect.element(dialog(screen)).not.toBeInTheDocument();
    await expect.element(viewButton(screen)).toHaveFocus();
  });

  test("Escape closes it and focus returns to the button", async () => {
    const screen = await openCodeStep(acceptedDraft);
    await openDialog(screen);

    await userEvent.keyboard("{Escape}");

    await expect.element(dialog(screen)).not.toBeInTheDocument();
    await expect.element(viewButton(screen)).toHaveFocus();
  });

  test("it opens again after closing", async () => {
    const screen = await openCodeStep(acceptedDraft);
    await openDialog(screen);
    await userEvent.keyboard("{Escape}");
    await expect.element(dialog(screen)).not.toBeInTheDocument();

    await openDialog(screen);

    expect(shownCode(screen)).toBe(pastedCode);
  });
});

describe("the code in the dialog", () => {
  test('is read-only, with "Read-only." under it', async () => {
    const screen = await openCodeStep(acceptedAs(oddlySpaced));
    await openDialog(screen);

    await expect.element(dialog(screen).getByText("Read-only.")).toBeVisible();
    expect(dialog(screen).getByRole("textbox").elements()).toHaveLength(0);
    expect(dialog(screen).element().querySelector("[contenteditable]")).toBe(
      null,
    );

    await codeRegion(screen).click();
    await userEvent.keyboard("typed{Enter}{Backspace}{Backspace}");

    expect(shownCode(screen)).toBe(oddlySpaced);
    await userEvent.keyboard("{Escape}");
    await expect
      .element(screen.getByLabelText("Paste your file"))
      .toHaveValue(oddlySpaced);
    const kept = JSON.parse(
      sessionStorage.getItem(draftStorageKey) ?? "{}",
    ) as Draft;
    expect(kept.code).toBe(oddlySpaced);
    expect(kept.check?.outcome).toBe("accepted");
  });
});

describe("without an accepted file", () => {
  test.each([
    ["nothing pasted", { finished: ["profile"] } satisfies Draft],
    [
      "code not yet checked",
      { finished: ["profile"], code: pastedCode } satisfies Draft,
    ],
    [
      "a refused file",
      {
        finished: ["profile"],
        code: pastedCode,
        check: refusedCheck,
      } satisfies Draft,
    ],
  ])("%s shows no View button", async (_, draft) => {
    const screen = await openCodeStep(draft);

    await expect
      .element(screen.getByRole("button", { name: "Continue" }))
      .toBeDisabled();
    expect(viewButton(screen).elements()).toHaveLength(0);
    expect(screen.getByRole("dialog").elements()).toHaveLength(0);
  });
});
