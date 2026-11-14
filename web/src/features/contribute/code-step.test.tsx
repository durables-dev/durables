import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import "@/styles/global.css";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
  eightSdks,
  holdCatalog,
  serveCatalog,
  eightSdkCatalog,
} from "../../../test/serve-sdk-catalog";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import type { CheckedFacts, SdkTier } from "./check-result";
import { ContributeDraftProvider } from "./contribute-draft-provider";
import { draftStorageKey, type Draft } from "./draft";
import {
  acceptedCheck,
  acceptedDraft,
  acceptedFacts,
  pastedCode,
  refusedCheck,
} from "./test-drafts";
import { checkPauseMs } from "./use-check-request";
import { useContributeDraft } from "./use-contribute-draft";

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

// The session endpoint answers for a signed-in publisher, by default one with no account yet.
function signIn(user: Partial<SessionUser> = {}) {
  worker.use(
    http.get("/api/session", () =>
      HttpResponse.json({ user: { ...publisher, ...user } }),
    ),
  );
}

// A publisher whose provider account already has a Durables account.
function signInReturning() {
  signIn({ accountExists: true });
}

// A draft kept in the browser session from earlier in the flow.
function keepDraft(draft: Draft) {
  sessionStorage.setItem(draftStorageKey, JSON.stringify(draft));
}

function heading(screen: Screen) {
  return screen.getByRole("heading", { level: 2, name: "Paste your activity" });
}

function editor(screen: Screen) {
  return screen.getByLabelText("Paste your file");
}

function continueButton(screen: Screen) {
  return screen.getByRole("button", { name: "Continue" });
}

function steps(screen: Screen) {
  return screen.getByRole("navigation", { name: "Steps" });
}

async function openCodeStep() {
  const opened = await openAt("/contribute/code");
  await expect.element(heading(opened.screen)).toBeVisible();
  return opened;
}

afterEach(() => {
  sessionStorage.clear();
});

describe("the Code step", () => {
  test("shows the heading, the intro and the editor, with no choice of linking a file", async () => {
    signIn();
    keepDraft({ finished: ["profile"] });
    const { screen } = await openCodeStep();

    await expect
      .element(screen.getByText("Paste the file that contains your activity."))
      .toBeVisible();
    await expect.element(editor(screen)).toBeVisible();
    expect(screen.getByRole("radiogroup").elements()).toHaveLength(0);
    expect(screen.getByRole("radio").elements()).toHaveLength(0);
    expect(
      screen.getByRole("region", { name: "Code" }).element().textContent,
    ).not.toMatch(/link/i);
  });

  test("opens empty, with the placeholder in the editor and nothing found yet", async () => {
    signIn();
    keepDraft({ finished: ["profile"] });
    const { screen } = await openCodeStep();

    await expect.element(editor(screen)).toHaveValue("");
    await expect
      .element(editor(screen))
      .toHaveAttribute("placeholder", "Paste a single-file Temporal activity");
    await expect.element(screen.getByText(/Found/)).not.toBeInTheDocument();
  });

  test("moves focus to its heading when it appears", async () => {
    signIn();
    keepDraft({ finished: ["profile"] });
    const { screen } = await openCodeStep();

    await expect.element(heading(screen)).toHaveFocus();
  });

  test("a returning publisher who skipped Profile & Handle lands on it", async () => {
    signInReturning();
    const { screen, router } = await openAt("/contribute");

    await expect.element(heading(screen)).toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/code");
  });
});

describe("Continue", () => {
  test("is disabled, with the hint beside it, until a file is accepted", async () => {
    signIn();
    keepDraft({ finished: ["profile"] });
    const { screen } = await openCodeStep();

    await expect.element(continueButton(screen)).toBeDisabled();
    await expect
      .element(screen.getByRole("status").filter({ hasText: "Paste your" }))
      .toHaveTextContent("Paste your activity's file");
    await expect
      .element(steps(screen).getByText("Detected (locked)"))
      .toBeInTheDocument();
  });

  test("stays disabled while the code is unchecked or was refused", async () => {
    signIn();
    keepDraft({ finished: ["profile"], code: pastedCode, check: refusedCheck });
    const { screen } = await openCodeStep();

    await expect.element(editor(screen)).toHaveValue(pastedCode);
    await expect.element(continueButton(screen)).toBeDisabled();
    await expect
      .element(steps(screen).getByText("Detected (locked)"))
      .toBeInTheDocument();
  });

  test("is enabled once a file is accepted, and Code shows a tick", async () => {
    signIn();
    keepDraft(acceptedDraft);
    const { screen } = await openCodeStep();

    await expect.element(continueButton(screen)).toBeEnabled();
    const code = steps(screen).getByRole("link", { name: "Code (finished)" });
    await expect.element(code).toBeVisible();
    expect(code.element().querySelector("svg path")?.getAttribute("d")).toBe(
      "M5 12l5 5 9-10",
    );
    await expect
      .element(screen.getByText("Paste your activity's file"))
      .not.toBeInTheDocument();
  });

  test("opens Detected", async () => {
    signIn();
    keepDraft(acceptedDraft);
    const { screen, router } = await openCodeStep();

    await continueButton(screen).click();

    await expect
      .poll(() => router.state.location.pathname)
      .toBe("/contribute/detected");
    await expect
      .element(steps(screen).getByRole("link", { name: "Detected" }))
      .toHaveAttribute("aria-current", "step");
  });
});

