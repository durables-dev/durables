import "@/styles/global.css";
import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import { delay, http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import { python } from "./test-versions";

const versionPath = "/api/activities/:handle/:name/versions/:version";
const listingPath = "/api/activities/:handle/:name";
const problemHeaders = { "Content-Type": "application/problem+json" };

const saved = "Charges a card with Stripe and returns the charge ID.";
const edited = "Charges a card with Stripe and returns the charge and receipt.";

const failedMessage = "Your description wasn't saved. Try again.";
const signInEndedMessage = "Your sign-in has ended. Sign in again, then save.";

const owner: SessionUser = {
  name: "Dana Dieruf",
  initials: "DD",
  provider: "github",
  handle: "ddieruf",
  accountExists: true,
};

/** What the page sent to the API while a test ran. */
interface Traffic {
  /** The body of each save, in order. */
  saves: { path: string; body: unknown }[];
  /** How many times the listing was read. */
  listingReads: number;
}

interface PublishOptions {
  /** How the save is answered. The listing with the sent description, by default. */
  answerSave?: (description: string) => Promise<Response> | Response;
  /** The listing's description as the search results show it. */
  browseDescription?: () => string;
  /** Held until it settles before a browse call is answered. */
  beforeBrowse?: () => Promise<void> | undefined;
}

/** Answers the session, version, listing, save and browse calls for ddieruf/charge-card. */
function publishChargeCard({
  answerSave,
  browseDescription = () => saved,
  beforeBrowse,
}: PublishOptions = {}): Traffic {
  const traffic: Traffic = { saves: [], listingReads: 0 };
  worker.use(
    http.get("/api/session", () => HttpResponse.json({ user: owner })),
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
    http.get(listingPath, () => {
      traffic.listingReads += 1;
      return HttpResponse.json({
        handle: "ddieruf",
        name: "charge-card",
        description: saved,
      });
    }),
    http.patch(listingPath, async ({ request }) => {
      const body: unknown = await request.json();
      traffic.saves.push({ path: new URL(request.url).pathname, body });
      const description =
        typeof body === "object" && body !== null && "description" in body
          ? String(body.description)
          : "";
      if (answerSave !== undefined) return answerSave(description);
      return HttpResponse.json({
        handle: "ddieruf",
        name: "charge-card",
        description,
      });
    }),
    http.get("/api/activities", async () => {
      await beforeBrowse?.();
      return HttpResponse.json({
        activities: [
          {
            address: "ddieruf/charge-card@1.0.0",
            handle: "ddieruf",
            name: "charge-card",
            version: "1.0.0",
            title: "Charge card",
            sdk: "Python",
            description: browseDescription(),
            integrations: [],
            publishedAt: new Date().toISOString(),
          },
        ],
        count: 1,
        sort: "newest",
        nextCursor: null,
      });
    }),
  );
  return traffic;
}

/** A problem answer with the given status. */
function problem(status: number, extra: object = {}) {
  return HttpResponse.json(
    { type: "about:blank", title: "Refused", status, ...extra },
    { status, headers: problemHeaders },
  );
}

/** A gate a test opens when it wants a held call to be answered. */
function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open: () => open() };
}

// The real route tree, opened at the publisher's own listing, once its Update button shows.
async function openOwnListing(...paths: string[]) {
  const entries = paths.length === 0 ? ["/ddieruf/charge-card@1.0.0"] : paths;
  const router = createMemoryRouter(routes, {
    initialEntries: entries,
    initialIndex: entries.length - 1,
  });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  await expect
    .element(screen.getByRole("button", { name: "Update", exact: true }))
    .toBeVisible();
  return { router, screen };
}

type Opened = Awaited<ReturnType<typeof openOwnListing>>;

function dialog({ screen }: Opened) {
  return screen.getByRole("dialog", { name: "Update listing" });
}

function field(opened: Opened) {
  return dialog(opened).getByLabelText("One-line description");
}

function fieldElement(opened: Opened) {
  return field(opened).element() as HTMLInputElement;
}

function saveButton(opened: Opened) {
  return dialog(opened).getByRole("button", {
    name: /^(Save changes|Saving…)$/,
  });
}

function helpLine(left: number) {
  return `Shown on search results. ${left} characters left.`;
}

async function openDialog(opened: Opened) {
  await opened.screen
    .getByRole("button", { name: "Update", exact: true })
    .click();
  await expect.element(dialog(opened)).toBeVisible();
}

/** The description the page shows, under its title. */
function pageDescription({ screen }: Opened, text: string) {
  return screen.getByText(text, { exact: true });
}

