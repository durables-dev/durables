import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import "@/styles/global.css";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import { ContributeDraftProvider } from "./contribute-draft-provider";
import { draftStorageKey, type Draft } from "./draft";
import { ReviewStep } from "./review-step";
import type { StepId } from "./steps";
import { acceptedCheck, acceptedFacts, pastedCode } from "./test-drafts";

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

const description = "Posts a message to a Slack channel and returns its id.";

/** Every step before Review finished, with the title and name left at their defaults. */
const reviewDraft: Draft = {
  finished: ["profile", "detected", "details"],
  code: pastedCode,
  check: acceptedCheck,
  details: { description },
};

const allConfirmed: Draft["confirmations"] = {
  rights: true,
  mitZero: true,
  noSecrets: true,
  notMalicious: true,
  noResponsibility: true,
  terms: true,
};

const confirmationTexts = [
  "I wrote this code, or I own the copyright or have permission to publish it.",
  "I'm publishing it under MIT-0: anyone may use, change and share it, with no attribution and no warranty.",
  "It contains no secrets, credentials, keys or personal data.",
  "It isn't malicious and doesn't knowingly harm the systems it runs on.",
  "I understand Durables doesn't review or warrant published code and takes no responsibility for it. I'm responsible for what I publish.",
  "I agree to the Durables Terms.",
];

function heading(screen: Screen) {
  return screen.getByRole("heading", { level: 2, name: "Review and publish" });
}

function card(screen: Screen) {
  return screen.getByRole("region", { name: "Listing preview" });
}

function confirmationsGroup(screen: Screen) {
  return screen.getByRole("group", {
    name: "Before you publish, confirm each of these",
  });
}

function checkboxes(screen: Screen) {
  return confirmationsGroup(screen).getByRole("checkbox").all();
}

function publish(screen: Screen) {
  return screen.getByRole("button", { name: "Publish 1.0.0" });
}

function hint(screen: Screen) {
  return screen
    .getByRole("status")
    .filter({ hasText: "Confirm each item above" });
}

async function openReview(draft: Draft) {
  signIn();
  keepDraft(draft);
  const opened = await openAt("/contribute/review");
  await expect.element(heading(opened.screen)).toBeVisible();
  return opened;
}

/** The step on its own, with the finished steps given, for cases the flow's address rules out. */
async function renderReview(draft: Draft, finished: StepId[]) {
  keepDraft(draft);
  const router = createMemoryRouter(
    [
      {
        path: "/contribute/review",
        element: (
          <ContributeDraftProvider>
            <ReviewStep handle="ddieruf" finished={finished} />
          </ContributeDraftProvider>
        ),
      },
    ],
    { initialEntries: ["/contribute/review"] },
  );
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  await expect.element(heading(screen)).toBeVisible();
  return screen;
}

afterEach(() => {
  sessionStorage.clear();
});

