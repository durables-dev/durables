import "@/styles/global.css";
import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import {
  refuseDescription,
  serveChargeCard,
  type TestListingState,
} from "./test-listing-server";

// The Versions section, the older-version notice, the per-version Update dialog, and the
// search-engine description taken from the viewed version.

const owner: SessionUser = {
  name: "Dana Dieruf",
  initials: "DD",
  provider: "github",
  handle: "ddieruf",
  accountExists: true,
};

const day = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * day).toISOString();

const descriptions = {
  "2.0.0": "Charges a payment method through Stripe.",
  "1.1.0": "Charges a card through Stripe, failing declined cards at once.",
  "1.0.0": "Charges a card through Stripe.",
};

/** ddieruf/charge-card with three versions, each with its own note, base and description. */
const threeVersions: Partial<TestListingState> = {
  versions: ["2.0.0", "1.1.0", "1.0.0"],
  details: {
    "2.0.0": {
      whatChanged:
        "The input type changed. payment_method replaces card_token.",
      basedOn: "1.1.0",
      description: descriptions["2.0.0"],
      publishedAt: ago(2),
    },
    "1.1.0": {
      whatChanged: "Declined cards now raise CardDeclined as non-retryable.",
      basedOn: "1.0.0",
      description: descriptions["1.1.0"],
      publishedAt: ago(21),
    },
    "1.0.0": {
      description: descriptions["1.0.0"],
      publishedAt: ago(60),
    },
  },
};

const olderText = (version: string) =>
  `You're viewing ${version}, an older version. It stays available at its own address, unchanged.`;
const caption =
  "Each version has its own page and never changes after publishing. A new version starts from an earlier one.";
const failedText = "That didn't save. Try again.";

function signInAs(user: SessionUser | null) {
  worker.use(http.get("/api/session", () => HttpResponse.json({ user })));
}

/** Opens a version's page with the given listing state, once the Versions list shows. */
async function openPage(state: Partial<TestListingState>, version: string) {
  const server = serveChargeCard(structuredClone(state));
  const router = createMemoryRouter(routes, {
    initialEntries: [`/ddieruf/charge-card@${version}`],
  });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  await expect.element(versionList(screen)).toBeVisible();
  return { screen, router, ...server };
}

type Screen = Awaited<ReturnType<typeof openPage>>["screen"];

async function openAsVisitor(
  state: Partial<TestListingState>,
  version: string,
) {
  signInAs(null);
  return openPage(state, version);
}

async function openAsOwner(state: Partial<TestListingState>, version: string) {
  signInAs(owner);
  const opened = await openPage(state, version);
  await expect.element(updateButton(opened.screen)).toBeVisible();
  return opened;
}

function versionList(screen: Screen) {
  return screen.getByRole("list", { name: "Versions", exact: true });
}

/** Each row's visible lines, top to bottom and left to right. */
function rowLines(screen: Screen): string[][] {
  return versionList(screen)
    .getByRole("listitem")
    .elements()
    .map((row) =>
      (row as HTMLElement).innerText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== ""),
    );
}

function row(screen: Screen, version: string) {
  return versionList(screen)
    .getByRole("listitem")
    .filter({ hasText: new RegExp(`^${version.replaceAll(".", "\\.")}`) });
}

function olderNotice(screen: Screen) {
  return screen.getByRole("status").filter({ hasText: "an older version" });
}

function deprecatedNotice(screen: Screen, version: string) {
  return screen
    .getByRole("status")
    .filter({ hasText: `${version} is deprecated by the publisher` });
}

function updateButton(screen: Screen) {
  return screen.getByRole("button", { name: "Update", exact: true });
}

function updateDialog(screen: Screen, version: string) {
  return screen.getByRole("dialog", { name: `Update ${version}` });
}

function metaDescription() {
  return document.head
    .querySelector('meta[name="description"]')
    ?.getAttribute("content");
}

async function openUpdate(screen: Screen, version: string) {
  await updateButton(screen).click();
  await expect.element(updateDialog(screen, version)).toBeVisible();
}

