import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import "@/styles/global.css";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import { draftStorageKey } from "./draft";
import { acceptedCheck, pastedCode } from "./test-drafts";

// The real route tree, opened at the given history as if the publisher had walked it. The
// last entry is the page on screen.
async function openAt(...entries: string[]) {
  const router = createMemoryRouter(routes, { initialEntries: entries });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  return { screen, router };
}

// Every address the router shows, from the first, including redirects that replace an entry.
function recordAddresses(router: ReturnType<typeof createMemoryRouter>) {
  const visited = [router.state.location.pathname];
  router.subscribe((state) => {
    if (state.location.pathname !== visited.at(-1)) {
      visited.push(state.location.pathname);
    }
  });
  return visited;
}

async function openRecordingAt(entry: string) {
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  const visited = recordAddresses(router);
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  return { screen, router, visited };
}

type Screen = Awaited<ReturnType<typeof openAt>>["screen"];

const publisher: SessionUser = {
  name: "Dana Dieruf",
  initials: "DD",
  provider: "google",
  handle: null,
  accountExists: false,
};

// The session endpoint answers for a signed-in publisher.
function signIn(user: Partial<SessionUser> = {}) {
  worker.use(
    http.get("/api/session", () =>
      HttpResponse.json({ user: { ...publisher, ...user } }),
    ),
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

function signInHeading(screen: Screen) {
  return screen.getByRole("heading", {
    level: 2,
    name: "Sign in to contribute",
  });
}

function providerLinks(screen: Screen) {
  return screen
    .getByRole("list", { name: "Sign-in providers" })
    .getByRole("link");
}

function continueButton(screen: Screen) {
  return screen.getByRole("button", { name: "Continue" });
}

// Records the address a click on a link sends the browser to, then stops the browser from
// leaving the test page. A click the router or anything else took over records nothing.
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

afterEach(() => {
  sessionStorage.clear();
});

describe("signed out", () => {
  test("shows the heading and intro from the design", async () => {
    const { screen } = await openAt("/contribute");

    await expect.element(signInHeading(screen)).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Any of these works. Your account is created when you publish your first activity, and there are no Durables passwords.",
          { exact: true },
        ),
      )
      .toBeVisible();
  });

  test("shows four provider buttons, in the order GitHub, GitLab, Google, Microsoft", async () => {
    const { screen } = await openAt("/contribute");

    await expect.element(signInHeading(screen)).toBeVisible();
    expect(
      providerLinks(screen)
        .elements()
        .map((link) => link.textContent),
    ).toEqual(providerNames);
    for (const name of providerNames) {
      await expect
        .element(screen.getByRole("link", { name, exact: true }))
        .toBeVisible();
    }
  });

  test("lays the four buttons out two by two, at one size", async () => {
    // The two-by-two grid is the desktop layout; a narrow screen stacks the buttons.
    await page.viewport(1440, 900);
    const { screen } = await openAt("/contribute");

    await expect.element(signInHeading(screen)).toBeVisible();
    const boxes = providerLinks(screen)
      .elements()
      .map((link) => link.getBoundingClientRect());
    const [github, gitlab, google, microsoft] = boxes;
    if (!github || !gitlab || !google || !microsoft) {
      throw new Error("Expected four buttons");
    }
    expect(gitlab.top).toBe(github.top);
    expect(gitlab.left).toBeGreaterThan(github.right);
    expect(google.top).toBeGreaterThan(github.bottom);
    expect(google.left).toBe(github.left);
    expect(microsoft.top).toBe(google.top);
    for (const box of boxes) {
      expect(box.width).toBe(github.width);
      expect(box.height).toBe(github.height);
    }
  });

  test("stacks the four buttons on a narrow screen", async () => {
    await page.viewport(414, 896);
    const { screen } = await openAt("/contribute");

    await expect.element(signInHeading(screen)).toBeVisible();
    const lefts = providerLinks(screen)
      .elements()
      .map((link) => link.getBoundingClientRect().left);
    expect(new Set(lefts).size).toBe(1);
  });

  test("shows no shield marks and no verification panel", async () => {
    const { screen } = await openAt("/contribute");

    await expect.element(signInHeading(screen)).toBeVisible();
    for (const link of providerLinks(screen).elements()) {
      expect(link.querySelector("svg, img")).toBeNull();
      expect(link.hasAttribute("aria-describedby")).toBe(false);
    }
    const step = screen.getByRole("region", { name: "Profile & Handle" });
    expect(step.element().textContent).not.toMatch(/verif|source/i);
    expect(document.getElementById("verify-note")).toBeNull();
  });

  test("notes what is kept from the provider", async () => {
    const { screen } = await openAt("/contribute");

    await expect
      .element(
        screen.getByText(
          "We keep your name, email and avatar from the provider.",
          { exact: true },
        ),
      )
      .toBeVisible();
    expect(document.body.textContent).not.toMatch(/profile\./i);
  });

  test("Continue is disabled and the hint says to sign in", async () => {
    const { screen } = await openAt("/contribute");

    await expect.element(continueButton(screen)).toBeDisabled();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Sign in to continue");
  });

  test("moves focus to the step's heading", async () => {
    const { screen } = await openAt("/contribute");

    await expect.element(signInHeading(screen)).toHaveFocus();
  });

  test("has no password field", async () => {
    const { screen } = await openAt("/contribute");

    await expect.element(signInHeading(screen)).toBeVisible();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(document.querySelector("input")).toBeNull();
    expect(document.body.textContent).not.toMatch(/password:/i);
  });
});