describe("the Review step", () => {
  test("shows the heading and the line under it", async () => {
    const { screen } = await openReview(reviewDraft);

    await expect
      .element(
        screen.getByText(
          "This is how your activity will appear. Once published, this version can't be edited.",
        ),
      )
      .toBeVisible();
  });

  test("moves focus to its heading when it appears", async () => {
    const { screen } = await openReview(reviewDraft);

    await expect.element(heading(screen)).toHaveFocus();
  });

  test("Review is current in the step list", async () => {
    const { screen } = await openReview(reviewDraft);

    await expect
      .element(
        screen
          .getByRole("navigation", { name: "Steps" })
          .getByRole("link", { name: "Review" }),
      )
      .toHaveAttribute("aria-current", "step");
  });

  test("the preview card shows the icon, title, address, SDK and description from the draft", async () => {
    const { screen } = await openReview(reviewDraft);

    const preview = card(screen);
    await expect
      .element(
        preview.getByRole("heading", { level: 3, name: "Post slack message" }),
      )
      .toBeVisible();
    await expect
      .element(
        preview.getByText("ddieruf/post-slack-message@1.0.0", { exact: true }),
      )
      .toBeVisible();
    await expect
      .element(preview.getByText("Python", { exact: true }))
      .toBeVisible();
    await expect
      .element(preview.getByText(description, { exact: true }))
      .toBeVisible();
    const icon = preview.element().querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon?.closest("[aria-hidden='true']")).not.toBeNull();
  });

  test("the preview card shows the publisher's own edits", async () => {
    const { screen } = await openReview({
      ...reviewDraft,
      check: {
        outcome: "accepted",
        facts: { ...acceptedFacts, sdk: "TypeScript" },
      },
      details: {
        title: "Send to Slack",
        name: "send-to-slack",
        description: "Sends a Slack message.",
      },
    });

    const preview = card(screen);
    await expect
      .element(
        preview.getByRole("heading", { level: 3, name: "Send to Slack" }),
      )
      .toBeVisible();
    await expect
      .element(
        preview.getByText("ddieruf/send-to-slack@1.0.0", { exact: true }),
      )
      .toBeVisible();
    await expect
      .element(preview.getByText("TypeScript", { exact: true }))
      .toBeVisible();
    await expect
      .element(preview.getByText("Sends a Slack message.", { exact: true }))
      .toBeVisible();
  });

  test("shows the six confirmations with their exact texts, in order, all unchecked", async () => {
    const { screen } = await openReview(reviewDraft);

    await expect.element(confirmationsGroup(screen)).toBeVisible();
    const boxes = checkboxes(screen);
    expect(boxes).toHaveLength(6);
    for (const [index, text] of confirmationTexts.entries()) {
      const box = screen.getByRole("checkbox", { name: text, exact: true });
      await expect.element(box).not.toBeChecked();
      expect(boxes[index]?.element()).toBe(box.element());
    }
  });

  test("shows the disclaimer under the boxes", async () => {
    const { screen } = await openReview(reviewDraft);

    const disclaimer = confirmationsGroup(screen).getByText(
      "Durables hosts code as provided. It doesn't review, test or warrant anything published here and accepts no responsibility for how it's used. Read the full Terms.",
    );
    await expect.element(disclaimer).toBeVisible();
    const lastBox = checkboxes(screen).at(-1)?.element();
    expect(lastBox).toBeDefined();
    expect(
      lastBox!.compareDocumentPosition(disclaimer.element()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("Publish", () => {
  test("is disabled with the hint at every count from 0 to 5 boxes, and enabled at 6", async () => {
    const { screen } = await openReview(reviewDraft);
    const boxes = checkboxes(screen);

    for (const box of boxes) {
      await expect.element(publish(screen)).toBeDisabled();
      await expect.element(hint(screen)).toBeInTheDocument();
      await box.click();
      await expect.element(box).toBeChecked();
    }

    await expect.element(publish(screen)).toBeEnabled();
    await expect
      .element(
        screen
          .getByRole("status")
          .filter({ hasText: "Confirm each item above" }),
      )
      .not.toBeInTheDocument();
  });

  test("is disabled again when one box is unchecked", async () => {
    const { screen } = await openReview({
      ...reviewDraft,
      confirmations: allConfirmed,
    });
    await expect.element(publish(screen)).toBeEnabled();

    const box = screen.getByRole("checkbox", {
      name: "It contains no secrets, credentials, keys or personal data.",
    });
    await box.click();

    await expect.element(box).not.toBeChecked();
    await expect.element(publish(screen)).toBeDisabled();
    await expect.element(hint(screen)).toBeInTheDocument();
  });
});

describe("the Terms link", () => {
  test("points to /terms and opens in the same tab", async () => {
    const { screen } = await openReview(reviewDraft);

    const link = confirmationsGroup(screen).getByRole("link", {
      name: "Terms",
    });
    await expect.element(link).toHaveAttribute("href", "/terms");
    await expect.element(link).not.toHaveAttribute("target");
  });

  test("keeps the draft and the checked boxes when the publisher goes to Terms and back", async () => {
    const { screen, router } = await openReview(reviewDraft);
    const checked = confirmationTexts.filter((_, index) =>
      [0, 2, 5].includes(index),
    );
    for (const text of checked) {
      await screen.getByRole("checkbox", { name: text, exact: true }).click();
    }

    await confirmationsGroup(screen)
      .getByRole("link", { name: "Terms" })
      .click();
    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Terms" }))
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/terms");

    await router.navigate(-1);

    await expect.element(heading(screen)).toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/review");
    for (const text of confirmationTexts) {
      const box = screen.getByRole("checkbox", { name: text, exact: true });
      if (checked.includes(text)) {
        await expect.element(box).toBeChecked();
      } else {
        await expect.element(box).not.toBeChecked();
      }
    }
    await expect
      .element(
        card(screen).getByText("ddieruf/post-slack-message@1.0.0", {
          exact: true,
        }),
      )
      .toBeVisible();
    await expect
      .element(card(screen).getByText(description, { exact: true }))
      .toBeVisible();
  });
});

describe("the still-needed alert", () => {
  test("is absent when every earlier step is finished", async () => {
    const { screen } = await openReview(reviewDraft);

    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  });

  test("lists Details when the publisher has since cleared a detail, and Publish stays disabled", async () => {
    const { screen } = await openReview({
      ...reviewDraft,
      details: { title: "", description },
      confirmations: allConfirmed,
    });

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Still needed before publishing: Details");
    await expect.element(publish(screen)).toBeDisabled();
  });

  test.each([
    ["profile", "Profile & Handle"],
    ["code", "Code"],
    ["detected", "Detected"],
    ["details", "Details"],
  ] as const)("lists %s when it is not finished", async (step, label) => {
    const finished = (
      ["profile", "code", "detected", "details"] as const
    ).filter((id) => id !== step);
    const screen = await renderReview(
      { ...reviewDraft, confirmations: allConfirmed },
      finished,
    );

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent(`Still needed before publishing: ${label}`);
    await expect.element(publish(screen)).toBeDisabled();
  });

  test("lists every unfinished step together", async () => {
    const screen = await renderReview(reviewDraft, ["profile", "details"]);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Still needed before publishing: Code, Detected");
  });
});

describe("what Review leaves out", () => {
  test("shows no pasted-code note, evaluation report, provenance or category", async () => {
    const { screen } = await openReview(reviewDraft);

    const main = screen.getByRole("main");
    for (const text of [
      "Pasted code. The listing won't show repository provenance.",
      "Pasted code",
      "Provenance",
      "Idempotent",
      "Has compensation",
      "Declares non-retryable errors",
      "No third-party dependencies",
      "Category",
    ]) {
      await expect.element(main.getByText(text)).not.toBeInTheDocument();
    }
  });
});

describe("Back", () => {
  test("returns to Details", async () => {
    const { screen, router } = await openReview(reviewDraft);

    await screen.getByRole("button", { name: "Back" }).click();

    await expect
      .poll(() => router.state.location.pathname)
      .toBe("/contribute/details");
  });
});
