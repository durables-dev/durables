import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import "@/styles/global.css";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import type { OwnedActivity, OwnerProfile } from "./profile-queries";

// The real route tree, with a stand-in for the Contribute flow so a redirect there can be
// seen without loading the flow.
async function openProfile() {
  const [frame] = routes;
  if (!frame || frame.index) throw new Error("Expected the frame layout route");
  const router = createMemoryRouter(
    [
      {
        ...frame,
        children: [
          { path: "/contribute", element: <h1>Contribute flow</h1> },
          ...(frame.children ?? []),
        ],
      },
    ],
    { initialEntries: ["/profile"] },
  );
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  return { screen, router };
}

type Screen = Awaited<ReturnType<typeof openProfile>>["screen"];

const day = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) =>
  new Date(Date.now() - days * day).toISOString();

const sessionUser: SessionUser = {
  name: "David Dieruf",
  initials: "DD",
  provider: "github",
  handle: "ddieruf",
  accountExists: true,
};

const owner: OwnerProfile = {
  accountExists: true,
  handle: "ddieruf",
  provider: "github",
  joinedAt: daysAgo(60),
  listedCount: 2,
  providerDetails: {
    name: "David Dieruf",
    email: "david@example.com",
    username: "ddieruf",
    avatarUrl: "https://avatars.example.test/u/48213907",
    providerAccountId: "48213907",
  },
};

function owned(
  name: string,
  title: string,
  overrides: Partial<OwnedActivity> = {},
): OwnedActivity {
  const version = overrides.version ?? "1.0.0";
  return {
    handle: "ddieruf",
    name,
    version,
    address: `ddieruf/${name}@${version}`,
    title,
    sdk: "Python",
    versionCount: 1,
    latestPublishedAt: daysAgo(2),
    status: "listed",
    ...overrides,
  };
}

const chargeCard = owned("charge-card", "Charge card", {
  version: "2.0.0",
  versionCount: 3,
  latestPublishedAt: daysAgo(2),
});
const slackPost = owned("slack-post-message", "Post Slack message", {
  version: "1.1.0",
  sdk: ".NET",
  versionCount: 2,
  latestPublishedAt: daysAgo(5),
});
const sendInvoice = owned("send-invoice-email", "Send invoice email", {
  version: "1.2.0",
  versionCount: 3,
  latestPublishedAt: daysAgo(30),
  status: "removed",
});

/** Serves a signed-in owner: the session, the profile and the activities, in the order given. */
function serveOwner({
  profile = owner,
  activities = [sendInvoice, chargeCard, slackPost],
}: { profile?: OwnerProfile; activities?: OwnedActivity[] } = {}) {
  worker.use(
    http.get("/api/session", () =>
      HttpResponse.json({
        user: { ...sessionUser, provider: profile.provider },
      }),
    ),
    http.get("/api/profile", () => HttpResponse.json(profile)),
    http.get("/api/profile/activities", () =>
      HttpResponse.json({ activities }),
    ),
  );
}

function serverError() {
  return HttpResponse.json(
    { type: "about:blank", title: "Internal Server Error", status: 500 },
    { status: 500, headers: { "Content-Type": "application/problem+json" } },
  );
}

function unauthorized() {
  return HttpResponse.json(
    { type: "about:blank", title: "Unauthorized", status: 401 },
    { status: 401, headers: { "Content-Type": "application/problem+json" } },
  );
}

function heading(screen: Screen) {
  return screen.getByRole("heading", { level: 1, name: "ddieruf" });
}

function card(screen: Screen, name: string) {
  return screen.getByRole("region", { name });
}

/** The From {provider} card's rows, as label and value. */
function providerRowsOf(screen: Screen, provider: string) {
  const rows = card(screen, `From ${provider}`)
    .element()
    .querySelectorAll("dl > div");
  return [...rows].map((row) => [
    row.querySelector("dt")?.textContent,
    row.querySelector("dd")?.textContent,
  ]);
}

function activityList(screen: Screen) {
  return screen.getByRole("list", { name: "Your activities" });
}

/** The titles in Your activities, top to bottom. */
function listedTitles(screen: Screen) {
  return activityList(screen)
    .getByRole("listitem")
    .elements()
    .map((item) => item.querySelector("a")?.textContent);
}

function filter(screen: Screen, name: string) {
  return screen
    .getByRole("group", { name: "Show" })
    .getByRole("button", { name, exact: true });
}

