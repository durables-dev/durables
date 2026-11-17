import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import "@/styles/global.css";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";

// The real route tree, with a stand-in activity page at /acme/charge-card so the header's Sign
// in link can be followed from it without asking the API for a listing.
async function openAt(path: string) {
  const [frame] = routes;
  if (!frame || frame.index) throw new Error("Expected the frame layout route");
  const router = createMemoryRouter(
    [
      {
        ...frame,
        children: [
          { path: "/acme/charge-card", element: <h1>Charge card</h1> },
          ...(frame.children ?? []),
        ],
      },
    ],
    { initialEntries: [path] },
  );
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  return { screen, router };
}

type Screen = Awaited<ReturnType<typeof openAt>>["screen"];

const publisher: SessionUser = {
  name: "Dana Dieruf",
  initials: "DD",
  provider: "github",
  handle: "ddieruf",
  accountExists: true,
};

function signIn() {
  worker.use(
    http.get("/api/session", () => HttpResponse.json({ user: publisher })),
  );
}

const providerNames = [
  "Continue with GitHub",
  "Continue with GitLab",
  "Continue with Google",
  "Continue with Microsoft",
];

const failureMessage =
  "Sign-in didn't finish. Try again, or choose another provider.";

function heading(screen: Screen) {
  return screen.getByRole("heading", { level: 1, name: "Sign in" });
}

function providerList(screen: Screen) {
  return screen.getByRole("list", { name: "Sign-in providers" });
}

/** Where each provider button starts sign-in, as path and query. */
function startAddresses(screen: Screen) {
  return providerList(screen)
    .getByRole("link")
    .elements()
    .map((link) => {
      const url = new URL((link as HTMLAnchorElement).href);
      return `${url.pathname}${url.search}`;
    });
}

// Records the address a click on a link sends the browser to, then stops the browser from
// leaving the test page.
function watchDocumentNavigation() {
  const visited: string[] = [];
  const listener = (event: MouseEvent) => {
    const link =
      event.target instanceof Element ? event.target.closest("a") : null;
    if (!link) return;
    if (!event.defaultPrevented) {
      const url = new URL(link.href);
      visited.push(`${url.pathname}${url.search}`);
    }
    event.preventDefault();
  };
  window.addEventListener("click", listener);
  return {
    visited,
    stop: () => window.removeEventListener("click", listener),
  };
}

describe("signed out", () => {
  test('shows the heading "Sign in" and the tab title', async () => {
    const { screen } = await openAt("/sign-in");

    await expect.element(heading(screen)).toBeVisible();
    await expect.poll(() => document.title).toBe("Sign in · Durables");
  });

  test("shows four equal provider buttons, in the order GitHub, GitLab, Google, Microsoft, with no verification marks", async () => {
    const { screen } = await openAt("/sign-in");

    await expect.element(heading(screen)).toBeVisible();
    const links = providerList(screen).getByRole("link").elements();
    expect(links.map((link) => link.textContent)).toEqual(providerNames);
    const first = links[0]?.getBoundingClientRect();
    for (const link of links) {
      expect(link.querySelector("svg, img")).toBeNull();
      expect(link.hasAttribute("aria-describedby")).toBe(false);
      const box = link.getBoundingClientRect();
      expect(box.width).toBe(first?.width);
      expect(box.height).toBe(first?.height);
    }
    expect(document.body.textContent).not.toMatch(/verif|source/i);
  });

  test("has no password field", async () => {
    const { screen } = await openAt("/sign-in");

    await expect.element(heading(screen)).toBeVisible();
    expect(document.querySelector("input")).toBeNull();
  });

  test("notes what is kept from the provider and that it shows on the profile", async () => {
    const { screen } = await openAt("/sign-in");

    await expect
      .element(
        screen.getByText(
          "We keep your name, email and avatar from the provider, and you can see exactly what we kept on your profile.",
          { exact: true },
        ),
      )
      .toBeVisible();
  });

  test("opened directly, the buttons pass no starting page", async () => {
    const { screen } = await openAt("/sign-in");

    await expect.element(heading(screen)).toBeVisible();
    expect(startAddresses(screen)).toEqual([
      "/api/session/providers/github",
      "/api/session/providers/gitlab",
      "/api/session/providers/google",
      "/api/session/providers/microsoft",
    ]);
    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  });

  test("opened from /acme/charge-card, choosing a provider starts sign-in with that page", async () => {
    const { screen, router } = await openAt("/acme/charge-card");

    await screen
      .getByRole("banner")
      .getByRole("link", { name: "Sign in" })
      .click();
    await expect.element(heading(screen)).toBeVisible();
    expect(router.state.location.pathname).toBe("/sign-in");

    const navigation = watchDocumentNavigation();
    try {
      for (const name of providerNames) {
        await screen.getByRole("link", { name, exact: true }).click();
      }
    } finally {
      navigation.stop();
    }
    expect(navigation.visited).toEqual([
      "/api/session/providers/github?returnTo=%2Facme%2Fcharge-card",
      "/api/session/providers/gitlab?returnTo=%2Facme%2Fcharge-card",
      "/api/session/providers/google?returnTo=%2Facme%2Fcharge-card",
      "/api/session/providers/microsoft?returnTo=%2Facme%2Fcharge-card",
    ]);
  });

  test("a starting page that is not on this site is not passed on", async () => {
    const { screen } = await openAt(
      "/sign-in?returnTo=https%3A%2F%2Fevil.test%2F",
    );

    await expect.element(heading(screen)).toBeVisible();
    expect(startAddresses(screen)).toEqual([
      "/api/session/providers/github",
      "/api/session/providers/gitlab",
      "/api/session/providers/google",
      "/api/session/providers/microsoft",
    ]);
  });
});