describe("the description field", () => {
  test("starts with the saved description, with the characters left under it", async () => {
    publishChargeCard();
    const opened = await openOwnListing();

    await openDialog(opened);

    await expect.element(field(opened)).toHaveValue(saved);
    await expect.element(field(opened)).toHaveAttribute("type", "text");
    await expect
      .element(dialog(opened).getByText(helpLine(160 - saved.length)))
      .toBeVisible();
    await expect
      .element(field(opened))
      .toHaveAccessibleDescription(helpLine(160 - saved.length));
  });

  test("counts down as the publisher types", async () => {
    publishChargeCard();
    const opened = await openOwnListing();
    await openDialog(opened);

    await field(opened).fill("Charges a card.");

    await expect.element(dialog(opened).getByText(helpLine(145))).toBeVisible();
  });

  test("at exactly 160 characters shows 0 left, no message, and saves", async () => {
    const traffic = publishChargeCard();
    const opened = await openOwnListing();
    await openDialog(opened);
    const exact = "a".repeat(160);

    await field(opened).fill(exact);

    await expect.element(dialog(opened).getByText(helpLine(0))).toBeVisible();
    await expect.element(field(opened)).not.toBeInvalid();
    expect(
      dialog(opened).getByText("Use at most 160 characters.").elements(),
    ).toEqual([]);

    await saveButton(opened).click();

    await expect.element(dialog(opened)).not.toBeInTheDocument();
    expect(traffic.saves.map(({ body }) => body)).toEqual([
      { description: exact },
    ]);
  });

  test("typing past 160 is not cut off, says so at once, and nothing is saved", async () => {
    const traffic = publishChargeCard();
    const opened = await openOwnListing();
    await openDialog(opened);
    await field(opened).fill("a".repeat(160));

    await field(opened).click();
    await userEvent.keyboard("{End}b");

    expect(fieldElement(opened).value).toBe(`${"a".repeat(160)}b`);
    await expect
      .element(dialog(opened).getByText("Use at most 160 characters."))
      .toBeVisible();
    await expect.element(field(opened)).toBeInvalid();
    await expect.element(dialog(opened).getByText(helpLine(-1))).toBeVisible();

    await saveButton(opened).click();

    await expect
      .element(dialog(opened).getByText("Use at most 160 characters."))
      .toBeVisible();
    await expect.element(dialog(opened)).toBeVisible();
    expect(fieldElement(opened).value).toBe(`${"a".repeat(160)}b`);
    expect(traffic.saves).toEqual([]);
  });

  test("pasted text over 160 characters stays in the field, with the message", async () => {
    const traffic = publishChargeCard();
    const opened = await openOwnListing();
    await openDialog(opened);
    const long = `${"Charges a card with Stripe. ".repeat(8)}`.trim();
    expect(long.length).toBeGreaterThan(160);

    // Through the clipboard: the long text is copied out of the field, which is cleared,
    // and pasted back in.
    await field(opened).fill(long);
    await field(opened).click();
    await userEvent.keyboard("{ControlOrMeta>}a{/ControlOrMeta}");
    await userEvent.copy();
    await field(opened).clear();
    expect(fieldElement(opened).value).toBe("");
    await userEvent.paste();

    expect(fieldElement(opened).maxLength).toBe(-1);
    await expect.element(field(opened)).toHaveValue(long);
    await expect
      .element(dialog(opened).getByText("Use at most 160 characters."))
      .toBeVisible();

    await saveButton(opened).click();

    await expect.element(field(opened)).toHaveValue(long);
    expect(traffic.saves).toEqual([]);
  });

  test.each([
    { what: "empty", typed: "" },
    { what: "blank", typed: "   " },
  ])(
    "an $what description says Enter a description. on Save, and nothing is sent",
    async ({ typed }) => {
      const traffic = publishChargeCard();
      const opened = await openOwnListing();
      await openDialog(opened);

      await field(opened).fill(typed);
      expect(
        dialog(opened).getByText("Enter a description.").elements(),
      ).toEqual([]);
      await saveButton(opened).click();

      await expect
        .element(dialog(opened).getByText("Enter a description."))
        .toBeVisible();
      await expect.element(field(opened)).toBeInvalid();
      await expect.element(dialog(opened)).toBeVisible();
      expect(traffic.saves).toEqual([]);
    },
  );

  test("Enter a description. goes once a description is typed", async () => {
    publishChargeCard();
    const opened = await openOwnListing();
    await openDialog(opened);
    await field(opened).fill("");
    await saveButton(opened).click();
    await expect
      .element(dialog(opened).getByText("Enter a description."))
      .toBeVisible();

    await field(opened).fill(edited);

    await expect
      .element(dialog(opened).getByText("Enter a description."))
      .not.toBeInTheDocument();
  });
});

