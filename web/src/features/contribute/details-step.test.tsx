import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import "@/styles/global.css";
import {
  listingDescriptionEmptyMessage,
  listingDescriptionTooLongMessage,
  listingNameEmptyMessage,
  listingNameFormatMessage,
  listingTitleEmptyMessage,
  listingTitleTooLongMessage,
} from "@durables/schemas";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import { draftStorageKey, type Draft } from "./draft";
import { acceptedDraft } from "./test-drafts";

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

/** Profile & Handle, Code and Detected finished, with `post_slack_message` accepted. */
const detectedDraft: Draft = {
  ...acceptedDraft,
  finished: ["profile", "detected"],
};

const description = "Posts a message to a Slack channel and returns its id.";

async function openDetails(draft: Draft = detectedDraft) {
  signIn();
  keepDraft(draft);
  const opened = await openAt("/contribute/details");
  await expect.element(heading(opened.screen)).toBeVisible();
  return opened;
}

function heading(screen: Screen) {
  return screen.getByRole("heading", { level: 2, name: "Listing details" });
}

function titleField(screen: Screen) {
  return screen.getByLabelText("Title", { exact: true });
}

function nameField(screen: Screen) {
  return screen.getByLabelText("Name in the address", { exact: true });
}

function versionField(screen: Screen) {
  return screen.getByLabelText("Version", { exact: true });
}

function descriptionField(screen: Screen) {
  return screen.getByLabelText("One-line description", { exact: true });
}

function continueButton(screen: Screen) {
  return screen.getByRole("button", { name: "Continue" });
}

function steps(screen: Screen) {
  return screen.getByRole("navigation", { name: "Steps" });
}

