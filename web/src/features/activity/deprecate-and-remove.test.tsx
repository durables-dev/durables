import "@/styles/global.css";
import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import {
  refuse,
  serveChargeCard,
  type TestListingState,
} from "./test-listing-server";

// The publisher bar's Deprecate, Undo deprecation, Remove and Return to search, the dialogs
// they open, the notices everyone sees, and the noindex marking on a removed activity.

const owner: SessionUser = {
  name: "Dana Dieruf",
  initials: "DD",
  provider: "github",
  handle: "ddieruf",
  accountExists: true,
};

const removedText =
  "Removed by the publisher. This activity no longer appears in search. Its page and every version's address still work, so existing links and workflows don't break.";
const deprecateIntro =
  "The version stays available at its address and doesn't change. Its page shows your notice.";
const failedText = "That didn't save. Try again.";

function signInAs(user: SessionUser | null) {
  worker.use(http.get("/api/session", () => HttpResponse.json({ user })));
}

/** Opens a version's page with the given listing state, once the title shows. */
async function openPage(
  state: Partial<TestListingState> = {},
  version = "1.0.0",
) {
  const server = serveChargeCard(state);
  const router = createMemoryRouter(routes, {
    initialEntries: [`/ddieruf/charge-card@${version}`],
  });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Charge card" }))
    .toBeVisible();
  return { screen, router, ...server };
}

type Screen = Awaited<ReturnType<typeof openPage>>["screen"];

/** Opens the page as its publisher, once the bar shows. */
async function openOwnPage(
  state: Partial<TestListingState> = {},
  version?: string,
) {
  signInAs(owner);
  const opened = await openPage(state, version);
  await expect.element(bar(opened.screen)).toBeVisible();
  return opened;
}

function bar(screen: Screen) {
  return screen.getByRole("region", {
    name: "Your listing controls",
    exact: true,
  });
}

/** The bar's own buttons, in order, leaving out those inside its dialogs. */
function barButtons(screen: Screen) {
  return [...bar(screen).element().querySelectorAll("button")]
    .filter((button) => button.closest("dialog") === null)
    .map((button) => button.textContent);
}

function barButton(screen: Screen, name: string) {
  return [...bar(screen).element().querySelectorAll("button")].find(
    (button) =>
      button.closest("dialog") === null && button.textContent === name,
  );
}

/** The bar's own button with this name. The test fails when there is none. */
function shownBarButton(screen: Screen, name: string): HTMLButtonElement {
  const button = barButton(screen, name);
  if (button === undefined) throw new Error(`The bar has no ${name} button.`);
  return button;
}

async function pressBarButton(screen: Screen, name: string) {
  await expect.poll(() => barButton(screen, name)).toBeDefined();
  await userEvent.click(shownBarButton(screen, name));
}

function deprecateDialog(screen: Screen, version = "1.0.0") {
  return screen.getByRole("dialog", { name: `Deprecate ${version}` });
}

function removeDialog(screen: Screen) {
  return screen.getByRole("dialog", { name: "Remove from search?" });
}

function reasonField(screen: Screen) {
  return deprecateDialog(screen).getByRole("textbox", { name: "Reason" });
}

function replacementField(screen: Screen, version = "1.0.0") {
  return deprecateDialog(screen, version).getByRole("combobox", {
    name: "Point people to",
  });
}

function deprecateSubmit(screen: Screen, version = "1.0.0") {
  return deprecateDialog(screen, version).getByRole("button", {
    name: `Deprecate ${version}`,
  });
}

function optionLabels(screen: Screen, version = "1.0.0") {
  const select = replacementField(
    screen,
    version,
  ).element() as HTMLSelectElement;
  return [...select.options].map((option) => option.textContent);
}

function deprecatedNotice(screen: Screen, version = "1.0.0") {
  return screen.getByRole("status").filter({
    hasText: `${version} is deprecated by the publisher`,
  });
}

