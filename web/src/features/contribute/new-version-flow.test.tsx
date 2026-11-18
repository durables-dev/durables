import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import "@/styles/global.css";
import {
  versionNotHigherMessage,
  versionNumberFormatMessage,
  versionTakenMessage,
  whatChangedEmptyMessage,
  whatChangedTooLongMessage,
} from "@durables/schemas";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import { draftStorageKey, type Draft } from "./draft";
import { saferMajorMessage } from "./new-version";
import { newVersionRefusalTypes } from "./new-version-refusal";
import { publishFailedMessage } from "./publish-refusal";
import { acceptedDraft } from "./test-drafts";
import {
  allConfirmed,
  baseTitle,
  descriptions,
  detectedDraft,
  newCode,
  problem,
  reviewDraft,
  serveNewVersion,
  startFrom2,
} from "./test-new-version-server";

// Contribute in new-version mode (DUR-117): opening it, its steps, the Details step's version
// suggestion and messages, the Review step's offer to deprecate the base, publishing, and the
// Published screen. The real route tree, Query and draft; only the API is faked.

type Entry = string | { pathname: string; state: unknown };

async function openAt(entry: Entry) {
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  return { screen, router };
}

type Screen = Awaited<ReturnType<typeof openAt>>["screen"];

const owner: SessionUser = {
  name: "Dana Dieruf",
  initials: "DD",
  provider: "github",
  handle: "ddieruf",
  accountExists: true,
};

function signInAs(user: SessionUser | null) {
  worker.use(http.get("/api/session", () => HttpResponse.json({ user })));
}

function keepDraft(draft: Draft) {
  sessionStorage.setItem(draftStorageKey, JSON.stringify(draft));
}

function keptDraft(): Draft | null {
  const kept = sessionStorage.getItem(draftStorageKey);
  return kept === null ? null : (JSON.parse(kept) as Draft);
}

/** The router state Start from {version} on the Activity page carries. */
function startState(basedOn: string) {
  return {
    from: `/ddieruf/charge-card@${basedOn}`,
    newVersion: { handle: "ddieruf", name: "charge-card", basedOn },
  };
}

function pageHeading(screen: Screen) {
  return screen.getByRole("heading", { level: 1 });
}

function stepHeading(screen: Screen, name: string) {
  return screen.getByRole("heading", { level: 2, name });
}

function continueButton(screen: Screen) {
  return screen.getByRole("button", { name: "Continue" });
}

function versionField(screen: Screen) {
  return screen.getByLabelText("Version", { exact: true });
}

function whatChangedField(screen: Screen) {
  return screen.getByLabelText("What changed");
}

function suggestion(screen: Screen) {
  return screen.getByRole("status").filter({ hasText: "Suggested:" });
}

async function openDetails(draft: Draft = detectedDraft()) {
  signInAs(owner);
  const server = serveNewVersion();
  keepDraft(draft);
  const opened = await openAt("/contribute/details");
  await expect
    .element(stepHeading(opened.screen, "Listing details"))
    .toBeVisible();
  return { ...opened, ...server };
}

function publishButton(screen: Screen, version = "2.1.0") {
  return screen.getByRole("button", { name: `Publish ${version}` });
}

async function openReview(
  draft: Draft = reviewDraft(),
  options: Parameters<typeof serveNewVersion>[0] = {},
) {
  signInAs(owner);
  const server = serveNewVersion(options);
  keepDraft(draft);
  const opened = await openAt("/contribute/review");
  await expect
    .element(stepHeading(opened.screen, "Review and publish"))
    .toBeVisible();
  return { ...opened, ...server };
}

afterEach(() => {
  sessionStorage.clear();
});

