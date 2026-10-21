import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import "@/styles/global.css";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import { ContributeDraftProvider } from "./contribute-draft-provider";
import { draftStorageKey, type Draft } from "./draft";
import {
  acceptedCheck,
  acceptedDraft,
  pastedCode,
  refusedCheck,
} from "./test-drafts";
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