describe("editing the code", () => {
  test("after a file was accepted, clears the result and disables Continue", async () => {
    signIn();
    keepDraft(acceptedDraft);
    const { screen } = await openCodeStep();
    await expect.element(continueButton(screen)).toBeEnabled();

    await editor(screen).fill(`${pastedCode}\n# changed`);

    await expect.element(continueButton(screen)).toBeDisabled();
    await expect
      .element(steps(screen).getByRole("link", { name: "Code" }))
      .toHaveAttribute("aria-current", "step");
    await expect
      .element(steps(screen).getByText("Detected (locked)"))
      .toBeInTheDocument();
    await expect
      .poll(() => sessionStorage.getItem(draftStorageKey))
      .not.toContain("accepted");
  });

  test("keeps the code in the draft", async () => {
    signIn();
    keepDraft({ finished: ["profile"] });
    const { screen } = await openCodeStep();

    await editor(screen).fill(pastedCode);

    await expect
      .poll(() => sessionStorage.getItem(draftStorageKey))
      .toContain("post_slack_message");
  });
});

describe("reloading the page", () => {
  test("keeps the pasted code", async () => {
    signIn();
    keepDraft({ finished: ["profile"] });
    const before = await openCodeStep();
    await editor(before.screen).fill(pastedCode);
    await expect
      .poll(() => sessionStorage.getItem(draftStorageKey))
      .toContain("post_slack_message");
    await before.screen.unmount();

    // The reload: a fresh page at the same address, with the browser session kept.
    const { screen } = await openCodeStep();

    await expect.element(editor(screen)).toHaveValue(pastedCode);
  });

  test("keeps the code and the check result", async () => {
    signIn();
    keepDraft(acceptedDraft);
    const before = await openCodeStep();
    await expect.element(continueButton(before.screen)).toBeEnabled();
    await before.screen.unmount();

    const { screen } = await openCodeStep();

    await expect.element(editor(screen)).toHaveValue(pastedCode);
    await expect.element(continueButton(screen)).toBeEnabled();
    await expect
      .element(steps(screen).getByRole("link", { name: "Code (finished)" }))
      .toBeVisible();
  });

  test("with code but no result keeps the code and leaves Continue disabled", async () => {
    signIn();
    keepDraft({ finished: ["profile"], code: pastedCode });
    const { screen } = await openCodeStep();

    await expect.element(editor(screen)).toHaveValue(pastedCode);
    await expect.element(continueButton(screen)).toBeDisabled();
  });
});