describe("after a sign-in that did not finish", () => {
  test("shows the failure message, and the buttons stay", async () => {
    // Where the api lands a cancelled sign-in with no starting page.
    const { screen } = await openAt("/sign-in?sign-in=failed");

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent(failureMessage);
    expect(startAddresses(screen)).toHaveLength(4);
  });

  test("started from /acme/charge-card, the message shows and the buttons still pass /acme/charge-card", async () => {
    // api: session/sign-in.ts, signInFailedLocation.
    const { screen } = await openAt(
      "/sign-in?sign-in=failed&returnTo=%2Facme%2Fcharge-card",
    );

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent(failureMessage);
    expect(startAddresses(screen)).toEqual([
      "/api/session/providers/github?returnTo=%2Facme%2Fcharge-card",
      "/api/session/providers/gitlab?returnTo=%2Facme%2Fcharge-card",
      "/api/session/providers/google?returnTo=%2Facme%2Fcharge-card",
      "/api/session/providers/microsoft?returnTo=%2Facme%2Fcharge-card",
    ]);
  });

  test("the failure message is neutral, never Ember", async () => {
    const { screen } = await openAt("/sign-in?sign-in=failed");

    const alert = screen.getByRole("alert");
    await expect.element(alert).toBeVisible();
    const probe = document.createElement("span");
    probe.style.color = "var(--color-ember)";
    document.body.append(probe);
    const ember = getComputedStyle(probe).color;
    probe.remove();
    const style = getComputedStyle(alert.element());
    expect(style.color).not.toBe(ember);
    expect(style.borderColor).not.toBe(ember);
    expect(style.backgroundColor).not.toBe(ember);
  });

  test("an unknown indicator shows no message", async () => {
    const { screen } = await openAt("/sign-in?sign-in=nonsense");

    await expect.element(heading(screen)).toBeVisible();
    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  });
});

describe("signed in", () => {
  test("shows no provider buttons and offers the way back", async () => {
    signIn();
    const { screen } = await openAt("/sign-in?returnTo=%2Facme%2Fcharge-card");

    await expect
      .element(screen.getByText("You're already signed in."))
      .toBeVisible();
    await expect.element(heading(screen)).toBeVisible();
    await expect.element(providerList(screen)).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: "Go back" }))
      .toHaveAttribute("href", "/acme/charge-card");
  });

  test("opened directly, offers the home page", async () => {
    signIn();
    const { screen } = await openAt("/sign-in");

    await expect
      .element(screen.getByRole("link", { name: "Go to Durables" }))
      .toHaveAttribute("href", "/");
    await expect.element(providerList(screen)).not.toBeInTheDocument();
  });
});

describe("the session cannot be read", () => {
  test("shows the provider buttons, as for a signed-out visitor", async () => {
    worker.use(
      http.get("/api/session", () =>
        HttpResponse.json(
          { type: "about:blank", title: "Internal Server Error", status: 500 },
          { status: 500 },
        ),
      ),
    );
    const { screen } = await openAt("/sign-in");

    await expect.element(providerList(screen)).toBeVisible();
    expect(startAddresses(screen)).toHaveLength(4);
  });
});