function preview(screen: Screen) {
  return screen.getByText(/^durables\.dev\//);
}

type Field = ReturnType<typeof titleField>;

/**
 * The message under a field: the first element the field names in aria-describedby, as long
 * as it is shown and sits below the field. Empty when the field has no message.
 */
function messageUnder(field: Field): string {
  const input = field.element();
  const [id] = (input.getAttribute("aria-describedby") ?? "").split(" ");
  const message = id ? document.getElementById(id) : null;
  if (!message) throw new Error("Expected the field to name its message");
  if (message.hidden) return "";
  expect(message.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    input.getBoundingClientRect().bottom,
  );
  return message.textContent;
}

afterEach(() => {
  sessionStorage.clear();
});

describe("the step as it opens", () => {
  test("prefills the title and name, shows 1.0.0 and leaves the description empty", async () => {
    const { screen } = await openDetails();

    await expect.element(titleField(screen)).toHaveValue("Post slack message");
    await expect.element(nameField(screen)).toHaveValue("post-slack-message");
    await expect.element(versionField(screen)).toHaveValue("1.0.0");
    await expect.element(descriptionField(screen)).toHaveValue("");
  });

  test("moves focus to its heading", async () => {
    const { screen } = await openDetails();

    await expect.element(heading(screen)).toHaveFocus();
  });

  test("shows the version in a dashed box that can't be changed", async () => {
    const { screen } = await openDetails();

    const version = versionField(screen);
    await expect.element(version).toHaveAttribute("readonly");
    expect(getComputedStyle(version.element()).borderTopStyle).toBe("dashed");
    expect(getComputedStyle(nameField(screen).element()).borderTopStyle).toBe(
      "solid",
    );

    await userEvent.type(version, "2");
    await expect.element(version).toHaveValue("1.0.0");
  });

  test("previews the address with the session's handle and the name in bold", async () => {
    const { screen } = await openDetails();

    await expect
      .element(preview(screen))
      .toHaveTextContent("durables.dev/ddieruf/post-slack-message@1.0.0");
    const name = preview(screen).getByText("post-slack-message", {
      exact: true,
    });
    expect(name.element().tagName).toBe("STRONG");
    expect(
      Number(getComputedStyle(name.element()).fontWeight),
    ).toBeGreaterThanOrEqual(600);
    // The preview sits under the name and version, above the description.
    expect(
      preview(screen).element().getBoundingClientRect().top,
    ).toBeGreaterThan(
      nameField(screen).element().getBoundingClientRect().bottom,
    );
    expect(
      preview(screen).element().getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(
      descriptionField(screen).element().getBoundingClientRect().top,
    );
  });

  test("marks Details as step 3, current, with the steps before it ticked", async () => {
    const { screen } = await openDetails();

    const current = steps(screen).getByRole("link", { name: "Details" });
    await expect.element(current).toHaveAttribute("aria-current", "step");
    expect(current.element().textContent).toBe("3Details");
    for (const name of ["Profile & Handle", "Code", "Detected"]) {
      const link = steps(screen).getByRole("link", {
        name: `${name} (finished)`,
      });
      await expect.element(link).toBeVisible();
      expect(link.element().querySelector("svg")).not.toBeNull();
    }
    await expect
      .element(steps(screen).getByText("Review (locked)"))
      .toBeInTheDocument();
  });

  test("shows nothing beyond the description: no Category", async () => {
    const { screen } = await openDetails();

    const form = heading(screen).element().closest("form");
    if (!form) throw new Error("Expected the step's form");
    expect(form.textContent).not.toMatch(/category/i);
    expect(form.querySelectorAll("select")).toHaveLength(0);
    expect(
      [...form.querySelectorAll("label")].map((label) => label.textContent),
    ).toEqual([
      "Title",
      "Name in the address",
      "Version",
      "One-line description",
    ]);
  });
});

describe("the name in the address", () => {
  test("is lowercased as it is typed, and the preview follows it", async () => {
    const { screen } = await openDetails();

    await nameField(screen).clear();
    await userEvent.type(nameField(screen), "Slack-POSTER");

    await expect.element(nameField(screen)).toHaveValue("slack-poster");
    await expect
      .element(preview(screen))
      .toHaveTextContent("durables.dev/ddieruf/slack-poster@1.0.0");
    await expect
      .element(preview(screen).getByText("slack-poster", { exact: true }))
      .toBeVisible();
  });

  test("is lowercased when pasted in capitals", async () => {
    const { screen } = await openDetails();

    await nameField(screen).fill("CHARGE-Card");

    await expect.element(nameField(screen)).toHaveValue("charge-card");
    await expect
      .element(preview(screen))
      .toHaveTextContent("durables.dev/ddieruf/charge-card@1.0.0");
  });

  test("keeps the caret where it was typed", async () => {
    const { screen } = await openDetails();

    const input = nameField(screen).element() as HTMLInputElement;
    await userEvent.click(nameField(screen));
    input.setSelectionRange(4, 4);
    await userEvent.keyboard("X");

    await expect.element(nameField(screen)).toHaveValue("postx-slack-message");
    expect(input.selectionStart).toBe(5);
  });
});

describe("the description's counter", () => {
  test.each([
    [0, 160],
    [159, 1],
    [160, 0],
    [161, -1],
  ])("reads 160 less %i characters", async (length, left) => {
    const { screen } = await openDetails();

    await descriptionField(screen).fill("d".repeat(length));

    await expect
      .element(screen.getByText(/^Shown on search results\./))
      .toHaveTextContent(
        `Shown on search results. ${String(left)} characters left.`,
      );
  });

  test("counts down as the publisher types", async () => {
    const { screen } = await openDetails();

    await userEvent.type(descriptionField(screen), "Posts");

    await expect
      .element(screen.getByText(/^Shown on search results\./))
      .toHaveTextContent("Shown on search results. 155 characters left.");
  });
});

describe("Continue", () => {
  test("is disabled, with the hint, while the description is empty", async () => {
    const { screen } = await openDetails();

    await expect.element(continueButton(screen)).toBeDisabled();
    await expect
      .element(screen.getByText("Complete the details", { exact: true }))
      .toBeVisible();
    expect(messageUnder(descriptionField(screen))).toBe(
      listingDescriptionEmptyMessage,
    );
  });

  test("is enabled once all three are valid, and opens Review", async () => {
    const { screen, router } = await openDetails();

    await descriptionField(screen).fill(description);

    await expect.element(continueButton(screen)).toBeEnabled();
    expect(
      screen.getByText("Complete the details", { exact: true }).query(),
    ).toBeNull();
    expect(messageUnder(titleField(screen))).toBe("");
    expect(messageUnder(nameField(screen))).toBe("");
    expect(messageUnder(descriptionField(screen))).toBe("");

    await continueButton(screen).click();

    await expect
      .poll(() => router.state.location.pathname)
      .toBe("/contribute/review");
    await expect
      .element(steps(screen).getByRole("link", { name: "Review" }))
      .toHaveAttribute("aria-current", "step");
    await expect
      .element(steps(screen).getByRole("link", { name: "Details (finished)" }))
      .toBeVisible();
  });

  test("is enabled at a description of exactly 160 characters", async () => {
    const { screen } = await openDetails();

    await descriptionField(screen).fill("d".repeat(160));

    await expect.element(continueButton(screen)).toBeEnabled();
    expect(messageUnder(descriptionField(screen))).toBe("");
  });

  test.each([
    ["title", titleField, listingTitleEmptyMessage],
    ["name", nameField, listingNameEmptyMessage],
    ["description", descriptionField, listingDescriptionEmptyMessage],
  ] as const)(
    "is disabled while the %s is empty, with a message under it",
    async (_, field, message) => {
      const { screen } = await openDetails();
      await descriptionField(screen).fill(description);
      await expect.element(continueButton(screen)).toBeEnabled();

      await field(screen).fill("");

      await expect.element(continueButton(screen)).toBeDisabled();
      await expect
        .element(field(screen))
        .toHaveAttribute("aria-invalid", "true");
      expect(messageUnder(field(screen))).toBe(message);
    },
  );

  test.each([
    [
      "a title of 81 characters",
      titleField,
      "t".repeat(81),
      listingTitleTooLongMessage,
    ],
    [
      "a description of 161 characters",
      descriptionField,
      "d".repeat(161),
      listingDescriptionTooLongMessage,
    ],
  ] as const)(
    "is disabled for %s, with a message under it",
    async (_, field, value, message) => {
      const { screen } = await openDetails();
      await descriptionField(screen).fill(description);

      await field(screen).fill(value);

      await expect.element(continueButton(screen)).toBeDisabled();
      expect(messageUnder(field(screen))).toBe(message);
    },
  );

  test.each([
    ["starting with a hyphen", "-slack-poster"],
    ["ending with a hyphen", "slack-poster-"],
    ["with two hyphens in a row", "slack--poster"],
    ["of two characters", "sp"],
    ["of 65 characters", "s".repeat(65)],
    ["with a space", "slack poster"],
    ["with an underscore", "slack_poster"],
  ])(
    "is disabled for a name %s, with the name rule under it",
    async (_, name) => {
      const { screen } = await openDetails();
      await descriptionField(screen).fill(description);

      await nameField(screen).fill(name);

      await expect.element(continueButton(screen)).toBeDisabled();
      expect(messageUnder(nameField(screen))).toBe(listingNameFormatMessage);
    },
  );

  test("Enter in a field does not leave the step while a field is invalid", async () => {
    const { screen, router } = await openDetails();

    await userEvent.click(titleField(screen));
    await userEvent.keyboard("{Enter}");

    await expect.element(heading(screen)).toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/details");
  });
});

describe("a name already used, as publish reports it", () => {
  test("shows the message under the name when the step opens", async () => {
    const { screen } = await openDetails({
      ...detectedDraft,
      finished: ["profile", "detected", "details"],
      details: { description },
      nameUsed: true,
    });

    expect(messageUnder(nameField(screen))).toBe(
      "You already have a listing at this address.",
    );
    await expect
      .element(nameField(screen))
      .toHaveAttribute("aria-invalid", "true");
    await expect.element(nameField(screen)).toHaveValue("post-slack-message");
  });

  test("goes once the publisher edits the name", async () => {
    const { screen } = await openDetails({
      ...detectedDraft,
      details: { description },
      nameUsed: true,
    });

    await nameField(screen).fill("slack-poster");

    expect(messageUnder(nameField(screen))).toBe("");
    await expect.element(continueButton(screen)).toBeEnabled();
  });
});

describe("returning to the step", () => {
  test("shows the details kept in the draft", async () => {
    const { screen } = await openDetails({
      ...detectedDraft,
      details: {
        title: "Slack poster",
        name: "slack-poster",
        description,
      },
    });

    await expect.element(titleField(screen)).toHaveValue("Slack poster");
    await expect.element(nameField(screen)).toHaveValue("slack-poster");
    await expect.element(descriptionField(screen)).toHaveValue(description);
    await expect
      .element(preview(screen))
      .toHaveTextContent("durables.dev/ddieruf/slack-poster@1.0.0");
    await expect.element(continueButton(screen)).toBeEnabled();
  });

  test("keeps what was typed after going Back to Detected and on again", async () => {
    const { screen, router } = await openDetails();
    await titleField(screen).fill("Slack poster");
    await nameField(screen).fill("slack-poster");
    await descriptionField(screen).fill(description);

    await screen.getByRole("button", { name: "Back" }).click();
    await expect
      .poll(() => router.state.location.pathname)
      .toBe("/contribute/detected");
    await screen.getByRole("button", { name: "Continue" }).click();

    await expect.element(heading(screen)).toBeVisible();
    await expect.element(titleField(screen)).toHaveValue("Slack poster");
    await expect.element(nameField(screen)).toHaveValue("slack-poster");
    await expect.element(descriptionField(screen)).toHaveValue(description);
  });

  test("keeps a field the publisher cleared empty", async () => {
    const { screen } = await openDetails({
      ...detectedDraft,
      details: { title: "" },
    });

    await expect.element(titleField(screen)).toHaveValue("");
    expect(messageUnder(titleField(screen))).toBe(listingTitleEmptyMessage);
  });

  test("from Review keeps the details, which Review was reached with", async () => {
    const { screen, router } = await openDetails();
    await descriptionField(screen).fill(description);
    await continueButton(screen).click();
    await expect
      .poll(() => router.state.location.pathname)
      .toBe("/contribute/review");

    await steps(screen)
      .getByRole("link", { name: "Details (finished)" })
      .click();

    await expect.element(heading(screen)).toBeVisible();
    await expect.element(descriptionField(screen)).toHaveValue(description);
  });
});

describe("Details clears to invalid after continuing", () => {
  test("locks Review again until the details are valid", async () => {
    const { screen } = await openDetails({
      ...detectedDraft,
      finished: ["profile", "detected", "details"],
      details: { description },
    });
    await expect
      .element(steps(screen).getByRole("link", { name: "Review" }))
      .toBeVisible();

    await descriptionField(screen).fill("");

    await expect
      .element(steps(screen).getByText("Review (locked)"))
      .toBeInTheDocument();
    await expect
      .element(steps(screen).getByRole("link", { name: "Details" }))
      .toHaveAttribute("aria-current", "step");
  });
});