function removedNotice(screen: Screen) {
  return screen.getByRole("status").filter({ hasText: removedText });
}

const robots = () =>
  [...document.head.querySelectorAll('meta[name="robots"]')].map((meta) =>
    meta.getAttribute("content"),
  );

/** The computed colour a token resolves to, read from a probe element. */
function tokenColour(token: string) {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

const ember = "rgb(238, 28, 58)";

describe("the publisher bar's buttons", () => {
  test("on a listed version that is not deprecated: Deprecate and a red Remove", async () => {
    const { screen } = await openOwnPage();

    expect(barButtons(screen)).toEqual([
      "Update",
      "Deprecate 1.0.0",
      "Create new version",
      "Remove",
    ]);
    await expect
      .element(bar(screen).getByText("Only you see these controls."))
      .toBeVisible();
    const remove = shownBarButton(screen, "Remove");
    expect(getComputedStyle(remove).color).toBe(tokenColour("--danger"));
    expect(getComputedStyle(remove).color).not.toBe(ember);
  });

  test("on a deprecated version: Undo deprecation instead of Deprecate", async () => {
    const { screen } = await openOwnPage({
      versions: ["1.1.0", "1.0.0"],
      deprecations: { "1.0.0": { reason: "Broken.", replacement: "1.1.0" } },
    });

    expect(barButtons(screen)).toEqual([
      "Update",
      "Undo deprecation",
      "Create new version",
      "Remove",
    ]);
  });

  test("on a removed activity: Return to search, and the bar says it's hidden", async () => {
    const { screen } = await openOwnPage({ removedBy: "publisher" });

    expect(barButtons(screen)).toEqual([
      "Update",
      "Deprecate 1.0.0",
      "Create new version",
      "Return to search",
    ]);
    await expect
      .element(bar(screen).getByText("It's hidden from search."))
      .toBeVisible();
    expect(
      bar(screen).getByText("Only you see these controls.").elements(),
    ).toHaveLength(0);
    const returnButton = shownBarButton(screen, "Return to search");
    expect(getComputedStyle(returnButton).color).not.toBe(
      tokenColour("--danger"),
    );
  });

  test("on a removed, deprecated version: Undo deprecation and Return to search", async () => {
    const { screen } = await openOwnPage({
      removedBy: "publisher",
      deprecations: { "1.0.0": { reason: "Broken.", replacement: null } },
    });

    expect(barButtons(screen)).toEqual([
      "Update",
      "Undo deprecation",
      "Create new version",
      "Return to search",
    ]);
  });
});

describe("the Deprecate dialog", () => {
  test("opens modally with its title, text and fields", async () => {
    const { screen } = await openOwnPage({
      versions: ["2.0.0", "1.1.0", "1.0.0"],
    });

    await pressBarButton(screen, "Deprecate 1.0.0");

    const dialog = deprecateDialog(screen);
    await expect.element(dialog).toBeVisible();
    expect((dialog.element() as HTMLDialogElement).matches(":modal")).toBe(
      true,
    );
    await expect
      .element(
        dialog.getByRole("heading", { level: 2, name: "Deprecate 1.0.0" }),
      )
      .toBeVisible();
    await expect.element(dialog).toHaveAccessibleDescription(deprecateIntro);
    await expect
      .element(reasonField(screen))
      .toHaveAttribute(
        "placeholder",
        "What's wrong with this version, in a sentence",
      );
  });

  test("starts on the latest other version, the latest marked, with Deprecate disabled", async () => {
    const { screen } = await openOwnPage({
      versions: ["2.0.0", "1.1.0", "1.0.0"],
    });

    await pressBarButton(screen, "Deprecate 1.0.0");

    expect(optionLabels(screen)).toEqual([
      "No replacement",
      "2.0.0 (latest)",
      "1.1.0",
    ]);
    await expect.element(replacementField(screen)).toHaveValue("2.0.0");
    await expect.element(deprecateSubmit(screen)).toBeDisabled();
  });

  test("starts on the newest other version when the latest is deprecated", async () => {
    const { screen } = await openOwnPage(
      { versions: ["2.0.0", "1.1.0", "1.0.0"] },
      "2.0.0",
    );

    await pressBarButton(screen, "Deprecate 2.0.0");

    expect(optionLabels(screen, "2.0.0")).toEqual([
      "No replacement",
      "1.1.0",
      "1.0.0",
    ]);
    await expect
      .element(replacementField(screen, "2.0.0"))
      .toHaveValue("1.1.0");
  });

  test("offers only No replacement when the activity has one version", async () => {
    const { screen } = await openOwnPage({ versions: ["1.0.0"] });

    await pressBarButton(screen, "Deprecate 1.0.0");

    expect(optionLabels(screen)).toEqual(["No replacement"]);
    await expect.element(replacementField(screen)).toHaveValue("");
  });

  test("enables Deprecate once a reason is typed, and not for spaces alone", async () => {
    const { screen } = await openOwnPage();
    await pressBarButton(screen, "Deprecate 1.0.0");

    await reasonField(screen).fill("   ");
    await expect.element(deprecateSubmit(screen)).toBeDisabled();

    await reasonField(screen).fill("Charges twice on retry.");
    await expect.element(deprecateSubmit(screen)).toBeEnabled();

    await reasonField(screen).fill("");
    await expect.element(deprecateSubmit(screen)).toBeDisabled();
  });

  test("says when the reason is too long, and sends nothing", async () => {
    const { screen, writes } = await openOwnPage();
    await pressBarButton(screen, "Deprecate 1.0.0");

    await reasonField(screen).fill("x".repeat(161));

    await expect
      .element(deprecateDialog(screen).getByText("Use at most 160 characters."))
      .toBeVisible();
    await deprecateSubmit(screen).click();
    await expect.element(deprecateDialog(screen)).toBeVisible();
    expect(writes).toEqual([]);
  });

  test("Cancel closes it without saving, and focus returns to Deprecate", async () => {
    const { screen, writes } = await openOwnPage();
    await pressBarButton(screen, "Deprecate 1.0.0");
    await reasonField(screen).fill("Charges twice on retry.");

    await deprecateDialog(screen)
      .getByRole("button", { name: "Cancel" })
      .click();

    await expect.element(deprecateDialog(screen)).not.toBeInTheDocument();
    expect(document.activeElement).toBe(barButton(screen, "Deprecate 1.0.0"));
    expect(writes).toEqual([]);
    expect(deprecatedNotice(screen).elements()).toHaveLength(0);
  });

  test("starts afresh after it was closed", async () => {
    const { screen } = await openOwnPage({ versions: ["1.1.0", "1.0.0"] });
    await pressBarButton(screen, "Deprecate 1.0.0");
    await reasonField(screen).fill("Charges twice on retry.");
    await replacementField(screen).selectOptions("");
    await userEvent.keyboard("{Escape}");
    await expect.element(deprecateDialog(screen)).not.toBeInTheDocument();

    await pressBarButton(screen, "Deprecate 1.0.0");

    await expect.element(reasonField(screen)).toHaveValue("");
    await expect.element(replacementField(screen)).toHaveValue("1.1.0");
  });
});

describe("deprecating a version", () => {
  test("saves the trimmed reason and replacement, then shows the notice with a link", async () => {
    const { screen, writes } = await openOwnPage({
      versions: ["1.1.0", "1.0.0"],
    });
    await pressBarButton(screen, "Deprecate 1.0.0");
    await reasonField(screen).fill("  Charges twice on retry.  ");

    await deprecateSubmit(screen).click();

    await expect.element(deprecateDialog(screen)).not.toBeInTheDocument();
    expect(writes).toEqual([
      {
        method: "PUT",
        path: "deprecation",
        body: { reason: "Charges twice on retry.", replacement: "1.1.0" },
      },
    ]);
    const notice = deprecatedNotice(screen);
    await expect.element(notice).toBeVisible();
    await expect
      .element(notice.getByText("Charges twice on retry.", { exact: true }))
      .toBeVisible();
    await expect
      .element(notice.getByRole("link", { name: "Use 1.1.0 instead" }))
      .toHaveAttribute("href", "/ddieruf/charge-card@1.1.0");
    expect(barButtons(screen)).toContain("Undo deprecation");
    expect(document.activeElement).toBe(barButton(screen, "Undo deprecation"));
  });

  test("with No replacement, the notice has no link", async () => {
    const { screen, writes } = await openOwnPage({
      versions: ["1.1.0", "1.0.0"],
    });
    await pressBarButton(screen, "Deprecate 1.0.0");
    await reasonField(screen).fill("Charges twice on retry.");
    await replacementField(screen).selectOptions("");

    await deprecateSubmit(screen).click();

    await expect.element(deprecatedNotice(screen)).toBeVisible();
    expect(writes[0]?.body).toEqual({
      reason: "Charges twice on retry.",
      replacement: null,
    });
    expect(deprecatedNotice(screen).getByRole("link").elements()).toHaveLength(
      0,
    );
  });

  test("a failed save keeps the dialog open with what was typed", async () => {
    const { screen, state } = await openOwnPage({
      versions: ["1.1.0", "1.0.0"],
    });
    refuse("put", "deprecation", 500);
    await pressBarButton(screen, "Deprecate 1.0.0");
    await reasonField(screen).fill("Charges twice on retry.");

    await deprecateSubmit(screen).click();

    await expect
      .element(deprecateDialog(screen).getByRole("alert"))
      .toHaveTextContent(failedText);
    await expect.element(deprecateDialog(screen)).toBeVisible();
    await expect
      .element(reasonField(screen))
      .toHaveValue("Charges twice on retry.");
    expect(deprecatedNotice(screen).elements()).toHaveLength(0);
    expect(state.deprecations).toEqual({});
  });

  test("a refused replacement shows the API's message under the field", async () => {
    const { screen } = await openOwnPage({ versions: ["1.1.0", "1.0.0"] });
    const message = "ddieruf/charge-card has no version 1.1.0.";
    worker.use(
      http.put(
        "/api/activities/:handle/:name/versions/:version/deprecation",
        () =>
          HttpResponse.json(
            {
              type: "about:blank",
              title: "Refused",
              status: 422,
              errors: [{ field: "replacement", message }],
            },
            {
              status: 422,
              headers: { "Content-Type": "application/problem+json" },
            },
          ),
      ),
    );
    await pressBarButton(screen, "Deprecate 1.0.0");
    await reasonField(screen).fill("Charges twice on retry.");

    await deprecateSubmit(screen).click();

    await expect
      .element(deprecateDialog(screen).getByText(message))
      .toBeVisible();
    await expect
      .element(replacementField(screen))
      .toHaveAttribute("aria-invalid", "true");
  });

  test("an ended sign-in keeps the dialog open with a link to sign in again", async () => {
    const { screen } = await openOwnPage();
    refuse("put", "deprecation", 401);
    await pressBarButton(screen, "Deprecate 1.0.0");
    await reasonField(screen).fill("Charges twice on retry.");

    await deprecateSubmit(screen).click();

    await expect
      .element(
        deprecateDialog(screen).getByRole("link", { name: "Sign in again" }),
      )
      .toBeVisible();
    await expect.element(deprecateDialog(screen)).toBeVisible();
  });
});

describe("undoing a deprecation", () => {
  test("acts at once with no confirmation, and the notice goes", async () => {
    const { screen, writes } = await openOwnPage({
      versions: ["1.1.0", "1.0.0"],
      deprecations: { "1.0.0": { reason: "Broken.", replacement: "1.1.0" } },
    });
    await expect.element(deprecatedNotice(screen)).toBeVisible();

    await pressBarButton(screen, "Undo deprecation");

    await expect.element(deprecatedNotice(screen)).not.toBeInTheDocument();
    expect(screen.getByRole("dialog").elements()).toHaveLength(0);
    expect(writes).toEqual([{ method: "DELETE", path: "deprecation" }]);
    expect(barButtons(screen)).toContain("Deprecate 1.0.0");
    expect(document.activeElement).toBe(barButton(screen, "Deprecate 1.0.0"));
  });

  test("a failure says so in the bar and leaves the notice", async () => {
    const { screen } = await openOwnPage({
      deprecations: { "1.0.0": { reason: "Broken.", replacement: null } },
    });
    refuse("delete", "deprecation", 500);

    await pressBarButton(screen, "Undo deprecation");

    await expect
      .element(bar(screen).getByRole("alert"))
      .toHaveTextContent(failedText);
    await expect.element(deprecatedNotice(screen)).toBeVisible();
    expect(barButtons(screen)).toContain("Undo deprecation");
  });
});

describe("the Remove dialog", () => {
  test("shows its title, text, what stays, and Cancel and a dark red Remove from search", async () => {
    const { screen } = await openOwnPage();

    await pressBarButton(screen, "Remove");

    const dialog = removeDialog(screen);
    await expect.element(dialog).toBeVisible();
    expect((dialog.element() as HTMLDialogElement).matches(":modal")).toBe(
      true,
    );
    await expect
      .element(dialog)
      .toHaveAccessibleDescription(
        "Removing ddieruf/charge-card takes every version out of search.",
      );
    const items = [...dialog.element().querySelectorAll("li")].map(
      (item) => item.textContent,
    );
    expect(items).toEqual([
      "Its page stays up, marked “Removed by the publisher.”",
      "Every version's address keeps working.",
      "Copies people already took are theirs and aren't affected.",
      "You can return it to search later.",
    ]);
    const buttons = [...dialog.element().querySelectorAll("form button")].map(
      (button) => button.textContent,
    );
    expect(buttons).toEqual(["Cancel", "Remove from search"]);
    const confirm = dialog
      .getByRole("button", { name: "Remove from search" })
      .element();
    expect(getComputedStyle(confirm).backgroundColor).toBe(
      tokenColour("--danger-strong"),
    );
    expect(getComputedStyle(confirm).backgroundColor).not.toBe(ember);
  });

  test("Cancel closes it without removing, and focus returns to Remove", async () => {
    const { screen, writes } = await openOwnPage();
    await pressBarButton(screen, "Remove");

    await removeDialog(screen).getByRole("button", { name: "Cancel" }).click();

    await expect.element(removeDialog(screen)).not.toBeInTheDocument();
    expect(document.activeElement).toBe(barButton(screen, "Remove"));
    expect(writes).toEqual([]);
    expect(removedNotice(screen).elements()).toHaveLength(0);
  });
});

describe("removing from search", () => {
  test("shows the removed notice, Return to search, and marks the page noindex", async () => {
    const { screen, writes } = await openOwnPage();
    expect(robots()).toEqual([]);
    await pressBarButton(screen, "Remove");

    await removeDialog(screen)
      .getByRole("button", { name: "Remove from search" })
      .click();

    await expect.element(removeDialog(screen)).not.toBeInTheDocument();
    expect(writes).toEqual([{ method: "PUT", path: "removal" }]);
    await expect.element(removedNotice(screen)).toBeVisible();
    expect(barButtons(screen)).toContain("Return to search");
    await expect
      .element(bar(screen).getByText("It's hidden from search."))
      .toBeVisible();
    expect(document.activeElement).toBe(barButton(screen, "Return to search"));
    await expect.poll(robots).toEqual(["noindex"]);
  });

  test("shows the removed notice on every other version's page too", async () => {
    const { screen, router } = await openOwnPage({
      versions: ["1.1.0", "1.0.0"],
    });
    await pressBarButton(screen, "Remove");
    await removeDialog(screen)
      .getByRole("button", { name: "Remove from search" })
      .click();
    await expect.element(removedNotice(screen)).toBeVisible();

    await router.navigate("/ddieruf/charge-card@1.1.0");

    await expect
      .element(screen.getByRole("button", { name: "Deprecate 1.1.0" }))
      .toBeVisible();
    await expect.element(removedNotice(screen)).toBeVisible();
    expect(barButtons(screen)).toContain("Return to search");
  });

  test("a failed removal keeps the dialog open and the page unchanged", async () => {
    const { screen } = await openOwnPage();
    refuse("put", "removal", 503);
    await pressBarButton(screen, "Remove");

    await removeDialog(screen)
      .getByRole("button", { name: "Remove from search" })
      .click();

    await expect
      .element(removeDialog(screen).getByRole("alert"))
      .toHaveTextContent(failedText);
    await expect.element(removeDialog(screen)).toBeVisible();
    expect(removedNotice(screen).elements()).toHaveLength(0);
    expect(robots()).toEqual([]);
  });
});

describe("returning to search", () => {
  test("acts at once with no confirmation, the notice goes and noindex is dropped", async () => {
    const { screen, writes } = await openOwnPage({ removedBy: "publisher" });
    await expect.element(removedNotice(screen)).toBeVisible();
    await expect.poll(robots).toEqual(["noindex"]);

    await pressBarButton(screen, "Return to search");

    await expect.element(removedNotice(screen)).not.toBeInTheDocument();
    expect(screen.getByRole("dialog").elements()).toHaveLength(0);
    expect(writes).toEqual([{ method: "DELETE", path: "removal" }]);
    expect(barButtons(screen)).toContain("Remove");
    await expect
      .element(bar(screen).getByText("Only you see these controls."))
      .toBeVisible();
    await expect.poll(robots).toEqual([]);
  });

  test("a failure says so in the bar and leaves the page removed", async () => {
    const { screen } = await openOwnPage({ removedBy: "publisher" });
    refuse("delete", "removal", 409);

    await pressBarButton(screen, "Return to search");

    await expect
      .element(bar(screen).getByRole("alert"))
      .toHaveTextContent(failedText);
    await expect.element(removedNotice(screen)).toBeVisible();
    expect(barButtons(screen)).toContain("Return to search");
    expect(robots()).toEqual(["noindex"]);
  });
});

describe("what everyone sees", () => {
  test("a deprecated version shows the notice, its reason and a link to the replacement", async () => {
    signInAs(null);
    const { screen } = await openPage({
      versions: ["1.1.0", "1.0.0"],
      deprecations: {
        "1.0.0": { reason: "Charges twice on retry.", replacement: "1.1.0" },
      },
    });

    const notice = deprecatedNotice(screen);
    await expect.element(notice).toBeVisible();
    await expect
      .element(notice.getByText("Charges twice on retry.", { exact: true }))
      .toBeVisible();
    await expect
      .element(notice.getByRole("link", { name: "Use 1.1.0 instead" }))
      .toHaveAttribute("href", "/ddieruf/charge-card@1.1.0");
  });

  test("Use {replacement} instead opens that version's page", async () => {
    signInAs(null);
    const { screen, router } = await openPage({
      versions: ["1.1.0", "1.0.0"],
      deprecations: { "1.0.0": { reason: "Broken.", replacement: "1.1.0" } },
    });

    await deprecatedNotice(screen)
      .getByRole("link", { name: "Use 1.1.0 instead" })
      .click();

    await expect
      .poll(() => router.state.location.pathname)
      .toBe("/ddieruf/charge-card@1.1.0");
    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Charge card" }))
      .toBeVisible();
    expect(deprecatedNotice(screen, "1.1.0").elements()).toHaveLength(0);
  });

  test("a deprecated version with no replacement has no link", async () => {
    signInAs(null);
    const { screen } = await openPage({
      deprecations: { "1.0.0": { reason: "Broken.", replacement: null } },
    });

    await expect.element(deprecatedNotice(screen)).toBeVisible();
    expect(deprecatedNotice(screen).getByRole("link").elements()).toHaveLength(
      0,
    );
  });

  test("only the deprecated version shows the deprecated notice", async () => {
    signInAs(null);
    const { screen } = await openPage(
      {
        versions: ["1.1.0", "1.0.0"],
        deprecations: { "1.0.0": { reason: "Broken.", replacement: "1.1.0" } },
      },
      "1.1.0",
    );

    await expect
      .element(screen.getByText("Charges a card with Stripe", { exact: false }))
      .toBeVisible();
    expect(
      screen.getByText(/is deprecated by the publisher/).elements(),
    ).toEqual([]);
  });

  test("the deprecated notice is dark red, never Ember", async () => {
    signInAs(null);
    const { screen } = await openPage({
      deprecations: { "1.0.0": { reason: "Broken.", replacement: null } },
    });

    const notice = deprecatedNotice(screen).element();
    expect(getComputedStyle(notice).borderTopColor).toBe(
      tokenColour("--danger"),
    );
    expect(getComputedStyle(notice).borderTopColor).not.toBe(ember);
  });

  // The API answers a removal made when the account was deleted as the publisher's own (D27).
  test.each(["1.1.0", "1.0.0"])(
    "a removed activity shows the removed notice on version %s, and is marked noindex",
    async (version) => {
      signInAs(null);
      const { screen } = await openPage(
        { removedBy: "publisher", versions: ["1.1.0", "1.0.0"] },
        version,
      );

      await expect.element(removedNotice(screen)).toBeVisible();
      await expect.poll(robots).toEqual(["noindex"]);
    },
  );

  test("a listed activity has no removed notice and is not marked noindex", async () => {
    signInAs(null);
    const { screen } = await openPage();

    await expect
      .element(screen.getByText("Charges a card with Stripe", { exact: false }))
      .toBeVisible();
    expect(screen.getByText(/Removed by the publisher/).elements()).toEqual([]);
    expect(robots()).toEqual([]);
  });

  test("an activity Durables removed is marked noindex", async () => {
    signInAs(null);
    await openPage({ removedBy: "durables" });

    await expect.poll(robots).toEqual(["noindex"]);
  });

  test.each([
    { who: "a signed-out visitor", user: null },
    { who: "another publisher", user: { ...owner, handle: "someone" } },
  ])("$who sees the notices but no publisher controls", async ({ user }) => {
    let read = false;
    worker.use(
      http.get("/api/session", () => {
        read = true;
        return HttpResponse.json({ user });
      }),
    );
    const { screen } = await openPage({
      removedBy: "publisher",
      versions: ["1.1.0", "1.0.0"],
      deprecations: { "1.0.0": { reason: "Broken.", replacement: "1.1.0" } },
    });
    await expect.poll(() => read).toBe(true);

    await expect.element(deprecatedNotice(screen)).toBeVisible();
    await expect.element(removedNotice(screen)).toBeVisible();
    expect(bar(screen).elements()).toHaveLength(0);
    for (const name of [
      /Deprecate/,
      /Undo deprecation/,
      /Create new version/,
      /^Remove$/,
      /Return to search/,
      /^Update$/,
    ]) {
      expect(screen.getByRole("button", { name }).elements()).toHaveLength(0);
    }
    expect(screen.getByRole("dialog").elements()).toHaveLength(0);
    expect(document.querySelectorAll("dialog")).toHaveLength(0);
  });
});