/** The colour a CSS colour expression computes to on this page. */
function computedColour(value: string) {
  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

describe("who can open it", () => {
  test("a signed-out visitor goes to the Sign in page, which returns to the profile", async () => {
    const { screen, router } = await openProfile();

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Sign in" }))
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/sign-in");
    expect(router.state.location.search).toBe("?returnTo=%2Fprofile");
    const starts = screen
      .getByRole("list", { name: "Sign-in providers" })
      .getByRole("link")
      .elements()
      .map((link) => new URL((link as HTMLAnchorElement).href).search);
    expect(starts).toEqual(Array(4).fill("?returnTo=%2Fprofile"));
  });

  test("a signed-in person with no account goes to Contribute", async () => {
    worker.use(
      http.get("/api/session", () =>
        HttpResponse.json({
          user: { ...sessionUser, handle: null, accountExists: false },
        }),
      ),
      http.get("/api/profile", () =>
        HttpResponse.json({ accountExists: false, handle: null }),
      ),
      http.get("/api/profile/activities", () =>
        HttpResponse.json({ activities: [] }),
      ),
    );
    const { screen, router } = await openProfile();

    await expect
      .element(screen.getByRole("heading", { name: "Contribute flow" }))
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute");
  });
});

describe("the owner's details", () => {
  test("the top shows the initials, the handle, the provider, the joined date and Contribute an activity", async () => {
    serveOwner();
    const { screen } = await openProfile();

    await expect.element(heading(screen)).toBeVisible();
    await expect
      .element(screen.getByRole("main").getByText("DD", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByText("Signed in with GitHub", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByText("Joined 2 months ago", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Contribute an activity" }))
      .toHaveAttribute("href", "/contribute");
    await expect.poll(() => document.title).toBe("ddieruf · Durables");
    expect(document.body.textContent).not.toMatch(/organization/i);
  });

  test("the Handle card shows the handle and why it can't change", async () => {
    serveOwner();
    const { screen } = await openProfile();

    const handle = card(screen, "Handle");
    await expect.element(handle).toBeVisible();
    await expect
      .element(handle.getByText("ddieruf", { exact: true }))
      .toBeVisible();
    await expect
      .element(handle)
      .toHaveTextContent(
        "Every address you publish starts with it, like ddieruf/charge-card@2.0.0. Handles can't be changed, because published addresses never change.",
      );
  });

  test("the From GitHub card lists Name, Email, GitHub username, Avatar and Account ID, and what Durables stores", async () => {
    serveOwner();
    const { screen } = await openProfile();

    const provider = card(screen, "From GitHub");
    await expect.element(provider).toBeVisible();
    await expect
      .element(provider.getByText("Refreshed each time you sign in."))
      .toBeVisible();
    expect(providerRowsOf(screen, "GitHub")).toEqual([
      ["Name", "David Dieruf"],
      ["Email", "david@example.com"],
      ["GitHub username", "ddieruf"],
      ["Avatar", "Your GitHub profile picture"],
      ["Account ID", "48213907"],
    ]);
    await expect
      .element(
        provider.getByText(
          "Durables stores only your provider and its account ID. Your name, email and avatar stay in your sign-in session. No password.",
        ),
      )
      .toBeVisible();
  });

  test.each([
    ["google", "Google"],
    ["microsoft", "Microsoft"],
  ] as const)(
    "signed in with %s, the card has no username row",
    async (provider, name) => {
      serveOwner({
        profile: {
          ...owner,
          provider,
          providerDetails: { ...owner.providerDetails, username: null },
        },
      });
      const { screen } = await openProfile();

      await expect.element(card(screen, `From ${name}`)).toBeVisible();
      await expect
        .element(screen.getByText(`Signed in with ${name}`))
        .toBeVisible();
      expect(providerRowsOf(screen, name)).toEqual([
        ["Name", "David Dieruf"],
        ["Email", "david@example.com"],
        ["Avatar", `Your ${name} profile picture`],
        ["Account ID", "48213907"],
      ]);
      expect(document.body.textContent).not.toMatch(/username/i);
    },
  );

  test("the avatar is text only: no image, and no request to the provider", async () => {
    serveOwner();
    const { screen } = await openProfile();

    await expect.element(card(screen, "From GitHub")).toBeVisible();
    expect(document.querySelector("main img, img[src*='avatars']")).toBeNull();
    expect(document.body.innerHTML).not.toContain("avatars.example.test");
  });

  test("a detail the provider did not give still has its row", async () => {
    serveOwner({
      profile: {
        ...owner,
        providerDetails: {
          ...owner.providerDetails,
          email: null,
          username: null,
          avatarUrl: null,
        },
      },
    });
    const { screen } = await openProfile();

    await expect.element(card(screen, "From GitHub")).toBeVisible();
    expect(providerRowsOf(screen, "GitHub")).toEqual([
      ["Name", "David Dieruf"],
      ["Email", "Not provided"],
      ["GitHub username", "Not provided"],
      ["Avatar", "Not provided"],
      ["Account ID", "48213907"],
    ]);
  });

  test("there is no Sign-in accounts section and no Organizations section", async () => {
    serveOwner();
    const { screen } = await openProfile();

    await expect.element(heading(screen)).toBeVisible();
    const sections = screen
      .getByRole("heading", { level: 2 })
      .elements()
      .map((element) => element.textContent);
    expect(sections).toEqual(["Handle", "From GitHub", "Your activities"]);
    expect(document.body.textContent).not.toMatch(/backup|organizations/i);
  });
});

describe("Your activities", () => {
  test("each row shows its title linking to the latest version, SDK, address, versions and status", async () => {
    serveOwner();
    const { screen } = await openProfile();

    const list = activityList(screen);
    await expect.element(list).toBeVisible();
    const rows = list.getByRole("listitem");
    const charge = rows.filter({ hasText: "Charge card" });
    await expect
      .element(charge.getByRole("link", { name: "Charge card" }))
      .toHaveAttribute("href", "/ddieruf/charge-card@2.0.0");
    await expect.element(charge).toHaveTextContent("Python");
    await expect.element(charge).toHaveTextContent("ddieruf/charge-card@2.0.0");
    await expect
      .element(charge)
      .toHaveTextContent("3 versions · latest published 2 days ago");
    await expect
      .element(charge.getByText("Listed", { exact: true }))
      .toBeVisible();

    const slack = rows.filter({ hasText: "Post Slack message" });
    await expect.element(slack).toHaveTextContent(".NET");
    await expect
      .element(slack)
      .toHaveTextContent("2 versions · latest published 5 days ago");

    const invoice = rows.filter({ hasText: "Send invoice email" });
    await expect
      .element(invoice.getByRole("link", { name: "Send invoice email" }))
      .toHaveAttribute("href", "/ddieruf/send-invoice-email@1.2.0");
    await expect
      .element(invoice.getByText("Removed from search", { exact: true }))
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Open an activity to update it, create a new version, or remove it from search.",
        ),
      )
      .toBeVisible();
  });

  test("one version reads in the singular", async () => {
    serveOwner({ activities: [owned("refund-charge", "Refund charge")] });
    const { screen } = await openProfile();

    await expect
      .element(activityList(screen))
      .toHaveTextContent("1 version · latest published 2 days ago");
  });

  test("the list is newest published first", async () => {
    serveOwner();
    const { screen } = await openProfile();

    await expect.element(activityList(screen)).toBeVisible();
    expect(listedTitles(screen)).toEqual([
      "Charge card",
      "Post Slack message",
      "Send invoice email",
    ]);
  });

  test("the filter shows All, Listed and Removed with their counts, All selected first", async () => {
    serveOwner();
    const { screen } = await openProfile();

    await expect.element(filter(screen, "All (3)")).toBeVisible();
    const segments = screen
      .getByRole("group", { name: "Show" })
      .getByRole("button")
      .elements()
      .map((button) => [
        button.textContent,
        button.getAttribute("aria-pressed"),
      ]);
    expect(segments).toEqual([
      ["All (3)", "true"],
      ["Listed (2)", "false"],
      ["Removed (1)", "false"],
    ]);
  });

  test("Removed shows only the removed activities", async () => {
    serveOwner();
    const { screen } = await openProfile();

    await filter(screen, "Removed (1)").click();
    await expect
      .element(filter(screen, "Removed (1)"))
      .toHaveAttribute("aria-pressed", "true");
    expect(listedTitles(screen)).toEqual(["Send invoice email"]);
  });

  test("Listed shows only the listed activities, and All brings every one back", async () => {
    serveOwner();
    const { screen } = await openProfile();

    await filter(screen, "Listed (2)").click();
    await expect
      .element(filter(screen, "Listed (2)"))
      .toHaveAttribute("aria-pressed", "true");
    expect(listedTitles(screen)).toEqual(["Charge card", "Post Slack message"]);

    await filter(screen, "All (3)").click();
    await expect
      .element(filter(screen, "All (3)"))
      .toHaveAttribute("aria-pressed", "true");
    expect(listedTitles(screen)).toHaveLength(3);
  });

  test('Removed with nothing removed says "Nothing removed from search."', async () => {
    serveOwner({ activities: [chargeCard] });
    const { screen } = await openProfile();

    await filter(screen, "Removed (0)").click();
    await expect
      .element(
        screen.getByText("Nothing removed from search.", { exact: true }),
      )
      .toBeVisible();
    await expect.element(activityList(screen)).not.toBeInTheDocument();
  });

  test('Listed with nothing listed says "Nothing listed."', async () => {
    serveOwner({ activities: [sendInvoice] });
    const { screen } = await openProfile();

    await filter(screen, "Listed (0)").click();
    await expect
      .element(screen.getByText("Nothing listed.", { exact: true }))
      .toBeVisible();
    await expect.element(activityList(screen)).not.toBeInTheDocument();
  });

  test("an owner with no activities sees an empty All view with a line saying so", async () => {
    serveOwner({ activities: [] });
    const { screen } = await openProfile();

    await expect
      .element(screen.getByText("You haven't published an activity yet."))
      .toBeVisible();
    await expect
      .element(filter(screen, "All (0)"))
      .toHaveAttribute("aria-pressed", "true");
    await expect.element(activityList(screen)).not.toBeInTheDocument();
  });

  test("the chips are Lagoon or neutral, never red or Ember", async () => {
    serveOwner();
    const { screen } = await openProfile();

    const listed = activityList(screen)
      .getByText("Listed", { exact: true })
      .first();
    const removed = activityList(screen).getByText("Removed from search", {
      exact: true,
    });
    await expect.element(listed).toBeVisible();
    const lagoon = computedColour("var(--positive)");
    const neutral = computedColour("var(--fg-muted)");
    const ember = computedColour("var(--color-ember)");
    const listedStyle = getComputedStyle(listed.element());
    const removedStyle = getComputedStyle(removed.element());
    expect(listedStyle.color).toBe(lagoon);
    expect(listedStyle.borderColor).toBe(lagoon);
    expect(removedStyle.color).toBe(neutral);
    for (const style of [listedStyle, removedStyle]) {
      expect(style.color).not.toBe(ember);
      expect(style.borderColor).not.toBe(ember);
    }
  });
});

describe("when a read fails", () => {
  test("a failed profile read shows an error and nothing else of the page", async () => {
    serveOwner();
    worker.use(http.get("/api/profile", () => serverError()));
    const { screen } = await openProfile();

    await expect
      .element(
        screen.getByRole("heading", { level: 1, name: "Something went wrong" }),
      )
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Your profile could not be loaded. Try again in a moment.",
        ),
      )
      .toBeVisible();
    await expect.element(heading(screen)).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("heading", { name: "Your activities" }))
      .not.toBeInTheDocument();
  });

  test("a failed activities read shows an error and nothing else of the page", async () => {
    serveOwner();
    worker.use(http.get("/api/profile/activities", () => serverError()));
    const { screen } = await openProfile();

    await expect
      .element(
        screen.getByRole("heading", { level: 1, name: "Something went wrong" }),
      )
      .toBeVisible();
    await expect.element(heading(screen)).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("region", { name: "Handle" }))
      .not.toBeInTheDocument();
  });

  test("Try again shows the profile once the read answers", async () => {
    serveOwner();
    let failures = 1;
    worker.use(
      http.get("/api/profile", () => {
        if (failures > 0) {
          failures -= 1;
          return serverError();
        }
        return HttpResponse.json(owner);
      }),
    );
    const { screen } = await openProfile();

    await screen.getByRole("button", { name: "Try again" }).click();
    await expect.element(heading(screen)).toBeVisible();
  });
});

describe("after signing out", () => {
  test("opening the profile again in the same tab never shows the last owner's details", async () => {
    serveOwner();
    // Signing out ends the session on the server too: from then on the session read answers
    // signed out and the profile reads answer 401.
    worker.use(
      http.delete("/api/session", () => {
        worker.use(
          http.get("/api/session", () => HttpResponse.json({ user: null })),
          http.get("/api/profile", () => unauthorized()),
          http.get("/api/profile/activities", () => unauthorized()),
        );
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { screen, router } = await openProfile();
    await expect.element(heading(screen)).toBeVisible();

    await screen
      .getByRole("banner")
      .getByRole("button", { name: "Account menu" })
      .click();
    await screen.getByRole("menuitem", { name: "Sign out" }).click();
    await expect.poll(() => router.state.location.pathname).toBe("/");

    // Watch every change to the page from here on, so a details flash of any length is seen.
    let shownEmail = false;
    const watcher = new MutationObserver(() => {
      if (document.body.textContent.includes("david@example.com")) {
        shownEmail = true;
      }
    });
    watcher.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    await router.navigate("/profile");

    await expect.poll(() => router.state.location.pathname).toBe("/sign-in");
    watcher.disconnect();
    expect(shownEmail).toBe(false);
  });
});
