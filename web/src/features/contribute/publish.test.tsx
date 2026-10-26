import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import "@/styles/global.css";
import { delay, http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import { draftStorageKey, type Draft } from "./draft";
import { acceptedCheck, pastedCode } from "./test-drafts";

// Publishing from Review: the request it sends, the Published screen, and each refusal. The
// real route tree, Query and draft; only the API is faked.

type Entry = string | { pathname: string; state: unknown };

async function openAt(entry: Entry) {
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
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

const description = "Posts a message to a Slack channel and returns its id.";

const allConfirmed = {
  rights: true,
  mitZero: true,
  noSecrets: true,
  notMalicious: true,
  noResponsibility: true,
  terms: true,
} as const;

/** Every step before Review finished and all six boxes checked: ready to publish. */
const readyDraft: Draft = {
  finished: ["profile", "detected", "details"],
  code: pastedCode,
  check: acceptedCheck,
  details: { description },
  confirmations: allConfirmed,
};

const problemHeaders = { "Content-Type": "application/problem+json" };

function problem(status: number, type: string, extra: object = {}) {
  return HttpResponse.json(
    { type, title: "Refused", status, ...extra },
    { status, headers: problemHeaders },
  );
}

const created = {
  address: "ddieruf/post-slack-message@1.0.0",
  handle: "ddieruf",
  name: "post-slack-message",
  version: "1.0.0",
  location: "/api/activities/ddieruf/post-slack-message/versions/1.0.0",
  accountCreated: true,
};

/**
 * Signs the publisher in. The session says the account exists once a publish succeeds, as the
 * API's does.
 */
function signIn(): { published: boolean } {
  const state = { published: false };
  worker.use(
    http.get("/api/session", () =>
      HttpResponse.json({
        user: { ...publisher, accountExists: state.published },
      }),
    ),
  );
  return state;
}

/** Answers publish with `respond`, and keeps every body it was sent. */
function answerPublish(
  respond: () => Response | Promise<Response>,
  session?: { published: boolean },
): unknown[] {
  const bodies: unknown[] = [];
  worker.use(
    http.post("/api/activities", async ({ request }) => {
      bodies.push(await request.json());
      const response = await respond();
      if (session && response.status === 201) session.published = true;
      return response;
    }),
  );
  return bodies;
}

function keepDraft(draft: Draft) {
  sessionStorage.setItem(draftStorageKey, JSON.stringify(draft));
}

function keptDraft(): unknown {
  const kept = sessionStorage.getItem(draftStorageKey);
  return kept === null ? null : JSON.parse(kept);
}

function reviewHeading(screen: Screen) {
  return screen.getByRole("heading", { level: 2, name: "Review and publish" });
}

function publishedHeading(screen: Screen) {
  return screen.getByRole("heading", { level: 2, name: "Published" });
}

function publishButton(screen: Screen) {
  return screen.getByRole("button", { name: "Publish 1.0.0" });
}

function checkboxes(screen: Screen) {
  return screen
    .getByRole("group", { name: "Before you publish, confirm each of these" })
    .getByRole("checkbox")
    .all();
}

async function openReview(draft: Draft = readyDraft) {
  const session = signIn();
  keepDraft(draft);
  const opened = await openAt("/contribute/review");
  await expect.element(reviewHeading(opened.screen)).toBeVisible();
  await expect.element(publishButton(opened.screen)).toBeEnabled();
  return { ...opened, session };
}

afterEach(() => {
  sessionStorage.clear();
});

describe("Publish", () => {
  test("sends the code, the details and the six confirmations", async () => {
    const { screen, session } = await openReview({
      ...readyDraft,
      details: {
        title: "Send to Slack",
        name: "send-to-slack",
        description,
      },
    });
    const bodies = answerPublish(
      () => HttpResponse.json(created, { status: 201 }),
      session,
    );

    await publishButton(screen).click();

    await expect.element(publishedHeading(screen)).toBeVisible();
    expect(bodies).toEqual([
      {
        code: pastedCode,
        title: "Send to Slack",
        name: "send-to-slack",
        description,
        confirmations: allConfirmed,
      },
    ]);
  });

  test("sends the default title and name when the publisher left them", async () => {
    const { screen, session } = await openReview();
    const bodies = answerPublish(
      () => HttpResponse.json(created, { status: 201 }),
      session,
    );

    await publishButton(screen).click();

    await expect.element(publishedHeading(screen)).toBeVisible();
    expect(bodies).toEqual([
      expect.objectContaining({
        title: "Post slack message",
        name: "post-slack-message",
      }),
    ]);
  });

  test("shows it is working and can't be pressed again while publishing", async () => {
    const { screen, session } = await openReview();
    let answer: (() => void) | undefined;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const bodies = answerPublish(async () => {
      await answered;
      return HttpResponse.json(created, { status: 201 });
    }, session);

    await publishButton(screen).click();

    const working = screen.getByRole("button", { name: "Publishing…" });
    await expect.element(working).toBeDisabled();
    await expect.element(publishButton(screen)).not.toBeInTheDocument();
    await expect.poll(() => bodies.length).toBe(1);

    answer?.();
    await expect.element(publishedHeading(screen)).toBeVisible();
    expect(bodies).toHaveLength(1);
  });

  test("a double press sends one request", async () => {
    const { screen, session } = await openReview();
    const bodies = answerPublish(async () => {
      await delay(200);
      return HttpResponse.json(created, { status: 201 });
    }, session);

    await userEvent.dblClick(publishButton(screen));

    await expect.element(publishedHeading(screen)).toBeVisible();
    await delay(300);
    expect(bodies).toHaveLength(1);
  });
});

describe("the Published screen", () => {
  test("shows the check mark, the heading and the live address, and clears the draft", async () => {
    const { screen, router, session } = await openReview();
    answerPublish(() => HttpResponse.json(created, { status: 201 }), session);

    await publishButton(screen).click();

    await expect.element(publishedHeading(screen)).toBeVisible();
    await expect.element(publishedHeading(screen)).toHaveFocus();
    expect(router.state.location.pathname).toBe("/contribute/published");
    const published = screen.getByRole("region", { name: "Published" });
    await expect
      .element(published)
      .toHaveTextContent("ddieruf/post-slack-message@1.0.0 is live.");
    const mark = published.element().querySelector("svg");
    expect(mark?.closest("[aria-hidden='true']")).not.toBeNull();
    expect(keptDraft()).toEqual({ finished: [] });
  });

  test("hides the step list and the Back and Continue bar", async () => {
    const { screen, session } = await openReview();
    answerPublish(() => HttpResponse.json(created, { status: 201 }), session);

    await publishButton(screen).click();

    await expect.element(publishedHeading(screen)).toBeVisible();
    await expect
      .element(screen.getByRole("navigation", { name: "Steps" }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Back" }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: /Continue|Publish/ }))
      .not.toBeInTheDocument();
  });

  test("says the account now exists when this publish created it", async () => {
    const { screen, session } = await openReview();
    answerPublish(() => HttpResponse.json(created, { status: 201 }), session);

    await publishButton(screen).click();

    await expect
      .element(screen.getByRole("region", { name: "Published" }))
      .toHaveTextContent(
        "ddieruf/post-slack-message@1.0.0 is live. Your Durables account, ddieruf, now exists.",
      );
  });

  test("leaves the account line out when the account already existed", async () => {
    const { screen, session } = await openReview();
    answerPublish(
      () =>
        HttpResponse.json(
          { ...created, accountCreated: false },
          { status: 201 },
        ),
      session,
    );

    await publishButton(screen).click();

    await expect.element(publishedHeading(screen)).toBeVisible();
    const published = screen.getByRole("region", { name: "Published" });
    await expect
      .element(published)
      .toHaveTextContent("ddieruf/post-slack-message@1.0.0 is live.");
    await expect
      .element(published.getByText(/Your Durables account/))
      .not.toBeInTheDocument();
    await expect
      .element(published.getByText(/now exists/))
      .not.toBeInTheDocument();
  });

  test("View the listing links to the listing's address", async () => {
    const { screen, session } = await openReview();
    answerPublish(() => HttpResponse.json(created, { status: 201 }), session);

    await publishButton(screen).click();

    await expect
      .element(screen.getByRole("link", { name: "View the listing" }))
      .toHaveAttribute("href", "/ddieruf/post-slack-message@1.0.0");
  });

  test("View the listing opens the listing page at the address", async () => {
    const { screen, router, session } = await openReview();
    answerPublish(() => HttpResponse.json(created, { status: 201 }), session);
    worker.use(
      http.get(
        "/api/activities/ddieruf/post-slack-message/versions/1.0.0",
        () =>
          HttpResponse.json({
            address: "ddieruf/post-slack-message@1.0.0",
            handle: "ddieruf",
            name: "post-slack-message",
            version: "1.0.0",
            title: "Post slack message",
            sdk: "python",
            facts: {},
          }),
      ),
      http.get("/api/activities/ddieruf/post-slack-message", () =>
        HttpResponse.json({
          handle: "ddieruf",
          name: "post-slack-message",
          description,
        }),
      ),
    );

    await publishButton(screen).click();
    await screen.getByRole("link", { name: "View the listing" }).click();

    await expect
      .element(
        screen.getByRole("heading", { level: 1, name: "Post slack message" }),
      )
      .toBeVisible();
    expect(router.state.location.pathname).toBe(
      "/ddieruf/post-slack-message@1.0.0",
    );
    await expect.element(screen.getByText(description)).toBeVisible();
  });

  test("has no profile link and no backup sign-in note", async () => {
    const { screen, session } = await openReview();
    answerPublish(() => HttpResponse.json(created, { status: 201 }), session);

    await publishButton(screen).click();

    await expect.element(publishedHeading(screen)).toBeVisible();
    const main = screen.getByRole("main");
    await expect
      .element(main.getByRole("link", { name: /profile/i }))
      .not.toBeInTheDocument();
    for (const text of [
      /Go to your profile/,
      /backup sign-in/,
      /One more thing/,
    ]) {
      await expect.element(main.getByText(text)).not.toBeInTheDocument();
    }
  });

  test("is shown again after a reload", async () => {
    signIn();
    const { screen } = await openAt({
      pathname: "/contribute/published",
      state: {
        published: {
          handle: "ddieruf",
          name: "post-slack-message",
          version: "1.0.0",
          accountCreated: true,
        },
      },
    });

    await expect.element(publishedHeading(screen)).toBeVisible();
    await expect
      .element(screen.getByRole("region", { name: "Published" }))
      .toHaveTextContent(
        "ddieruf/post-slack-message@1.0.0 is live. Your Durables account, ddieruf, now exists.",
      );
  });

  test("opened with nothing published, starts the flow", async () => {
    worker.use(
      http.get("/api/session", () =>
        HttpResponse.json({ user: { ...publisher, accountExists: true } }),
      ),
    );
    const { screen, router } = await openAt("/contribute/published");

    await expect
      .element(
        screen.getByRole("heading", { level: 2, name: "Paste your activity" }),
      )
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/code");
  });

  test("Contribute opened after publishing starts at Code with an empty draft", async () => {
    const { screen, router, session } = await openReview();
    answerPublish(() => HttpResponse.json(created, { status: 201 }), session);

    await publishButton(screen).click();
    await expect.element(publishedHeading(screen)).toBeVisible();
    await router.navigate("/contribute");

    await expect
      .element(
        screen.getByRole("heading", { level: 2, name: "Paste your activity" }),
      )
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/code");
    await expect
      .element(screen.getByRole("textbox", { name: "Paste your file" }))
      .toHaveValue("");
    expect(keptDraft()).toEqual({ finished: [] });
  });
});

describe("a name already used", () => {
  test("returns to Details with the message under the name and the draft kept", async () => {
    const { screen, router } = await openReview();
    answerPublish(() =>
      problem(409, "https://durables.dev/problems/address-taken", {
        errors: [
          {
            field: "name",
            message: "You already have a listing at this address.",
          },
        ],
      }),
    );

    await publishButton(screen).click();

    await expect
      .element(
        screen.getByRole("heading", { level: 2, name: "Listing details" }),
      )
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/details");
    const name = screen.getByLabelText("Name in the address");
    await expect.element(name).toHaveValue("post-slack-message");
    await expect.element(name).toHaveAttribute("aria-invalid", "true");
    await expect
      .element(screen.getByText("You already have a listing at this address."))
      .toBeVisible();
    await expect
      .element(screen.getByLabelText("One-line description"))
      .toHaveValue(description);
    await expect
      .element(screen.getByLabelText("Title"))
      .toHaveValue("Post slack message");
    expect(keptDraft()).toEqual({
      ...readyDraft,
      usedName: "post-slack-message",
    });
  });
});

describe("a handle taken since it was chosen", () => {
  test("goes to the handle step with the taken message and the draft kept", async () => {
    const { screen, router } = await openReview();
    answerPublish(() =>
      problem(409, "https://durables.dev/problems/handle-taken", {
        handle: "ddieruf",
        errors: [{ field: "handle", message: "ddieruf is taken." }],
      }),
    );

    await publishButton(screen).click();

    await expect
      .element(
        screen.getByRole("heading", { level: 2, name: "Choose your handle" }),
      )
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/profile");
    await expect
      .element(screen.getByRole("textbox", { name: "Handle" }))
      .toHaveValue("ddieruf");
    await expect
      .element(
        screen
          .getByRole("status")
          .filter({ hasText: "That handle was just taken. Choose another." }),
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Continue" }))
      .toBeDisabled();
    expect(keptDraft()).toEqual({
      ...readyDraft,
      finished: ["detected", "details"],
      takenHandle: "ddieruf",
    });
  });

  test("the message goes once the publisher types another handle", async () => {
    const { screen } = await openReview();
    answerPublish(() =>
      problem(409, "https://durables.dev/problems/handle-taken", {
        handle: "ddieruf",
      }),
    );

    await publishButton(screen).click();
    const field = screen.getByRole("textbox", { name: "Handle" });
    await expect.element(field).toHaveValue("ddieruf");
    await field.fill("dana-dieruf");

    await expect
      .element(screen.getByText("That handle was just taken. Choose another."))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Continue" }))
      .toBeEnabled();
  });
});

describe("a publish that did not go through", () => {
  test.each([
    [
      413,
      "https://durables.dev/problems/code-too-large",
      "This file is too large to publish. The limit is 100 KB.",
    ],
    [
      422,
      "https://durables.dev/problems/invalid-listing",
      "Some of the details or confirmations weren't accepted. Check them and try again.",
    ],
    [
      422,
      "https://durables.dev/problems/no-activity",
      "The code didn't pass its check when publishing. Go back to Code and paste it again.",
    ],
    [
      429,
      "https://durables.dev/problems/publish-limited",
      "Too many publishes in a short time. Wait a minute and try again.",
    ],
    [500, "about:blank", "Publishing didn't go through. Try again."],
  ])(
    "a %i (%s) shows a message above Publish and the boxes stay checked",
    async (status, type, message) => {
      const { screen, router } = await openReview();
      answerPublish(() => problem(status, type));

      await publishButton(screen).click();

      const alert = screen.getByRole("alert");
      await expect.element(alert).toHaveTextContent(message);
      expect(router.state.location.pathname).toBe("/contribute/review");
      expect(
        alert
          .element()
          .compareDocumentPosition(publishButton(screen).element()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      const boxes = checkboxes(screen);
      expect(boxes).toHaveLength(6);
      for (const box of boxes) {
        await expect.element(box).toBeChecked();
      }
      await expect.element(publishButton(screen)).toBeEnabled();
      expect(keptDraft()).toEqual(readyDraft);
    },
  );

  test("a network failure shows the unexpected message and the boxes stay checked", async () => {
    const { screen } = await openReview();
    answerPublish(() => HttpResponse.error());

    await publishButton(screen).click();

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Publishing didn't go through. Try again.");
    for (const box of checkboxes(screen)) {
      await expect.element(box).toBeChecked();
    }
  });

  test("Publish can be pressed again after a refusal, and succeeds", async () => {
    const { screen, session } = await openReview();
    let attempts = 0;
    answerPublish(() => {
      attempts += 1;
      return attempts === 1
        ? problem(429, "https://durables.dev/problems/publish-limited")
        : HttpResponse.json(created, { status: 201 });
    }, session);

    await publishButton(screen).click();
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Too many publishes");
    await publishButton(screen).click();

    await expect.element(publishedHeading(screen)).toBeVisible();
  });
});