describe("the Versions section", () => {
  test("is a section-bar item and the last section of the main column", async () => {
    const { screen } = await openAsVisitor(threeVersions, "2.0.0");

    const link = screen
      .getByRole("navigation", { name: "Page sections" })
      .getByRole("link", { name: "Versions", exact: true });
    await expect.element(link).toHaveAttribute("href", "#versions");
    const section = document.getElementById("versions");
    expect(section?.tagName).toBe("SECTION");
    expect(section?.nextElementSibling).toBeNull();
    await expect
      .element(
        screen.getByRole("heading", {
          level: 2,
          name: "Versions",
          exact: true,
        }),
      )
      .toBeVisible();
    await expect
      .element(screen.getByText(caption, { exact: true }))
      .toBeVisible();
  });

  test("lists three versions newest first, with date, note, based-on and status", async () => {
    const { screen } = await openAsVisitor(threeVersions, "2.0.0");

    expect(rowLines(screen)).toEqual([
      [
        "2.0.0 · latest",
        "2 days ago",
        "The input type changed. payment_method replaces card_token.",
        "Based on 1.1.0",
        "Viewing",
      ],
      [
        "1.1.0",
        "3 weeks ago",
        "Declined cards now raise CardDeclined as non-retryable.",
        "Based on 1.0.0",
        "View 1.1.0",
      ],
      [
        "1.0.0",
        "2 months ago",
        "First release.",
        "First version",
        "View 1.0.0",
      ],
    ]);
  });

  test("shows the first version as First release. and First version", async () => {
    const { screen } = await openAsVisitor(threeVersions, "1.1.0");

    await expect
      .element(
        row(screen, "1.0.0").getByText("First release.", { exact: true }),
      )
      .toBeVisible();
    await expect
      .element(row(screen, "1.0.0").getByText("First version", { exact: true }))
      .toBeVisible();
  });

  test("tags deprecated versions with their replacement, or with no replacement", async () => {
    const { screen } = await openAsVisitor(
      {
        ...threeVersions,
        deprecations: {
          "1.1.0": { reason: "Breaks on refunds.", replacement: null },
          "1.0.0": { reason: "Retries charges.", replacement: "2.0.0" },
        },
      },
      "2.0.0",
    );

    await expect
      .element(
        row(screen, "1.1.0").getByText("Deprecated · no replacement", {
          exact: true,
        }),
      )
      .toBeVisible();
    await expect
      .element(
        row(screen, "1.0.0").getByText("Deprecated · use 2.0.0", {
          exact: true,
        }),
      )
      .toBeVisible();
    expect(
      row(screen, "2.0.0")
        .getByText(/Deprecated/)
        .elements(),
    ).toHaveLength(0);
  });

  test("shows Viewing on the viewed row and View links to the others' pages", async () => {
    const { screen } = await openAsVisitor(threeVersions, "1.1.0");

    await expect
      .element(row(screen, "1.1.0").getByText("Viewing", { exact: true }))
      .toBeVisible();
    await expect
      .element(row(screen, "1.1.0"))
      .toHaveAttribute("aria-current", "page");
    expect(row(screen, "1.1.0").getByRole("link").elements()).toHaveLength(0);
    await expect
      .element(versionList(screen).getByRole("link", { name: "View 2.0.0" }))
      .toHaveAttribute("href", "/ddieruf/charge-card@2.0.0");
    await expect
      .element(versionList(screen).getByRole("link", { name: "View 1.0.0" }))
      .toHaveAttribute("href", "/ddieruf/charge-card@1.0.0");
  });

  test("View opens that version's page, which then shows Viewing on its row", async () => {
    const { screen, router } = await openAsVisitor(threeVersions, "1.1.0");

    await versionList(screen).getByRole("link", { name: "View 1.0.0" }).click();

    await expect
      .poll(() => router.state.location.pathname)
      .toBe("/ddieruf/charge-card@1.0.0");
    await expect
      .element(row(screen, "1.0.0").getByText("Viewing", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByText(descriptions["1.0.0"], { exact: true }))
      .toBeVisible();
  });

  test("a single-version activity shows one row, Viewing, and no older-version notice", async () => {
    const { screen } = await openAsVisitor({ versions: ["1.0.0"] }, "1.0.0");

    expect(rowLines(screen)).toEqual([
      [
        "1.0.0 · latest",
        "just now",
        "First release.",
        "First version",
        "Viewing",
      ],
    ]);
    expect(versionList(screen).getByRole("link").elements()).toHaveLength(0);
    expect(olderNotice(screen).elements()).toHaveLength(0);
  });
});

describe("the older-version notice", () => {
  test("shows on a version older than the latest, with a link to the latest", async () => {
    const { screen } = await openAsVisitor(threeVersions, "1.1.0");

    await expect.element(olderNotice(screen)).toBeVisible();
    await expect
      .element(
        olderNotice(screen).getByText(olderText("1.1.0"), { exact: true }),
      )
      .toBeVisible();
    await expect
      .element(
        olderNotice(screen).getByRole("link", {
          name: "View the latest, 2.0.0",
        }),
      )
      .toHaveAttribute("href", "/ddieruf/charge-card@2.0.0");
  });

  test("its link opens the latest version, where the notice is gone", async () => {
    const { screen, router } = await openAsVisitor(threeVersions, "1.0.0");
    await expect.element(olderNotice(screen)).toBeVisible();

    await olderNotice(screen)
      .getByRole("link", { name: "View the latest, 2.0.0" })
      .click();

    await expect
      .poll(() => router.state.location.pathname)
      .toBe("/ddieruf/charge-card@2.0.0");
    await expect
      .element(row(screen, "2.0.0").getByText("Viewing", { exact: true }))
      .toBeVisible();
    expect(olderNotice(screen).elements()).toHaveLength(0);
  });

  test("does not show on the latest version", async () => {
    const { screen } = await openAsVisitor(threeVersions, "2.0.0");

    expect(olderNotice(screen).elements()).toHaveLength(0);
    expect(screen.getByText(/an older version/).elements()).toHaveLength(0);
  });

  test("does not show on a deprecated older version, which shows only the deprecated notice", async () => {
    const { screen } = await openAsVisitor(
      {
        ...threeVersions,
        deprecations: {
          "1.0.0": { reason: "Retries charges.", replacement: "2.0.0" },
        },
      },
      "1.0.0",
    );

    await expect.element(deprecatedNotice(screen, "1.0.0")).toBeVisible();
    expect(olderNotice(screen).elements()).toHaveLength(0);
    expect(screen.getByText(/an older version/).elements()).toHaveLength(0);
  });

  test("sits with the other notices, above the section bar", async () => {
    const { screen } = await openAsVisitor(threeVersions, "1.1.0");

    const notice = olderNotice(screen).element();
    const sections = screen
      .getByRole("navigation", { name: "Page sections" })
      .element();
    expect(notice.compareDocumentPosition(sections)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});

describe("the Update dialog on one version", () => {
  test("names the viewed version in its heading and note", async () => {
    const { screen } = await openAsOwner(threeVersions, "1.1.0");

    await openUpdate(screen, "1.1.0");

    const dialog = updateDialog(screen, "1.1.0");
    await expect
      .element(dialog.getByRole("heading", { level: 2, name: "Update 1.1.0" }))
      .toBeVisible();
    await expect
      .element(dialog)
      .toHaveAccessibleDescription(
        "This changes the description of 1.1.0 only. Anything about how the activity behaves needs a new version instead.",
      );
    await expect
      .element(dialog.getByLabelText("One-line description"))
      .toHaveValue(descriptions["1.1.0"]);
  });

  test("saving on 1.1.0 sends only 1.1.0 and changes only its description", async () => {
    const edited = "Charges a card through Stripe and returns the receipt.";
    const { screen, writes, state } = await openAsOwner(threeVersions, "1.1.0");
    await openUpdate(screen, "1.1.0");

    await updateDialog(screen, "1.1.0")
      .getByLabelText("One-line description")
      .fill(edited);
    await updateDialog(screen, "1.1.0")
      .getByRole("button", { name: "Save changes" })
      .click();

    await expect.element(updateDialog(screen, "1.1.0")).not.toBeInTheDocument();
    expect(writes).toEqual([
      {
        method: "PATCH",
        path: "description",
        body: { version: "1.1.0", description: edited },
      },
    ]);
    expect(
      Object.fromEntries(
        Object.entries(state.details).map(([version, details]) => [
          version,
          details.description,
        ]),
      ),
    ).toEqual({ ...descriptions, "1.1.0": edited });
    await expect
      .element(screen.getByText(edited, { exact: true }))
      .toBeVisible();

    await versionList(screen).getByRole("link", { name: "View 1.0.0" }).click();

    await expect
      .element(screen.getByText(descriptions["1.0.0"], { exact: true }))
      .toBeVisible();
    expect(screen.getByText(edited, { exact: true }).elements()).toHaveLength(
      0,
    );
  });

  test("a failed save keeps the dialog open with the failure message", async () => {
    const { screen } = await openAsOwner(threeVersions, "1.1.0");
    refuseDescription(500);
    await openUpdate(screen, "1.1.0");

    await updateDialog(screen, "1.1.0")
      .getByLabelText("One-line description")
      .fill("Charges a card.");
    await updateDialog(screen, "1.1.0")
      .getByRole("button", { name: "Save changes" })
      .click();

    await expect
      .element(updateDialog(screen, "1.1.0").getByRole("alert"))
      .toHaveTextContent(failedText);
    await expect.element(updateDialog(screen, "1.1.0")).toBeVisible();
    await expect
      .element(screen.getByText(descriptions["1.1.0"], { exact: true }))
      .toBeInTheDocument();
  });
});

describe("the search-engine description", () => {
  test("is the viewed version's description, and follows the version opened", async () => {
    const { screen } = await openAsVisitor(threeVersions, "1.1.0");

    await expect
      .poll(metaDescription)
      .toBe(
        `${descriptions["1.1.0"]} A Python Temporal activity by ddieruf on Durables.`,
      );

    await versionList(screen).getByRole("link", { name: "View 2.0.0" }).click();

    await expect
      .poll(metaDescription)
      .toBe(
        `${descriptions["2.0.0"]} A Python Temporal activity by ddieruf on Durables.`,
      );
  });
});