describe("a draft that can't be read", () => {
  test("invalid data starts the step empty, with no error", async () => {
    signIn({ accountExists: true });
    sessionStorage.setItem(draftStorageKey, '{"finished":[],"code":42}');
    const { screen } = await openCodeStep();

    await expect.element(editor(screen)).toHaveValue("");
    await expect.element(continueButton(screen)).toBeDisabled();
    expect(screen.getByRole("alert").elements()).toHaveLength(0);
  });

  test("storage the browser refuses starts the step empty, and editing still works", async () => {
    signIn({ accountExists: true });
    const refuse = () => {
      throw new DOMException("Storage is turned off", "SecurityError");
    };
    const read = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(refuse);
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(refuse);
    try {
      const { screen } = await openCodeStep();

      await expect.element(editor(screen)).toHaveValue("");
      await editor(screen).fill(pastedCode);
      await expect.element(editor(screen)).toHaveValue(pastedCode);
      expect(screen.getByRole("alert").elements()).toHaveLength(0);
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });
});

describe("the address", () => {
  test("a signed-out visitor lands on the sign-in step", async () => {
    const { screen, router } = await openAt("/contribute/code");

    await expect
      .element(
        screen.getByRole("heading", {
          level: 2,
          name: "Sign in to contribute",
        }),
      )
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/profile");
  });

  test("a signed-out visitor lands on sign-in even with an accepted file kept", async () => {
    keepDraft(acceptedDraft);
    const { screen, router } = await openAt("/contribute/code");

    await expect
      .element(
        screen.getByRole("heading", {
          level: 2,
          name: "Sign in to contribute",
        }),
      )
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/profile");
  });

  test("Detected without an accepted file sends the publisher to Code", async () => {
    signIn();
    keepDraft({ finished: ["profile"], code: pastedCode });
    const { screen, router } = await openAt("/contribute/detected");

    await expect.element(heading(screen)).toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/code");
  });

  test("Detected after a refusal sends the publisher to Code", async () => {
    signInReturning();
    keepDraft({ finished: [], code: pastedCode, check: refusedCheck });
    const { screen, router } = await openAt("/contribute/detected");

    await expect.element(heading(screen)).toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/code");
  });

  test("Detected with an accepted file stays on Detected", async () => {
    signIn();
    keepDraft(acceptedDraft);
    const { screen, router } = await openAt("/contribute/detected");

    await expect
      .element(steps(screen).getByRole("link", { name: "Detected" }))
      .toHaveAttribute("aria-current", "step");
    expect(router.state.location.pathname).toBe("/contribute/detected");
  });
});

describe("Back", () => {
  test("returns to the handle step", async () => {
    signIn();
    keepDraft({ finished: ["profile"] });
    const { screen, router } = await openCodeStep();

    await screen.getByRole("button", { name: "Back" }).click();

    await expect
      .element(
        screen.getByRole("heading", { level: 2, name: "Choose your handle" }),
      )
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/profile");
  });

  test("returns a returning publisher to the page the flow was opened from", async () => {
    signInReturning();
    keepDraft({ finished: [], origin: "/terms" });
    const { screen, router } = await openCodeStep();

    await screen.getByRole("button", { name: "Back" }).click();

    await expect.poll(() => router.state.location.pathname).toBe("/terms");
  });

  test("returns a returning publisher home when the flow was opened from nowhere", async () => {
    signInReturning();
    const { screen, router } = await openCodeStep();

    await screen.getByRole("button", { name: "Back" }).click();

    await expect.poll(() => router.state.location.pathname).toBe("/");
  });
});

// Publishes the way the Review step will, through the draft.
function Publish() {
  const { dispatch } = useContributeDraft();
  return (
    <button type="button" onClick={() => dispatch({ type: "published" })}>
      Publish
    </button>
  );
}

test("publishing clears the stored code and result", async () => {
  keepDraft(acceptedDraft);
  const screen = await render(
    <ContributeDraftProvider>
      <Publish />
    </ContributeDraftProvider>,
  );

  await screen.getByRole("button", { name: "Publish" }).click();

  await expect
    .poll(() => sessionStorage.getItem(draftStorageKey))
    .not.toContain("post_slack_message");
  const stored = sessionStorage.getItem(draftStorageKey) ?? "";
  expect(stored).not.toContain(acceptedCheck.outcome);
  expect(stored).not.toContain("code");
});

// Running the check, and the row under the editor.

const problemHeaders = { "Content-Type": "application/problem+json" };

function problemResponse(body: Record<string, unknown>) {
  const status = typeof body["status"] === "number" ? body["status"] : 422;
  return HttpResponse.json(body, { status, headers: problemHeaders });
}

function refusal(slug: string, extensions: Record<string, unknown> = {}) {
  return problemResponse({
    type: `https://durables.dev/problems/${slug}`,
    title: "Refused",
    status: 422,
    ...extensions,
  });
}

function factsFor(sdk: CheckedFacts["sdk"], name: string): CheckedFacts {
  return { ...acceptedFacts, sdk, activity: { name, line: 4 } };
}

/**
 * The check answers with `respond` for the code it is sent. Returns the code of every check
 * sent, in order.
 */
function answerChecks(
  respond: (code: string) => Response | Promise<Response>,
): string[] {
  const sent: string[] = [];
  worker.use(
    http.post("/api/checks", async ({ request }) => {
      const { code } = (await request.json()) as { code: string };
      sent.push(code);
      return respond(code);
    }),
  );
  return sent;
}

/** A response held back until the test lets it go. */
function held() {
  let release: (response: Response) => void = () => undefined;
  const response = new Promise<Response>((resolve) => {
    release = resolve;
  });
  return { response, release };
}

// Pastes through the real clipboard, replacing whatever the editor holds.
async function paste(screen: Screen, text: string) {
  const source = document.createElement("textarea");
  document.body.append(source);
  source.value = text;
  source.focus();
  source.select();
  await userEvent.copy();
  source.remove();
  const element = editor(screen).element() as HTMLTextAreaElement;
  element.focus();
  element.select();
  await userEvent.paste();
}

// The check's status region sits under the editor, ahead of the footer's hint.
function checkStatus(screen: Screen) {
  return screen.getByRole("status").first();
}

// The Gold tint, #FFB700 at 14% under Ink or 16% under Cream.
const goldTint = /^rgba\(255, 183, 0, 0\.1[46]\)$/;

function viewButton(screen: Screen) {
  return screen.getByRole("button", { name: "View what will be published" });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openToCheck() {
  signIn();
  keepDraft({ finished: ["profile"] });
  return openCodeStep();
}

describe("an accepted file", () => {
  test.each([
    ["Python", "post_slack_message"],
    ["TypeScript", "postSlackMessage"],
    [".NET", "PostSlackMessage"],
  ] as const)(
    "%s shows the Found line, the View button and enables Continue",
    async (sdk, name) => {
      const sent = answerChecks(() => HttpResponse.json(factsFor(sdk, name)));
      const { screen } = await openToCheck();

      await paste(screen, pastedCode);

      await expect
        .element(checkStatus(screen))
        .toHaveTextContent(
          `✓ Found ${name} (${sdk}). Next, check what we detected.`,
        );
      await expect.element(viewButton(screen)).toBeVisible();
      await expect.element(continueButton(screen)).toBeEnabled();
      expect(sent).toEqual([pastedCode]);
    },
  );

  test("the Found line is teal", async () => {
    answerChecks(() => HttpResponse.json(acceptedFacts));
    const { screen } = await openToCheck();

    await paste(screen, pastedCode);

    const found = screen.getByText(/Found post_slack_message/);
    await expect.element(found).toBeVisible();
    // Lagoon #4FBDB7 under Ink, Lagoon Deep #0F7471 under Cream.
    expect(["rgb(79, 189, 183)", "rgb(15, 116, 113)"]).toContain(
      getComputedStyle(found.element()).color,
    );
  });

  test("the result is kept in the draft", async () => {
    answerChecks(() => HttpResponse.json(acceptedFacts));
    const { screen } = await openToCheck();

    await paste(screen, pastedCode);

    await expect.element(continueButton(screen)).toBeEnabled();
    await expect
      .poll(() => sessionStorage.getItem(draftStorageKey))
      .toContain('"outcome":"accepted"');
  });
});

describe("while the check runs", () => {
  test('the line reads "Checking…" and Continue is disabled', async () => {
    const answer = held();
    answerChecks(() => answer.response);
    const { screen } = await openToCheck();

    await paste(screen, pastedCode);

    await expect.element(checkStatus(screen)).toHaveTextContent("Checking…");
    await expect.element(continueButton(screen)).toBeDisabled();

    answer.release(HttpResponse.json(acceptedFacts));
    await expect
      .element(checkStatus(screen))
      .toHaveTextContent(/Found post_slack_message/);
  });
});

describe("a refused file", () => {
  test.each([
    [
      "no-activity",
      {},
      "Found the SDK but no activity function with typed input and output.",
    ],
    [
      "not-a-temporal-activity",
      {},
      "This doesn't look like a Temporal activity in any SDK Durables supports.",
    ],
    [
      "multiple-activities",
      { count: 2 },
      "This file has 2 activities. Durables publishes one activity per file. Paste a file with only the one you want to share.",
    ],
  ])(
    "%s shows its message in a Gold-tint panel, with no Found line",
    async (slug, extensions, text) => {
      answerChecks(() => refusal(slug, extensions));
      const { screen } = await openToCheck();

      await paste(screen, pastedCode);

      await expect.element(checkStatus(screen)).toHaveTextContent(text);
      const panel = screen.getByText(text).element();
      // Never Ember #EE1C3A.
      const style = getComputedStyle(panel);
      expect(style.backgroundColor).toMatch(goldTint);
      for (const colour of [
        style.backgroundColor,
        style.color,
        style.borderColor,
      ]) {
        expect(colour).not.toContain("238, 28, 58");
      }
      await expect.element(continueButton(screen)).toBeDisabled();
      expect(viewButton(screen).elements()).toHaveLength(0);
      expect(screen.getByText(/✓ Found/).elements()).toHaveLength(0);
      await expect
        .poll(() => sessionStorage.getItem(draftStorageKey))
        .toContain('"outcome":"refused"');
    },
  );

  test("the multi-activity message gives the count", async () => {
    answerChecks(() => refusal("multiple-activities", { count: 3 }));
    const { screen } = await openToCheck();

    await paste(screen, pastedCode);

    await expect
      .element(checkStatus(screen))
      .toHaveTextContent(/^This file has 3 activities\./);
  });

  test("is told apart by its type, whatever its title and detail say", async () => {
    answerChecks(() =>
      refusal("no-activity", {
        title: "More than one activity",
        detail: "The file has 2 activities. Durables publishes one per file.",
      }),
    );
    const { screen } = await openToCheck();

    await paste(screen, pastedCode);

    await expect
      .element(checkStatus(screen))
      .toHaveTextContent(
        "Found the SDK but no activity function with typed input and output.",
      );
  });

  test("413 shows the size limit in a Gold-tint panel", async () => {
    answerChecks(() =>
      problemResponse({
        type: "https://durables.dev/problems/code-too-large",
        title: "Code too large",
        status: 413,
        limitBytes: 102400,
      }),
    );
    const { screen } = await openToCheck();

    await paste(screen, pastedCode);

    const text = "This file is too large to check. The limit is 100 KB.";
    await expect.element(checkStatus(screen)).toHaveTextContent(text);
    expect(
      getComputedStyle(screen.getByText(text).element()).backgroundColor,
    ).toMatch(goldTint);
    await expect.element(continueButton(screen)).toBeDisabled();
  });

  test("429 shows the too-many-checks message in a Gold-tint panel", async () => {
    answerChecks(() =>
      problemResponse({
        type: "about:blank",
        title: "Too Many Requests",
        status: 429,
      }),
    );
    const { screen } = await openToCheck();

    await paste(screen, pastedCode);

    const text =
      "Too many checks in a short time. Wait a minute and try again.";
    await expect.element(checkStatus(screen)).toHaveTextContent(text);
    expect(
      getComputedStyle(screen.getByText(text).element()).backgroundColor,
    ).toMatch(goldTint);
    await expect.element(continueButton(screen)).toBeDisabled();
  });
});

describe("an unexpected failure", () => {
  const neutral = "The check couldn't run. Paste the file again to retry.";

  test.each([
    [
      "a 500",
      () =>
        problemResponse({
          type: "about:blank",
          title: "Internal Server Error",
          status: 500,
        }),
    ],
    ["a network failure", () => HttpResponse.error()],
    [
      "an answer with no activity name",
      () =>
        HttpResponse.json({
          ...acceptedFacts,
          activity: { line: 4 },
        }),
    ],
    [
      "an answer with no SDK",
      () => {
        const withoutSdk: Partial<CheckedFacts> = { ...acceptedFacts };
        delete withoutSdk.sdk;
        return HttpResponse.json(withoutSdk);
      },
    ],
  ])(
    "%s shows a neutral message and leaves Continue disabled",
    async (_, respond) => {
      answerChecks(respond);
      const { screen } = await openToCheck();

      await paste(screen, pastedCode);

      await expect.element(checkStatus(screen)).toHaveTextContent(neutral);
      const message = screen.getByText(neutral).element();
      expect(getComputedStyle(message).backgroundColor).toBe(
        "rgba(0, 0, 0, 0)",
      );
      await expect.element(continueButton(screen)).toBeDisabled();
      expect(screen.getByText(/✓ Found/).elements()).toHaveLength(0);
    },
  );

  test("a signed-out answer sends the publisher to sign-in", async () => {
    const sent = answerChecks(() => {
      // The session has ended: the session endpoint answers anonymous from now on.
      worker.use(
        http.get("/api/session", () => HttpResponse.json({ user: null })),
      );
      return problemResponse({
        type: "about:blank",
        title: "Unauthorized",
        status: 401,
      });
    });
    const { screen, router } = await openToCheck();

    await paste(screen, pastedCode);

    await expect
      .element(
        screen.getByRole("heading", {
          level: 2,
          name: "Sign in to contribute",
        }),
      )
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/profile");
    expect(sent).toEqual([pastedCode]);
  });
});

describe("editing after a result", () => {
  test("clears the result at once and checks the new code after the pause", async () => {
    const sent = answerChecks((code) =>
      code === pastedCode
        ? HttpResponse.json(acceptedFacts)
        : refusal("multiple-activities", { count: 2 }),
    );
    const { screen } = await openToCheck();
    await paste(screen, pastedCode);
    await expect.element(viewButton(screen)).toBeVisible();

    const edited = `${pastedCode}\n# changed`;
    await editor(screen).fill(edited);

    await expect.element(screen.getByText(/✓ Found/)).not.toBeInTheDocument();
    expect(viewButton(screen).elements()).toHaveLength(0);
    await expect.element(continueButton(screen)).toBeDisabled();
    await expect
      .element(checkStatus(screen), { timeout: checkPauseMs + 2000 })
      .toHaveTextContent(/^This file has 2 activities\./);
    expect(sent).toEqual([pastedCode, edited]);
  });

  test("clears a refusal at once and checks again", async () => {
    const sent = answerChecks((code) =>
      code === pastedCode
        ? refusal("no-activity")
        : HttpResponse.json(acceptedFacts),
    );
    const { screen } = await openToCheck();
    await paste(screen, pastedCode);
    await expect
      .element(checkStatus(screen))
      .toHaveTextContent(/^Found the SDK/);

    const fixed = `${pastedCode}\n`;
    await paste(screen, fixed);

    await expect
      .element(checkStatus(screen))
      .toHaveTextContent(/Found post_slack_message/);
    await expect.element(continueButton(screen)).toBeEnabled();
    expect(sent).toEqual([pastedCode, fixed]);
  });
});

describe("an older check", () => {
  test("that answers after newer code was pasted is ignored", async () => {
    const older = held();
    const first = `${pastedCode}\n# first`;
    const sent = answerChecks((code) =>
      code === first ? older.response : refusal("not-a-temporal-activity"),
    );
    const { screen } = await openToCheck();

    await paste(screen, first);
    await expect.element(checkStatus(screen)).toHaveTextContent("Checking…");
    await paste(screen, "print('hello')");
    const newer =
      "This doesn't look like a Temporal activity in any SDK Durables supports.";
    await expect.element(checkStatus(screen)).toHaveTextContent(newer);

    older.release(HttpResponse.json(acceptedFacts));
    await wait(200);

    await expect.element(checkStatus(screen)).toHaveTextContent(newer);
    await expect.element(continueButton(screen)).toBeDisabled();
    expect(screen.getByText(/✓ Found/).elements()).toHaveLength(0);
    expect(sent).toEqual([first, "print('hello')"]);
    expect(sessionStorage.getItem(draftStorageKey)).not.toContain("accepted");
  });
});

describe("the empty editor", () => {
  test("shows no result and makes no call", async () => {
    const sent = answerChecks(() => HttpResponse.json(acceptedFacts));
    const { screen } = await openToCheck();

    await expect.element(checkStatus(screen)).toHaveTextContent("");
    expect(viewButton(screen).elements()).toHaveLength(0);

    // Typed, then cleared before the pause ends: the pause passes on an empty editor.
    await editor(screen).fill("x");
    await editor(screen).fill("");
    await wait(checkPauseMs + 300);

    expect(sent).toEqual([]);
    await expect.element(checkStatus(screen)).toHaveTextContent("");
    await expect.element(continueButton(screen)).toBeDisabled();
  });
});

describe("one check at a time", () => {
  test("typing then pasting within the pause sends one check", async () => {
    const sent = answerChecks(() => HttpResponse.json(acceptedFacts));
    const { screen } = await openToCheck();

    await editor(screen).fill("from temporalio");
    await paste(screen, pastedCode);
    await expect.element(viewButton(screen)).toBeVisible();
    await wait(checkPauseMs + 300);

    expect(sent).toEqual([pastedCode]);
  });
});

describe("the status region", () => {
  test("is in the markup before any check, and announces the result", async () => {
    answerChecks(() => HttpResponse.json(acceptedFacts));
    const { screen } = await openToCheck();
    const region = checkStatus(screen);
    await expect.element(region).toBeInTheDocument();
    const before = region.element();

    await paste(screen, pastedCode);

    await expect
      .element(region)
      .toHaveTextContent(/Found post_slack_message \(Python\)/);
    // The same region, so assistive technology announces the change.
    expect(region.element()).toBe(before);
    expect(before.getAttribute("role")).toBe("status");
  });

  test("announces a refusal", async () => {
    answerChecks(() => refusal("multiple-activities", { count: 2 }));
    const { screen } = await openToCheck();

    await paste(screen, pastedCode);

    await expect
      .element(
        screen.getByRole("status").filter({ hasText: "This file has 2" }),
      )
      .toBeInTheDocument();
  });
});

describe("checking again", () => {
  test.each([
    [
      "a failed check",
      "The check couldn't run. Paste the file again to retry.",
      () =>
        problemResponse({
          type: "about:blank",
          title: "Internal Server Error",
          status: 500,
        }),
    ],
    [
      "too many checks",
      "Too many checks in a short time. Wait a minute and try again.",
      () =>
        problemResponse({
          type: "about:blank",
          title: "Too Many Requests",
          status: 429,
        }),
    ],
  ])(
    "after %s, pasting the same file again checks it again",
    async (_, message, firstAnswer) => {
      const sent = answerChecks(() =>
        sent.length === 1 ? firstAnswer() : HttpResponse.json(acceptedFacts),
      );
      const { screen } = await openToCheck();
      await paste(screen, pastedCode);
      await expect.element(checkStatus(screen)).toHaveTextContent(message);

      await paste(screen, pastedCode);

      await expect
        .element(checkStatus(screen))
        .toHaveTextContent(/Found post_slack_message \(Python\)/);
      expect(sent).toEqual([pastedCode, pastedCode]);
      await expect.element(continueButton(screen)).toBeEnabled();
    },
  );

  test("a reload with code but no result checks the code when the step opens", async () => {
    const sent = answerChecks(() => HttpResponse.json(acceptedFacts));
    signIn();
    keepDraft({ finished: ["profile"], code: pastedCode });

    const { screen } = await openCodeStep();

    await expect
      .element(checkStatus(screen))
      .toHaveTextContent(/Found post_slack_message \(Python\)/);
    expect(sent).toEqual([pastedCode]);
    await expect.element(continueButton(screen)).toBeEnabled();
  });

  test("a reload with a kept result checks nothing", async () => {
    const sent = answerChecks(() => HttpResponse.json(acceptedFacts));
    signIn();
    keepDraft(acceptedDraft);

    const { screen } = await openCodeStep();

    await expect.element(continueButton(screen)).toBeEnabled();
    await wait(checkPauseMs + 300);
    expect(sent).toEqual([]);
  });
});

// The SDK control: how the SDK was established, changing an inferred SDK, and choosing one
// when the api can't tell.

interface SentCheck {
  code: string;
  declaredSdk?: string;
}

/** The check answers with `respond` for each body it is sent. Returns every body, in order. */
function answerChecksWithSdk(
  respond: (sent: SentCheck) => Response | Promise<Response>,
): SentCheck[] {
  const sent: SentCheck[] = [];
  worker.use(
    http.post("/api/checks", async ({ request }) => {
      const body = (await request.json()) as SentCheck;
      sent.push(body);
      return respond(body);
    }),
  );
  return sent;
}

/** A Go activity's facts, with how the SDK was established. */
function goFacts(sdk: string, tier: SdkTier): CheckedFacts {
  return {
    ...acceptedFacts,
    sdk,
    activity: { name: "Charge", line: 4 },
    provenance: { sdk: tier },
  };
}

/** The declared SDK's facts when one is sent, otherwise `undeclared`. */
function declaredOr(undeclared: () => Response) {
  return ({ declaredSdk }: SentCheck) =>
    declaredSdk === undefined
      ? undeclared()
      : HttpResponse.json(goFacts(declaredSdk, "declared"));
}

function changeLink(screen: Screen) {
  return screen.getByRole("button", { name: "Change the SDK" });
}

function sdkSelect(screen: Screen) {
  return screen.getByRole("combobox", { name: "SDK" });
}

function optionTexts(screen: Screen): string[] {
  const select = sdkSelect(screen).element() as HTMLSelectElement;
  return [...select.options].map((option) => option.text);
}

function hint(screen: Screen) {
  return screen.getByRole("status").last();
}

describe("the Found line's SDK", () => {
  test("a detected SDK is plain text and can't be changed", async () => {
    answerChecks(() => HttpResponse.json(goFacts("Go", "detected")));
    const { screen } = await openToCheck();

    await paste(screen, pastedCode);

    await expect
      .element(checkStatus(screen))
      .toHaveTextContent("✓ Found Charge (Go). Next, check what we detected.");
    expect(changeLink(screen).elements()).toHaveLength(0);
    expect(sdkSelect(screen).elements()).toHaveLength(0);
  });

  test("an inferred SDK says so, and its name is a link labelled Change the SDK", async () => {
    answerChecks(() => HttpResponse.json(goFacts("Go", "inferred")));
    const { screen } = await openToCheck();

    await paste(screen, pastedCode);

    await expect
      .element(checkStatus(screen))
      .toHaveTextContent(
        "✓ Found Charge (Go, inferred from the code). Next, check what we detected.",
      );
    await expect.element(changeLink(screen)).toBeVisible();
    await expect.element(changeLink(screen)).toHaveTextContent("Go");
    await expect.element(continueButton(screen)).toBeEnabled();
  });

  test("the link opens a dropdown of every catalog SDK, showing the current one", async () => {
    serveCatalog(eightSdkCatalog);
    answerChecks(() => HttpResponse.json(goFacts("Go", "inferred")));
    const { screen } = await openToCheck();
    await paste(screen, pastedCode);

    await changeLink(screen).click();

    await expect.element(sdkSelect(screen)).toBeVisible();
    await expect.element(sdkSelect(screen)).toHaveFocus();
    await expect.element(sdkSelect(screen)).toHaveValue("Go");
    expect(optionTexts(screen)).toEqual([...eightSdks]);
    expect(changeLink(screen).elements()).toHaveLength(0);
  });

  test("choosing an SDK checks again with it declared, and the name stays a link", async () => {
    serveCatalog(eightSdkCatalog);
    const sent = answerChecksWithSdk(
      declaredOr(() => HttpResponse.json(goFacts("Go", "inferred"))),
    );
    const { screen } = await openToCheck();
    await paste(screen, pastedCode);
    await changeLink(screen).click();

    await sdkSelect(screen).selectOptions("Rust");

    await expect
      .element(checkStatus(screen))
      .toHaveTextContent(
        "✓ Found Charge (Rust, declared by you). Next, check what we detected.",
      );
    expect(sent).toEqual([
      { code: pastedCode },
      { code: pastedCode, declaredSdk: "Rust" },
    ]);
    await expect.element(changeLink(screen)).toHaveTextContent("Rust");
    // Focus returns to the link once the dropdown that replaced it is gone.
    await expect.element(changeLink(screen)).toHaveFocus();
    await expect.element(continueButton(screen)).toBeEnabled();
  });

  test("changing the SDK again replaces the previous result", async () => {
    serveCatalog(eightSdkCatalog);
    const sent = answerChecksWithSdk(
      declaredOr(() => HttpResponse.json(goFacts("Go", "inferred"))),
    );
    const { screen } = await openToCheck();
    await paste(screen, pastedCode);
    await changeLink(screen).click();
    await sdkSelect(screen).selectOptions("Rust");
    await expect.element(changeLink(screen)).toHaveTextContent("Rust");

    await changeLink(screen).click();
    await sdkSelect(screen).selectOptions("Java");

    await expect
      .element(checkStatus(screen))
      .toHaveTextContent(
        "✓ Found Charge (Java, declared by you). Next, check what we detected.",
      );
    expect(sent.map(({ declaredSdk }) => declaredSdk)).toEqual([
      undefined,
      "Rust",
      "Java",
    ]);
    await expect
      .poll(() => sessionStorage.getItem(draftStorageKey))
      .toContain('"declaredSdk":"Java"');
  });

  test("Escape closes the dropdown without checking again", async () => {
    const sent = answerChecks(() =>
      HttpResponse.json(goFacts("Go", "inferred")),
    );
    const { screen } = await openToCheck();
    await paste(screen, pastedCode);
    await changeLink(screen).click();
    await expect.element(sdkSelect(screen)).toHaveFocus();

    await userEvent.keyboard("{Escape}");

    await expect.element(changeLink(screen)).toBeVisible();
    expect(sent).toEqual([pastedCode]);
  });

  test("while the catalog loads, the dropdown is disabled and lists only the current SDK", async () => {
    answerChecks(() => HttpResponse.json(goFacts("Go", "inferred")));
    const answer = holdCatalog();
    const { screen } = await openToCheck();
    await paste(screen, pastedCode);

    await changeLink(screen).click();

    await expect.element(sdkSelect(screen)).toBeDisabled();
    expect(optionTexts(screen)).toEqual(["Go"]);
    answer();
  });
});

describe("choosing the SDK when the api can't tell", () => {
  test.each(["not-identified", "ambiguous"])(
    "a %s result shows the prompt, every catalog SDK, and disables Continue with the hint",
    async (reason) => {
      serveCatalog(eightSdkCatalog);
      answerChecks(() => refusal("sdk-choice-needed", { reason }));
      const { screen } = await openToCheck();

      await paste(screen, pastedCode);

      await expect
        .element(checkStatus(screen))
        .toHaveTextContent(
          "We couldn't tell which SDK this is. Choose the one it's written for.",
        );
      await expect.element(sdkSelect(screen)).toBeVisible();
      await expect.element(sdkSelect(screen)).toHaveValue("");
      await expect
        .poll(() => optionTexts(screen))
        .toEqual(["Choose an SDK", ...eightSdks]);
      await expect.element(continueButton(screen)).toBeDisabled();
      await expect
        .element(hint(screen))
        .toHaveTextContent("Choose the SDK this activity is for");
      expect(changeLink(screen).elements()).toHaveLength(0);
    },
  );

  test("choosing an SDK checks again with it declared and enables Continue", async () => {
    serveCatalog(eightSdkCatalog);
    const sent = answerChecksWithSdk(
      declaredOr(() =>
        refusal("sdk-choice-needed", { reason: "not-identified" }),
      ),
    );
    const { screen } = await openToCheck();
    await paste(screen, pastedCode);
    await expect.element(sdkSelect(screen)).toBeEnabled();

    await sdkSelect(screen).selectOptions("Ruby");

    await expect
      .element(checkStatus(screen))
      .toHaveTextContent(
        "✓ Found Charge (Ruby, declared by you). Next, check what we detected.",
      );
    expect(sent).toEqual([
      { code: pastedCode },
      { code: pastedCode, declaredSdk: "Ruby" },
    ]);
    await expect.element(continueButton(screen)).toBeEnabled();
    expect(sdkSelect(screen).elements()).toHaveLength(0);
    await expect.element(changeLink(screen)).toHaveTextContent("Ruby");
  });

  test("a chosen SDK that finds no activity says so and keeps the dropdown", async () => {
    serveCatalog(eightSdkCatalog);
    answerChecksWithSdk(({ declaredSdk }) =>
      declaredSdk === undefined
        ? refusal("sdk-choice-needed", { reason: "not-identified" })
        : refusal("no-activity", { sdk: declaredSdk }),
    );
    const { screen } = await openToCheck();
    await paste(screen, pastedCode);
    await expect.element(sdkSelect(screen)).toBeEnabled();
    // A keyboard user is on the dropdown when they choose.
    (sdkSelect(screen).element() as HTMLSelectElement).focus();

    await sdkSelect(screen).selectOptions("PHP");

    await expect
      .element(checkStatus(screen))
      .toHaveTextContent(
        "No activity found for PHP. Check the code, or choose a different SDK.",
      );
    await expect.element(sdkSelect(screen)).toBeVisible();
    await expect.element(sdkSelect(screen)).toHaveValue("PHP");
    await expect.element(sdkSelect(screen)).toHaveFocus();
    await expect.element(continueButton(screen)).toBeDisabled();
  });

  test("while the catalog loads, the dropdown is disabled with no SDKs made up", async () => {
    answerChecks(() =>
      refusal("sdk-choice-needed", { reason: "not-identified" }),
    );
    const answer = holdCatalog();
    const { screen } = await openToCheck();

    await paste(screen, pastedCode);

    await expect.element(sdkSelect(screen)).toBeDisabled();
    expect(optionTexts(screen)).toEqual(["Choose an SDK"]);
    answer();
    await expect.element(sdkSelect(screen)).toBeEnabled();
  });

  test("the declared SDK is kept through a reload", async () => {
    const sent = answerChecksWithSdk(declaredOr(() => refusal("no-activity")));
    signIn();
    keepDraft({ finished: ["profile"], code: pastedCode, declaredSdk: "Go" });

    const { screen } = await openCodeStep();

    await expect
      .element(checkStatus(screen))
      .toHaveTextContent(/\(Go, declared by you\)/);
    expect(sent).toEqual([{ code: pastedCode, declaredSdk: "Go" }]);
  });
});

describe("an empty paste", () => {
  test("whitespace is checked, gets the not-an-activity line, and no dropdown", async () => {
    const sent = answerChecksWithSdk(() => refusal("not-a-temporal-activity"));
    const { screen } = await openToCheck();

    await paste(screen, "   \n\t\n");

    await expect
      .element(checkStatus(screen))
      .toHaveTextContent(
        "This doesn't look like a Temporal activity in any SDK Durables supports.",
      );
    expect(sent).toEqual([{ code: "   \n\t\n" }]);
    expect(sdkSelect(screen).elements()).toHaveLength(0);
    expect(changeLink(screen).elements()).toHaveLength(0);
  });

  test("whitespace pasted over a declared SDK drops it, and opens no dropdown", async () => {
    const sent = answerChecksWithSdk(({ code }) =>
      code.trim() === ""
        ? refusal("not-a-temporal-activity")
        : refusal("no-activity", { sdk: "Go" }),
    );
    signIn();
    keepDraft({ finished: ["profile"], code: pastedCode, declaredSdk: "Go" });
    const { screen } = await openCodeStep();
    await expect.element(sdkSelect(screen)).toBeVisible();

    await paste(screen, " ");

    await expect
      .element(checkStatus(screen))
      .toHaveTextContent(/doesn't look like a Temporal activity/);
    expect(sdkSelect(screen).elements()).toHaveLength(0);
    expect(sent.at(-1)).toEqual({ code: " " });
  });
});
