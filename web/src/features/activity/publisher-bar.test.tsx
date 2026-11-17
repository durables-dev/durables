import "@/styles/global.css";
import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, onTestFinished, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import { chargeCardListing, python } from "./test-versions";

const versionPath = "/api/activities/:handle/:name/versions/:version";
const listingPath = "/api/activities/:handle/:name";

const description = "Charges a card with Stripe and returns the charge ID.";

const barText = "You published this activity. Only you see these controls.";
const intro =
  "This changes on every version's page right away. Anything about how the activity behaves needs a new version instead.";
const fixedNote =
  "Can't change here: the code, its detected facts and its address. Those are fixed when a version is published.";

const owner: SessionUser = {
  name: "Dana Dieruf",
  initials: "DD",
  provider: "github",
  handle: "ddieruf",
  accountExists: true,
};

/** Answers the version and listing reads for ddieruf/charge-card, at any version. */
function publishChargeCard() {
  worker.use(
    http.get(versionPath, ({ params }) =>
      HttpResponse.json({
        address: `ddieruf/charge-card@${String(params["version"])}`,
        handle: "ddieruf",
        name: "charge-card",
        version: params["version"],
        title: "Charge card",
        sdk: "Python",
        facts: {
          activity: { name: "charge_card", line: 26 },
          input: "ChargeRequest",
          output: "ChargeResult",
          runsAs: "sync",
          nonRetryableErrors: [],
          configurationRead: [{ name: "STRIPE_API_KEY", line: 8 }],
          dependencies: [{ name: "stripe", line: 4 }],
          heartbeats: [],
        },
        code: python.code,
        activityFileName: "activities.py",
        snippets: python.snippets,
        integrations: [],
        publishedAt: new Date().toISOString(),
      }),
    ),
    http.get(listingPath, () =>
      HttpResponse.json(chargeCardListing(description, ["1.0.0", "0.9.0"])),
    ),
  );
}

function signInAs(user: SessionUser) {
  worker.use(http.get("/api/session", () => HttpResponse.json({ user })));
}

// The real route tree, opened at a listing's address, once the title shows.
async function openListing(path = "/ddieruf/charge-card@1.0.0") {
  publishChargeCard();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Charge card" }))
    .toBeVisible();
  return screen;
}

type Screen = Awaited<ReturnType<typeof openListing>>;

function bar(screen: Screen) {
  return screen.getByRole("region", {
    name: "Your listing controls",
    exact: true,
  });
}

function updateButton(screen: Screen) {
  return screen.getByRole("button", { name: "Update", exact: true });
}

function dialog(screen: Screen) {
  return screen.getByRole("dialog", { name: "Update listing" });
}

async function openOwnListing(path?: string) {
  signInAs(owner);
  const screen = await openListing(path);
  await expect.element(updateButton(screen)).toBeVisible();
  return screen;
}

async function openDialog(screen: Screen) {
  await updateButton(screen).click();
  await expect.element(dialog(screen)).toBeVisible();
}

/** Asserts no bar and no Update button, once the session read has answered. */
async function expectNoBar(screen: Screen) {
  await expect.element(bar(screen)).not.toBeInTheDocument();
  expect(updateButton(screen).elements()).toHaveLength(0);
  expect(screen.getByText("You published this activity.").elements()).toEqual(
    [],
  );
}

