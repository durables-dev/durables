import "@/styles/global.css";
import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import { serveChargeCard, type TestListingState } from "./test-listing-server";

// The publisher bar's Create new version dialog (DUR-117): choosing the version to start from,
// and Start from {version}, which opens Contribute in new-version mode.

const owner: SessionUser = {
  name: "Dana Dieruf",
  initials: "DD",
  provider: "github",
  handle: "ddieruf",
  accountExists: true,
};

/** ddieruf/charge-card with three versions, each with its own note and base. */
const threeVersions: Partial<TestListingState> = {
  versions: ["2.0.0", "1.1.0", "1.0.0"],
  details: {
    "2.0.0": {
      whatChanged:
        "The input type changed. payment_method replaces card_token.",
      basedOn: "1.1.0",
    },
    "1.1.0": {
      whatChanged: "Declined cards now raise CardDeclined as non-retryable.",
      basedOn: "1.0.0",
    },
  },
};

const intro =
  "Choose the version to start from. Its title and description are filled in for you. The code starts blank, and its behavior is detected again.";

async function openAsOwner(version: string) {
  worker.use(
    http.get("/api/session", () => HttpResponse.json({ user: owner })),
  );
  serveChargeCard(structuredClone(threeVersions));
  const router = createMemoryRouter(routes, {
    initialEntries: [`/ddieruf/charge-card@${version}`],
  });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  await expect.element(createButton(screen)).toBeVisible();
  return { screen, router };
}

type Screen = Awaited<ReturnType<typeof openAsOwner>>["screen"];

function createButton(screen: Screen) {
  return screen.getByRole("button", { name: "Create new version" });
}

function dialog(screen: Screen) {
  return screen.getByRole("dialog", { name: "Create a new version" });
}

async function openDialog(screen: Screen) {
  await createButton(screen).click();
  await expect.element(dialog(screen)).toBeVisible();
  return dialog(screen);
}

afterEach(() => {
  sessionStorage.clear();
});

describe("the Create a new version dialog", () => {
  test("says what starting from a version fills in", async () => {
    const { screen } = await openAsOwner("2.0.0");

    const opened = await openDialog(screen);

    await expect.element(opened).toHaveAccessibleDescription(intro);
  });

  // Criterion 1: the dialog lists every version and starts on the viewed one.
  test("lists every version newest first, with · latest and each note, and starts on the viewed one", async () => {
    const { screen } = await openAsOwner("1.1.0");

    const opened = await openDialog(screen);

    const radios = opened.getByRole("radio").all();
    expect(
      radios.map((radio) => radio.element().getAttribute("value")),
    ).toEqual(["2.0.0", "1.1.0", "1.0.0"]);
    await expect
      .element(opened.getByRole("radio", { name: /^2\.0\.0 · latest/ }))
      .toBeVisible();
    await expect
      .element(
        opened.getByRole("radio", {
          name: "1.1.0 Declined cards now raise CardDeclined as non-retryable.",
        }),
      )
      .toBeChecked();
    await expect
      .element(opened.getByRole("radio", { name: "1.0.0 First release." }))
      .not.toBeChecked();
  });

  test("says the new number must be higher than the latest", async () => {
    const { screen } = await openAsOwner("1.0.0");

    const opened = await openDialog(screen);

    await expect
      .element(
        opened.getByText(
          "The new version number must be higher than 2.0.0, the latest.",
        ),
      )
      .toBeVisible();
  });

  test("Start follows the version chosen", async () => {
    const { screen } = await openAsOwner("2.0.0");
    const opened = await openDialog(screen);
    await expect
      .element(opened.getByRole("button", { name: "Start from 2.0.0" }))
      .toBeVisible();

    await opened.getByRole("radio", { name: /^1\.0\.0/ }).click();

    await expect
      .element(opened.getByRole("button", { name: "Start from 1.0.0" }))
      .toBeVisible();
  });

  // Criterion 1: Start opens Contribute in new-version mode based on that version.
  test("Start opens Contribute in new-version mode, based on the version chosen", async () => {
    const { screen, router } = await openAsOwner("2.0.0");
    const opened = await openDialog(screen);
    await opened.getByRole("radio", { name: /^1\.1\.0/ }).click();

    await opened.getByRole("button", { name: "Start from 1.1.0" }).click();

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "New version" }))
      .toBeVisible();
    await expect.element(screen.getByText(/^Based on 1\.1\.0\./)).toBeVisible();
    await expect
      .element(screen.getByLabelText("Paste your file"))
      .toHaveValue("");
    expect(router.state.location.pathname).toBe("/contribute/code");
  });

  test("Cancel closes the dialog and returns focus to Create new version", async () => {
    const { screen, router } = await openAsOwner("2.0.0");
    const opened = await openDialog(screen);

    await opened.getByRole("button", { name: "Cancel" }).click();

    await expect.element(dialog(screen)).not.toBeInTheDocument();
    await expect.element(createButton(screen)).toHaveFocus();
    expect(router.state.location.pathname).toBe("/ddieruf/charge-card@2.0.0");
  });
});