describe("saving the description", () => {
  test("sends the trimmed text to the listing's address", async () => {
    const traffic = publishChargeCard();
    const opened = await openOwnListing();
    await openDialog(opened);

    await field(opened).fill(`  ${edited}  `);
    await saveButton(opened).click();

    await expect.element(dialog(opened)).not.toBeInTheDocument();
    expect(traffic.saves).toEqual([
      {
        path: "/api/activities/ddieruf/charge-card",
        body: { description: edited },
      },
    ]);
  });

  test("closes the dialog, shows the new description and no Saved message, without reading the listing again", async () => {
    const traffic = publishChargeCard();
    const opened = await openOwnListing();
    await openDialog(opened);
    const reads = traffic.listingReads;

    await field(opened).fill(edited);
    await saveButton(opened).click();

    await expect.element(dialog(opened)).not.toBeInTheDocument();
    await expect.element(pageDescription(opened, edited)).toBeVisible();
    expect(opened.screen.getByText(saved).elements()).toEqual([]);
    expect(opened.screen.getByText(/saved/i).elements()).toEqual([]);
    await expect
      .element(
        opened.screen.getByRole("button", { name: "Update", exact: true }),
      )
      .toHaveFocus();
    expect(traffic.listingReads).toBe(reads);
  });

  test("the next opening starts from the new description", async () => {
    publishChargeCard();
    const opened = await openOwnListing();
    await openDialog(opened);
    await field(opened).fill(edited);
    await saveButton(opened).click();
    await expect.element(dialog(opened)).not.toBeInTheDocument();

    await openDialog(opened);

    await expect.element(field(opened)).toHaveValue(edited);
  });

  test("search in the same visit shows the new description, never the old one", async () => {
    let browseDescription = saved;
    const hold = gate();
    let holding = false;
    publishChargeCard({
      browseDescription: () => browseDescription,
      beforeBrowse: () => (holding ? hold.opened : undefined),
    });
    // Search was read first, so its results are cached with the old description.
    const opened = await openOwnListing(
      "/search",
      "/ddieruf/charge-card@1.0.0",
    );
    const searchHeading = opened.screen.getByRole("heading", {
      level: 1,
      name: "Search",
    });
    await opened.router.navigate(-1);
    await expect.element(searchHeading).toBeVisible();
    await expect
      .element(opened.screen.getByText(saved, { exact: true }))
      .toBeVisible();
    await opened.router.navigate(1);
    await openDialog(opened);

    await field(opened).fill(edited);
    browseDescription = edited;
    await saveButton(opened).click();
    await expect.element(dialog(opened)).not.toBeInTheDocument();

    holding = true;
    await opened.router.navigate(-1);
    await expect.element(searchHeading).toBeVisible();
    // The cached results are gone, so the page reads them again rather than showing them.
    await expect
      .element(
        opened.screen.getByRole("status").getByText("Loading activities…"),
      )
      .toBeVisible();
    expect(opened.screen.getByText(saved, { exact: true }).elements()).toEqual(
      [],
    );
    hold.open();

    await expect
      .element(opened.screen.getByText(edited, { exact: true }))
      .toBeVisible();
    expect(opened.screen.getByText(saved, { exact: true }).elements()).toEqual(
      [],
    );
  });

  test("while saving, the button is disabled and reads Saving…", async () => {
    const held = gate();
    publishChargeCard({
      answerSave: async (description) => {
        await held.opened;
        return HttpResponse.json({
          handle: "ddieruf",
          name: "charge-card",
          description,
        });
      },
    });
    const opened = await openOwnListing();
    await openDialog(opened);
    await field(opened).fill(edited);

    await saveButton(opened).click();

    await expect.element(saveButton(opened)).toHaveTextContent("Saving…");
    await expect.element(saveButton(opened)).toBeDisabled();

    held.open();

    await expect.element(dialog(opened)).not.toBeInTheDocument();
  });

  test("a double click on Save sends one request", async () => {
    const traffic = publishChargeCard({
      answerSave: async (description) => {
        await delay(200);
        return HttpResponse.json({
          handle: "ddieruf",
          name: "charge-card",
          description,
        });
      },
    });
    const opened = await openOwnListing();
    await openDialog(opened);
    await field(opened).fill(edited);

    await saveButton(opened).dblClick();

    await expect.element(dialog(opened)).not.toBeInTheDocument();
    await expect.element(pageDescription(opened, edited)).toBeVisible();
    await delay(300);
    expect(traffic.saves).toHaveLength(1);
  });
});