describe("the publisher bar", () => {
  test("shows to the publisher, with the bar text and one Update button", async () => {
    const screen = await openOwnListing();

    await expect.element(bar(screen)).toBeVisible();
    await expect
      .element(bar(screen).getByText(barText, { exact: true }))
      .toBeVisible();
    // Update is the bar's one button. The rest are inside the closed dialog.
    const barButtons = [...bar(screen).element().querySelectorAll("button")]
      .filter((button) => button.closest("dialog") === null)
      .map((button) => button.textContent);
    expect(barButtons).toEqual(["Update"]);
    for (const name of [/Deprecate/, /Create new version/, /Remove/]) {
      expect(screen.getByRole("button", { name }).elements()).toHaveLength(0);
    }
  });

  test("sits under the top of the page and above the section bar", async () => {
    const screen = await openOwnListing();

    const top = screen
      .getByRole("heading", { level: 1 })
      .element()
      .closest("header");
    const sections = screen
      .getByRole("navigation", { name: "Page sections" })
      .element();
    const shown = bar(screen).element();
    expect(top?.compareDocumentPosition(shown)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(shown.compareDocumentPosition(sections)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  test("shows on another version's page of the publisher's listing", async () => {
    const screen = await openOwnListing("/ddieruf/charge-card@0.9.0");

    await expect.element(bar(screen)).toBeVisible();
    await expect.element(updateButton(screen)).toBeVisible();
  });

  test("does not show to a signed-out visitor", async () => {
    let read = false;
    worker.use(
      http.get("/api/session", () => {
        read = true;
        return HttpResponse.json({ user: null });
      }),
    );

    const screen = await openListing();
    await expect.poll(() => read).toBe(true);

    await expectNoBar(screen);
  });

  test("does not show to a signed-in visitor with no account yet", async () => {
    signInAs({ ...owner, accountExists: false });

    const screen = await openListing();

    await expectNoBar(screen);
  });

  test("does not show to a signed-in account with a different handle", async () => {
    signInAs({ ...owner, handle: "someone" });

    const screen = await openListing();

    await expectNoBar(screen);
  });

  test("does not show while the session is still being read", async () => {
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    worker.use(
      http.get("/api/session", async () => {
        await answered;
        return HttpResponse.json({ user: owner });
      }),
    );

    const screen = await openListing();

    await expect.element(screen.getByText(description)).toBeVisible();
    await expectNoBar(screen);

    answer();

    await expect.element(bar(screen)).toBeVisible();
  });
});

describe("the Update dialog", () => {
  test("is closed until Update is clicked, then opens modally", async () => {
    const screen = await openOwnListing();
    await expect.element(dialog(screen)).not.toBeInTheDocument();

    await openDialog(screen);

    const element = dialog(screen).element() as HTMLDialogElement;
    expect(element.tagName).toBe("DIALOG");
    expect(element.matches(":modal")).toBe(true);
  });

  test("shows the heading, intro and the note on what can't be changed", async () => {
    const screen = await openOwnListing();

    await openDialog(screen);

    await expect
      .element(
        dialog(screen).getByRole("heading", {
          level: 2,
          name: "Update listing",
        }),
      )
      .toBeVisible();
    await expect
      .element(dialog(screen).getByText(intro, { exact: true }))
      .toBeVisible();
    await expect
      .element(dialog(screen).getByText(fixedNote, { exact: true }))
      .toBeVisible();
    await expect.element(dialog(screen)).toHaveAccessibleDescription(intro);
  });

  test("has no link, and no When to use it, Category or Icon fields", async () => {
    const screen = await openOwnListing();

    await openDialog(screen);

    expect(dialog(screen).getByRole("link").elements()).toHaveLength(0);
    expect(dialog(screen).element().querySelector("a")).toBeNull();
    for (const name of [/When to use it/i, /Category/i, /Icon/i]) {
      expect(dialog(screen).getByLabelText(name).elements()).toHaveLength(0);
      expect(dialog(screen).getByText(name).elements()).toHaveLength(0);
    }
    expect(dialog(screen).getByRole("combobox").elements()).toHaveLength(0);
    expect(dialog(screen).element().querySelector("textarea, select")).toBe(
      null,
    );
  });

  test.each([
    {
      how: "Cancel",
      close: (screen: Screen) =>
        dialog(screen).getByRole("button", { name: "Cancel" }).click(),
    },
    {
      how: "the close button",
      close: (screen: Screen) =>
        dialog(screen).getByRole("button", { name: "Close" }).click(),
    },
    {
      how: "Escape",
      close: () => userEvent.keyboard("{Escape}"),
    },
  ])(
    "$how closes it, the description is unchanged and focus returns to Update",
    async ({ close }) => {
      const writes: string[] = [];
      const record = ({ request }: { request: Request }) => {
        if (request.method !== "GET") writes.push(request.url);
      };
      worker.events.on("request:start", record);
      onTestFinished(() => {
        worker.events.removeListener("request:start", record);
      });
      const screen = await openOwnListing();
      await openDialog(screen);

      await close(screen);

      await expect.element(dialog(screen)).not.toBeInTheDocument();
      await expect.element(updateButton(screen)).toHaveFocus();
      await expect
        .element(screen.getByText(description, { exact: true }))
        .toBeVisible();
      expect(writes).toEqual([]);
    },
  );

  test("opens again after it was closed", async () => {
    const screen = await openOwnListing();
    await openDialog(screen);
    await userEvent.keyboard("{Escape}");
    await expect.element(dialog(screen)).not.toBeInTheDocument();

    await openDialog(screen);

    await expect
      .element(dialog(screen).getByText(fixedNote, { exact: true }))
      .toBeVisible();
  });
});