describe("choosing a provider", () => {
  test("each button sends the browser to that provider's start route", async () => {
    const { screen, router } = await openAt("/contribute");
    await expect.element(signInHeading(screen)).toBeVisible();

    const navigation = watchDocumentNavigation();
    try {
      for (const name of providerNames) {
        await screen.getByRole("link", { name, exact: true }).click();
      }
    } finally {
      navigation.stop();
    }

    expect(navigation.visited).toEqual([
      "/api/session/providers/github",
      "/api/session/providers/gitlab",
      "/api/session/providers/google",
      "/api/session/providers/microsoft",
    ]);
    expect(router.state.location.pathname).toBe("/contribute/profile");
  });
});

describe("back from the provider", () => {
  test("signed in with no account, the flow moves to the handle step", async () => {
    signIn({ accountExists: false });
    // A finished sign-in lands on /contribute (api: session/sign-in.ts, signedInPath).
    const { screen, router } = await openAt("/contribute");

    await expect
      .element(
        screen.getByRole("heading", { level: 2, name: "Choose your handle" }),
      )
      .toBeVisible();
    await expect.element(signInHeading(screen)).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/contribute/profile");
  });

  test("signed in with an account, the flow lands on the Code step", async () => {
    signIn({ accountExists: true, handle: "ddieruf" });
    const { screen, router } = await openAt("/contribute");

    const steps = screen.getByRole("navigation", { name: "Steps" });
    await expect
      .element(steps.getByRole("link", { name: "Code" }))
      .toHaveAttribute("aria-current", "step");
    await expect
      .element(steps.getByRole("link", { name: "Profile & Handle (finished)" }))
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/code");
    await expect.element(signInHeading(screen)).not.toBeInTheDocument();
  });

  test("signed in with an account, opening Code directly stays on Code", async () => {
    signIn({ accountExists: true, handle: "ddieruf" });
    const { screen, router, visited } =
      await openRecordingAt("/contribute/code");

    await expect
      .element(
        screen
          .getByRole("navigation", { name: "Steps" })
          .getByRole("link", { name: "Code" }),
      )
      .toHaveAttribute("aria-current", "step");
    expect(router.state.location.pathname).toBe("/contribute/code");
    expect(visited).toEqual(["/contribute/code"]);
  });

  test("signed in with an account and Code finished, reopening Detected stays on Detected", async () => {
    signIn({ accountExists: true, handle: "ddieruf" });
    // Code is finished while the pasted file is accepted.
    sessionStorage.setItem(
      draftStorageKey,
      JSON.stringify({ finished: [], code: pastedCode, check: acceptedCheck }),
    );
    const { screen, router, visited } = await openRecordingAt(
      "/contribute/detected",
    );

    await expect
      .element(
        screen
          .getByRole("navigation", { name: "Steps" })
          .getByRole("link", { name: "Detected" }),
      )
      .toHaveAttribute("aria-current", "step");
    expect(router.state.location.pathname).toBe("/contribute/detected");
    expect(visited).toEqual(["/contribute/detected"]);
  });

  test("after a sign-in that did not finish, the message shows and the buttons stay usable", async () => {
    // Where a failed or cancelled sign-in lands (api: session/sign-in.ts, signInFailedPath).
    const { screen } = await openAt("/contribute/profile?sign-in=failed");

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent(failureMessage);
    await expect.element(signInHeading(screen)).toBeVisible();

    const navigation = watchDocumentNavigation();
    try {
      await screen
        .getByRole("link", { name: "Continue with Microsoft", exact: true })
        .click();
    } finally {
      navigation.stop();
    }
    expect(navigation.visited).toEqual(["/api/session/providers/microsoft"]);
    expect(providerLinks(screen).elements()).toHaveLength(4);
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  test("a sign-in that did not finish while still signed in shows the message on the sign-in step", async () => {
    signIn();
    const { screen } = await openAt("/contribute/profile?sign-in=failed");

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent(failureMessage);
    await expect.element(signInHeading(screen)).toBeVisible();
  });

  test("with no failure, no message shows", async () => {
    const { screen } = await openAt("/contribute/profile?sign-in=nonsense");

    await expect.element(signInHeading(screen)).toBeVisible();
    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(failureMessage);
  });
});

describe("the session cannot be read", () => {
  test("shows the signed-out step", async () => {
    worker.use(
      http.get("/api/session", () =>
        HttpResponse.json(
          { type: "about:blank", title: "Internal Server Error", status: 500 },
          { status: 500 },
        ),
      ),
    );
    const { screen } = await openAt("/contribute");

    await expect.element(signInHeading(screen)).toBeVisible();
    await expect.element(continueButton(screen)).toBeDisabled();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Sign in to continue");
  });
});

describe("Back", () => {
  test("returns to the page the publisher came from", async () => {
    const { screen, router } = await openAt("/terms");

    await screen
      .getByRole("banner")
      .getByRole("link", { name: "Contribute" })
      .click();
    await expect.element(signInHeading(screen)).toBeVisible();
    await screen.getByRole("button", { name: "Back" }).click();

    await expect.poll(() => router.state.location.pathname).toBe("/terms");
  });

  test("returns to the page the flow was opened from after a round trip to the provider", async () => {
    // The draft kept the page the flow was opened from before the browser left.
    sessionStorage.setItem(
      draftStorageKey,
      JSON.stringify({ finished: [], origin: "/privacy" }),
    );
    const { screen, router } = await openAt(
      "/contribute/profile?sign-in=failed",
    );

    await expect.element(signInHeading(screen)).toBeVisible();
    await screen.getByRole("button", { name: "Back" }).click();

    await expect.poll(() => router.state.location.pathname).toBe("/privacy");
  });

  test("goes home when there is no previous page", async () => {
    const { screen, router } = await openAt("/contribute");

    await expect.element(signInHeading(screen)).toBeVisible();
    await screen.getByRole("button", { name: "Back" }).click();

    await expect.poll(() => router.state.location.pathname).toBe("/");
  });
});

describe("coming back from the handle step", () => {
  test("the publisher stays signed in, and each button signs in again with its provider", async () => {
    signIn();
    const { screen, router } = await openAt(
      "/contribute/profile?sign-in=again",
    );

    await expect.element(signInHeading(screen)).toBeVisible();
    await expect
      .element(
        screen
          .getByRole("banner")
          .getByRole("button", { name: "Account menu" }),
      )
      .toHaveTextContent("DD");
    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();

    const navigation = watchDocumentNavigation();
    try {
      await screen
        .getByRole("link", { name: "Continue with GitHub", exact: true })
        .click();
    } finally {
      navigation.stop();
    }
    expect(navigation.visited).toEqual(["/api/session/providers/github"]);
    expect(router.state.location.pathname).toBe("/contribute/profile");
  });

  test("Continue is enabled with no hint, and returns to the handle step", async () => {
    signIn();
    const { screen } = await openAt("/contribute/profile?sign-in=again");

    await expect.element(continueButton(screen)).toBeEnabled();
    await expect.element(screen.getByRole("status")).toHaveTextContent("");
    await continueButton(screen).click();

    await expect
      .element(
        screen.getByRole("heading", { level: 2, name: "Choose your handle" }),
      )
      .toBeVisible();
  });
});