describe("a save that fails", () => {
  test.each([
    { what: "a server error", answer: () => problem(500) },
    { what: "a network failure", answer: () => HttpResponse.error() },
    { what: "a 403", answer: () => problem(403) },
    { what: "a 404", answer: () => problem(404) },
  ])(
    "on $what keeps the dialog open with the typed text and the try-again message",
    async ({ answer }) => {
      publishChargeCard({ answerSave: answer });
      const opened = await openOwnListing();
      await openDialog(opened);

      await field(opened).fill(edited);
      await saveButton(opened).click();

      await expect
        .element(dialog(opened).getByRole("alert"))
        .toHaveTextContent(failedMessage);
      await expect.element(dialog(opened)).toBeVisible();
      await expect.element(field(opened)).toHaveValue(edited);
      await expect
        .element(saveButton(opened))
        .toHaveTextContent("Save changes");
      await expect.element(saveButton(opened)).toBeEnabled();
      await expect.element(pageDescription(opened, saved)).toBeInTheDocument();
    },
  );

  test("on a 401 says the sign-in has ended, with a link to the contribute sign-in step", async () => {
    publishChargeCard({ answerSave: () => problem(401) });
    const opened = await openOwnListing();
    await openDialog(opened);

    await field(opened).fill(edited);
    await saveButton(opened).click();

    const alert = dialog(opened).getByRole("alert");
    await expect.element(alert).toHaveTextContent(signInEndedMessage);
    expect(dialog(opened).getByText(failedMessage).elements()).toEqual([]);
    await expect.element(field(opened)).toHaveValue(edited);
    const link = alert.getByRole("link", { name: "Sign in again" });
    await expect
      .element(link)
      .toHaveAttribute("href", "/contribute/profile?sign-in=again");

    await link.click();

    await expect
      .element(
        opened.screen.getByRole("heading", {
          level: 2,
          name: "Sign in to contribute",
        }),
      )
      .toBeVisible();
  });

  test("on a 400 shows the API's message under the field", async () => {
    publishChargeCard({
      answerSave: () =>
        problem(400, {
          errors: [{ field: "description", message: "Enter a description." }],
        }),
    });
    const opened = await openOwnListing();
    await openDialog(opened);

    await field(opened).fill(edited);
    await saveButton(opened).click();

    await expect
      .element(dialog(opened).getByText("Enter a description."))
      .toBeVisible();
    await expect.element(field(opened)).toHaveValue(edited);
    await expect.element(dialog(opened)).toBeVisible();
  });

  test("a retry that succeeds closes the dialog", async () => {
    let attempts = 0;
    const traffic = publishChargeCard({
      answerSave: (description) => {
        attempts += 1;
        return attempts === 1
          ? problem(500)
          : HttpResponse.json({
              handle: "ddieruf",
              name: "charge-card",
              description,
            });
      },
    });
    const opened = await openOwnListing();
    await openDialog(opened);
    await field(opened).fill(edited);
    await saveButton(opened).click();
    await expect
      .element(dialog(opened).getByRole("alert"))
      .toHaveTextContent(failedMessage);

    await saveButton(opened).click();

    await expect.element(dialog(opened)).not.toBeInTheDocument();
    await expect.element(pageDescription(opened, edited)).toBeVisible();
    expect(traffic.saves).toHaveLength(2);
  });
});

describe("closing without saving", () => {
  test.each([
    {
      how: "Cancel",
      close: (opened: Opened) =>
        dialog(opened).getByRole("button", { name: "Cancel" }).click(),
    },
    {
      how: "Escape",
      close: () => userEvent.keyboard("{Escape}"),
    },
  ])(
    "after $how, the next opening shows the saved description, not the abandoned edit",
    async ({ close }) => {
      const traffic = publishChargeCard();
      const opened = await openOwnListing();
      await openDialog(opened);
      await field(opened).fill("a".repeat(170));
      await expect
        .element(dialog(opened).getByText("Use at most 160 characters."))
        .toBeVisible();

      await close(opened);
      await expect.element(dialog(opened)).not.toBeInTheDocument();
      await openDialog(opened);

      await expect.element(field(opened)).toHaveValue(saved);
      await expect
        .element(dialog(opened).getByText(helpLine(160 - saved.length)))
        .toBeVisible();
      expect(
        dialog(opened).getByText("Use at most 160 characters.").elements(),
      ).toEqual([]);
      expect(traffic.saves).toEqual([]);
    },
  );

  test("after a failed save, the next opening has no failure message", async () => {
    publishChargeCard({ answerSave: () => problem(500) });
    const opened = await openOwnListing();
    await openDialog(opened);
    await field(opened).fill(edited);
    await saveButton(opened).click();
    await expect
      .element(dialog(opened).getByRole("alert"))
      .toHaveTextContent(failedMessage);

    await userEvent.keyboard("{Escape}");
    await openDialog(opened);

    await expect.element(field(opened)).toHaveValue(saved);
    expect(dialog(opened).getByRole("alert").elements()).toEqual([]);
  });
});