describe("opening new-version mode", () => {
  // Criterion 1.
  test("opens at Code, based on the version chosen, with the code blank", async () => {
    signInAs(owner);
    serveNewVersion();
    const { screen, router } = await openAt({
      pathname: "/contribute",
      state: startState("1.1.0"),
    });

    await expect
      .element(stepHeading(screen, "Paste your activity"))
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/code");
    await expect.element(pageHeading(screen)).toHaveTextContent("New version");
    await expect
      .element(screen.getByText("ddieruf/charge-card", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByText(/^Based on/))
      .toHaveTextContent(
        "Based on 1.1.0. Title and description are filled in from it. The code and its behavior start fresh.",
      );
    await expect
      .element(screen.getByLabelText("Paste your file"))
      .toHaveValue("");
    expect(keptDraft()?.newVersion).toEqual({
      handle: "ddieruf",
      name: "charge-card",
      basedOn: "1.1.0",
    });
  });

  test("starts blank even when a first publish's draft was kept", async () => {
    signInAs(owner);
    serveNewVersion();
    keepDraft({ ...acceptedDraft, details: { description: "Kept." } });

    const { screen } = await openAt({
      pathname: "/contribute",
      state: startState("2.0.0"),
    });

    await expect
      .element(screen.getByLabelText("Paste your file"))
      .toHaveValue("");
    expect(keptDraft()).toEqual({
      finished: [],
      origin: "/ddieruf/charge-card@2.0.0",
      newVersion: startFrom2,
    });
  });

  test("a link into Contribute that names no base starts a first publish again", async () => {
    signInAs(owner);
    keepDraft(detectedDraft());

    const { screen } = await openAt({
      pathname: "/contribute",
      state: { from: "/search" },
    });

    await expect.element(pageHeading(screen)).toHaveTextContent("New activity");
    await expect
      .element(screen.getByLabelText("Paste your file"))
      .toHaveValue("");
  });

  test("a reload keeps the pasted code and the base", async () => {
    signInAs(owner);
    serveNewVersion();
    keepDraft({ ...detectedDraft(), finished: [] });

    const { screen } = await openAt("/contribute/code");

    await expect.element(pageHeading(screen)).toHaveTextContent("New version");
    await expect
      .element(screen.getByLabelText("Paste your file"))
      .toHaveValue(newCode);
  });

  test("the steps are Code, Detected, Details and Review, with no Profile & Handle", async () => {
    signInAs(owner);
    serveNewVersion();
    keepDraft(detectedDraft());

    const { screen } = await openAt("/contribute/detected");

    const nav = screen.getByRole("navigation", { name: "Steps" });
    await expect.element(nav).toBeVisible();
    const labels = nav.getByRole("listitem").all();
    expect(labels.map((item) => item.element().textContent)).toEqual([
      "Code (finished)",
      "Detected (finished)",
      "3Details",
      "4Review (locked)",
    ]);
    await expect
      .element(nav.getByText("Profile & Handle"))
      .not.toBeInTheDocument();
  });

  test("the address of Profile & Handle goes to Code", async () => {
    signInAs(owner);
    serveNewVersion();
    keepDraft({ ...detectedDraft(), finished: [], check: undefined });

    const { router } = await openAt("/contribute/profile");

    await expect
      .poll(() => router.state.location.pathname)
      .toBe("/contribute/code");
  });

  test("Back on Code returns to the Activity page it was opened from", async () => {
    signInAs(owner);
    serveNewVersion();
    const { screen, router } = await openAt({
      pathname: "/contribute",
      state: startState("2.0.0"),
    });
    await expect
      .element(stepHeading(screen, "Paste your activity"))
      .toBeVisible();

    await screen.getByRole("button", { name: "Back" }).click();

    await expect
      .element(screen.getByRole("heading", { level: 1, name: baseTitle }))
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/ddieruf/charge-card@2.0.0");
  });

  test("asks a signed-out visitor to sign in", async () => {
    signInAs(null);
    serveNewVersion();
    keepDraft(detectedDraft());

    const { screen } = await openAt("/contribute/code");

    await expect
      .element(
        screen.getByText(
          "Sign in to publish a new version of ddieruf/charge-card.",
          { exact: false },
        ),
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Sign in" }))
      .toHaveAttribute("href", "/sign-in?returnTo=%2Fcontribute");
  });

  test("tells someone else the listing isn't theirs", async () => {
    signInAs({ ...owner, handle: "someone-else" });
    serveNewVersion();
    keepDraft(detectedDraft());

    const { screen } = await openAt("/contribute/code");

    await expect
      .element(
        screen.getByText(
          "Only the publisher of ddieruf/charge-card can publish a new version of it.",
        ),
      )
      .toBeVisible();
  });

  test("says so when the version to start from does not exist", async () => {
    signInAs(owner);
    serveNewVersion({ versions: ["1.0.0"] });
    keepDraft(detectedDraft());

    const { screen } = await openAt("/contribute/code");

    await expect
      .element(
        screen.getByText(
          "ddieruf/charge-card has no version 2.0.0 to start from.",
        ),
      )
      .toBeVisible();
  });
});

describe("the Code step", () => {
  test("checks pasted code and shows Detected as on a first publish", async () => {
    signInAs(owner);
    serveNewVersion();
    const { screen } = await openAt({
      pathname: "/contribute",
      state: startState("2.0.0"),
    });
    const editor = screen.getByLabelText("Paste your file");
    await expect.element(editor).toBeVisible();

    await editor.fill(newCode);

    await expect.element(continueButton(screen)).toBeEnabled();
    await continueButton(screen).click();
    await expect.element(stepHeading(screen, "Detected")).toBeVisible();
  });
});

describe("the Details step", () => {
  // Criterion 1.
  test("fills in the base's title and description, and shows the name fixed", async () => {
    const { screen } = await openDetails();

    await expect.element(screen.getByLabelText("Title")).toHaveValue(baseTitle);
    await expect
      .element(screen.getByLabelText("One-line description"))
      .toHaveValue(descriptions["2.0.0"] ?? "");
    const name = screen.getByLabelText("Name in the address");
    await expect.element(name).toHaveValue("charge-card");
    await expect.element(name).toHaveAttribute("readonly");
  });

  test("fills in the description of the version it is based on", async () => {
    const { screen } = await openDetails({
      ...detectedDraft(),
      newVersion: { ...startFrom2, basedOn: "1.1.0" },
    });

    await expect
      .element(screen.getByLabelText("One-line description"))
      .toHaveValue(descriptions["1.1.0"] ?? "");
  });

  // Criterion 2.
  test("suggests a minor version when the name, input and output match the base", async () => {
    const { screen } = await openDetails();

    await expect
      .element(suggestion(screen))
      .toHaveTextContent(
        "Suggested: 2.1.0. The name, input and output types match 2.0.0, so callers keep working.",
      );
    await expect
      .element(versionField(screen))
      .toHaveAttribute("placeholder", "2.1.0");
  });

  test.each([
    ["activity name", { activity: { name: "charge_payment", line: 4 } }],
    ["input type", { input: "PaymentRequest" }],
    ["output type", { output: "PaymentResult" }],
  ])(
    "suggests a major version when the %s differs from the base",
    async (_, facts) => {
      const { screen } = await openDetails(detectedDraft(facts));

      await expect
        .element(suggestion(screen))
        .toHaveTextContent(
          "Suggested: 3.0.0. The activity name or its input or output type differs from 2.0.0, which breaks callers.",
        );
      await expect
        .element(versionField(screen))
        .toHaveAttribute("placeholder", "3.0.0");
    },
  );

  test("suggests from the latest when the base is older", async () => {
    const { screen } = await openDetails({
      ...detectedDraft(),
      newVersion: { ...startFrom2, basedOn: "1.0.0" },
    });

    await expect
      .element(suggestion(screen))
      .toHaveTextContent("Suggested: 2.1.0.");
  });

  test("Use {x} fills in the suggestion, and the address follows", async () => {
    const { screen } = await openDetails();

    await screen.getByRole("button", { name: "Use 2.1.0" }).click();

    await expect.element(versionField(screen)).toHaveValue("2.1.0");
    await expect
      .element(screen.getByText(/^durables\.dev\//))
      .toHaveTextContent("durables.dev/ddieruf/charge-card@2.1.0");
    await expect
      .element(screen.getByRole("button", { name: "Use 2.1.0" }))
      .not.toBeInTheDocument();
  });

  test("the address updates as the version is typed", async () => {
    const { screen } = await openDetails();

    await versionField(screen).fill("2.4.0");

    await expect
      .element(screen.getByText(/^durables\.dev\//))
      .toHaveTextContent("durables.dev/ddieruf/charge-card@2.4.0");
  });

  // Criterion 3.
  test.each([
    ["2.1", versionNumberFormatMessage],
    ["v2.1.0", versionNumberFormatMessage],
    ["1.1.0", versionTakenMessage("1.1.0")],
    ["2.0.0", versionTakenMessage("2.0.0")],
    ["1.5.0", versionNotHigherMessage("2.0.0")],
  ])(
    "%s shows its message and keeps Continue disabled",
    async (typed, message) => {
      const { screen } = await openDetails({
        ...detectedDraft(),
        details: { whatChanged: "Retries use a fresh key." },
      });

      await versionField(screen).fill(typed);

      await expect.element(suggestion(screen)).toHaveTextContent(message);
      await expect
        .element(versionField(screen))
        .toHaveAttribute("aria-invalid", "true");
      await expect.element(continueButton(screen)).toBeDisabled();
    },
  );

  test("an available number says so and lets the publisher continue to Review", async () => {
    const { screen } = await openDetails({
      ...detectedDraft(),
      details: { whatChanged: "Retries use a fresh key." },
    });

    await versionField(screen).fill("2.1.0");

    await expect
      .element(suggestion(screen))
      .toHaveTextContent("✓ 2.1.0 is available.");
    await expect.element(continueButton(screen)).toBeEnabled();
    await continueButton(screen).click();
    await expect
      .element(stepHeading(screen, "Review and publish"))
      .toBeVisible();
  });

  test("a minor number when a major one is suggested is allowed, with a note", async () => {
    const { screen } = await openDetails({
      ...detectedDraft({ input: "PaymentRequest" }),
      details: { whatChanged: "The input type changed." },
    });

    await versionField(screen).fill("2.1.0");

    await expect
      .element(suggestion(screen))
      .toHaveTextContent(saferMajorMessage);
    await expect.element(continueButton(screen)).toBeEnabled();
  });

  // Criterion 4.
  test("What changed is required: Continue stays disabled while it is empty", async () => {
    const { screen } = await openDetails({
      ...detectedDraft(),
      details: { version: "2.1.0" },
    });

    await expect.element(whatChangedField(screen)).toHaveValue("");
    await expect
      .element(screen.getByText(whatChangedEmptyMessage))
      .toBeVisible();
    await expect.element(continueButton(screen)).toBeDisabled();

    await whatChangedField(screen).fill("Retries use a fresh key.");

    await expect.element(continueButton(screen)).toBeEnabled();
  });

  test("What changed counts down from 160 and refuses 161 characters", async () => {
    const { screen } = await openDetails({
      ...detectedDraft(),
      details: { version: "2.1.0" },
    });
    await expect
      .element(
        screen.getByText(
          "Shown in the version list. Can't be changed after publishing. 160 characters left.",
        ),
      )
      .toBeVisible();

    await whatChangedField(screen).fill("Fix");
    await expect
      .element(screen.getByText(/157 characters left\./))
      .toBeVisible();

    await whatChangedField(screen).fill("x".repeat(160));
    await expect.element(continueButton(screen)).toBeEnabled();

    await whatChangedField(screen).fill("x".repeat(161));
    await expect
      .element(screen.getByText(whatChangedTooLongMessage))
      .toBeVisible();
    await expect.element(continueButton(screen)).toBeDisabled();
  });

  test("Review is locked again until Details is valid", async () => {
    signInAs(owner);
    serveNewVersion();
    keepDraft(reviewDraft({ details: { version: "1.5.0", whatChanged: "x" } }));

    const { router } = await openAt("/contribute/review");

    await expect
      .poll(() => router.state.location.pathname)
      .toBe("/contribute/details");
  });
});

describe("the Review step", () => {
  test("previews the new version and labels Publish with it", async () => {
    const { screen } = await openReview();

    await expect
      .element(screen.getByRole("region", { name: "Listing preview" }))
      .toHaveTextContent("ddieruf/charge-card@2.1.0");
    await expect.element(publishButton(screen)).toBeEnabled();
  });

  test("shows the six confirmations, as on a first publish", async () => {
    const { screen } = await openReview(
      reviewDraft({ confirmations: undefined }),
    );

    const boxes = screen
      .getByRole("group", { name: "Before you publish, confirm each of these" })
      .getByRole("checkbox")
      .all();
    expect(boxes).toHaveLength(6);
    await expect.element(publishButton(screen)).toBeDisabled();
  });

  // Criterion 5.
  test("Deprecate {base} starts unchecked; checked, it shows the reason as Replaced by {new version}", async () => {
    const { screen } = await openReview();
    const box = screen.getByRole("checkbox", { name: "Deprecate 2.0.0" });

    await expect.element(box).not.toBeChecked();
    await expect
      .element(screen.getByLabelText("Reason"))
      .not.toBeInTheDocument();

    await box.click();

    await expect
      .element(screen.getByLabelText("Reason"))
      .toHaveValue("Replaced by 2.1.0");
  });

  test("an empty reason disables Publish", async () => {
    const { screen } = await openReview();
    await screen.getByRole("checkbox", { name: "Deprecate 2.0.0" }).click();

    await screen.getByLabelText("Reason").fill("   ");

    await expect.element(publishButton(screen)).toBeDisabled();
  });

  test("publishing sends the new version, its base and note, and no deprecation", async () => {
    const { screen, published } = await openReview();

    await publishButton(screen).click();

    await expect.element(stepHeading(screen, "Published")).toBeVisible();
    expect(published).toEqual([
      {
        code: newCode,
        title: baseTitle,
        description: descriptions["2.0.0"],
        version: "2.1.0",
        basedOn: "2.0.0",
        whatChanged: "Retries use a fresh key.",
        deprecateBase: null,
        confirmations: allConfirmed,
      },
    ]);
  });

  // Criterion 5.
  test("with Deprecate {base} checked, publishing sends the edited reason", async () => {
    const { screen, published } = await openReview();
    await screen.getByRole("checkbox", { name: "Deprecate 2.0.0" }).click();
    await screen
      .getByLabelText("Reason")
      .fill("Replaced by 2.1.0, which retries with a fresh key");

    await publishButton(screen).click();

    await expect.element(stepHeading(screen, "Published")).toBeVisible();
    expect(published).toEqual([
      expect.objectContaining({
        basedOn: "2.0.0",
        version: "2.1.0",
        deprecateBase: {
          reason: "Replaced by 2.1.0, which retries with a fresh key",
        },
      }),
    ]);
  });

  test("an edited description goes only into the new version", async () => {
    const writes: string[] = [];
    const record = ({ request }: { request: Request }) => {
      if (request.method !== "GET") {
        writes.push(`${request.method} ${new URL(request.url).pathname}`);
      }
    };
    worker.events.on("request:start", record);
    try {
      const { screen, published } = await openReview(
        reviewDraft({
          details: {
            version: "2.1.0",
            whatChanged: "Retries use a fresh key.",
            description: "Charges a card, retrying with a fresh key.",
          },
        }),
      );

      await publishButton(screen).click();

      await expect.element(stepHeading(screen, "Published")).toBeVisible();
      expect(published).toEqual([
        expect.objectContaining({
          description: "Charges a card, retrying with a fresh key.",
        }),
      ]);
      expect(writes).toEqual([
        "POST /api/activities/ddieruf/charge-card/versions",
      ]);
    } finally {
      worker.events.removeListener("request:start", record);
    }
  });

  // Criterion 6.
  test("says publishing returns a removed activity to search", async () => {
    const { screen } = await openReview(reviewDraft(), {
      removedBy: "publisher",
    });

    await expect
      .element(screen.getByText("Publishing returns this activity to search."))
      .toBeVisible();
  });

  test("has no returns-to-search note while the activity is listed", async () => {
    const { screen } = await openReview();

    await expect
      .element(screen.getByText("Publishing returns this activity to search."))
      .not.toBeInTheDocument();
  });

  test("a failed publish stays on Review with a message, and nothing is lost", async () => {
    const draft = reviewDraft({ deprecateBase: true });
    const { screen } = await openReview(draft, {
      publish: () => problem(500),
    });

    await publishButton(screen).click();

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent(publishFailedMessage);
    await expect
      .element(stepHeading(screen, "Review and publish"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("checkbox", { name: "Deprecate 2.0.0" }))
      .toBeChecked();
    expect(keptDraft()).toEqual(draft);
  });

  test("a number published since shows the API's message on Review", async () => {
    const message = versionTakenMessage("2.1.0");
    const { screen } = await openReview(reviewDraft(), {
      publish: () =>
        problem(409, newVersionRefusalTypes.versionTaken, {
          errors: [{ field: "version", message }],
        }),
    });

    await publishButton(screen).click();

    await expect.element(screen.getByRole("alert")).toHaveTextContent(message);
    await expect
      .element(stepHeading(screen, "Review and publish"))
      .toBeVisible();
  });
});

describe("the Published screen", () => {
  // Criterion 7.
  test("says the new version is live and the latest, with both links", async () => {
    const { screen } = await openReview();

    await publishButton(screen).click();

    await expect.element(stepHeading(screen, "Published")).toBeVisible();
    await expect
      .element(screen.getByText(/is live\./))
      .toHaveTextContent(
        "ddieruf/charge-card@2.1.0 is live. It's now the latest version. Earlier versions stay available at their own addresses.",
      );
    await expect
      .element(screen.getByRole("link", { name: "View the listing" }))
      .toHaveAttribute("href", "/ddieruf/charge-card@2.1.0");
    await expect
      .element(screen.getByRole("link", { name: "Go to your profile" }))
      .toHaveAttribute("href", "/profile");
    await expect.element(pageHeading(screen)).toHaveTextContent("New version");
    expect(keptDraft()).toEqual({ finished: [] });
  });
});
