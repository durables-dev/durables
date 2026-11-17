import { routes } from "@/app/router";
import type { SessionUser } from "@/lib/session";
import "@/styles/global.css";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";

// The real route tree, with a stand-in profile page at /profile, where Restore lands. The
// profile itself is another story's page.
async function openAt(path: string) {
  const [frame] = routes;
  if (!frame || frame.index) throw new Error("Expected the frame layout route");
  const router = createMemoryRouter(
    [
      {
        ...frame,
        children: [
          { path: "/profile", element: <h1>Your profile</h1> },
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

// Midday UTC, so the day is the same in any time zone the test runs in.
const finalAt = "2026-12-17T12:00:00.000Z";

const restored: SessionUser = {
  name: "Dana Dieruf",
  initials: "DD",
  provider: "github",
  handle: "ddieruf",
  accountExists: true,
};

const newUser: SessionUser = {
  name: "Dana Dieruf",
  initials: "DD",
  provider: "github",
  handle: null,
  accountExists: false,
};

function problem(status: number) {
  return HttpResponse.json(
    { type: "about:blank", title: "Internal Server Error", status },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

/**
 * The api holding a sign-in for the Restore choice (api: session/session.ts). Restore and Start
 * as a new user each start the session they answer with, and the session read follows. Each
 * choice fails as many times as asked first. Returns the choices it was sent, in order.
 */
interface HeldSignIn {
  handle?: string | null;
  restoreFailures?: number;
  startOverFailures?: number;
}

function holdForRestore({
  handle = "ddieruf",
  restoreFailures = 0,
  startOverFailures = 0,
}: HeldSignIn = {}) {
  let current: { user: SessionUser | null } | undefined;
  let restoreFails = restoreFailures;
  let startOverFails = startOverFailures;
  const sent: string[] = [];
  worker.use(
    http.get("/api/session", () =>
      HttpResponse.json(
        current ?? { user: null, restore: { handle, finalAt } },
      ),
    ),
    http.post("/api/session/restore", () => {
      sent.push("restore");
      if (restoreFails > 0) {
        restoreFails -= 1;
        return problem(500);
      }
      current = { user: restored };
      return HttpResponse.json(current);
    }),
    http.post("/api/session/start-over", () => {
      sent.push("start-over");
      if (startOverFails > 0) {
        startOverFails -= 1;
        return problem(500);
      }
      current = { user: newUser };
      return HttpResponse.json(current);
    }),
  );
  return sent;
}

function heading(screen: Screen) {
  return screen.getByRole("heading", {
    level: 1,
    name: "Restore your account?",
  });
}

function restoreButton(screen: Screen) {
  return screen.getByRole("button", { name: "Restore", exact: true });
}

function startOverButton(screen: Screen) {
  return screen.getByRole("button", { name: "Start as a new user" });
}

describe("a sign-in held for the Restore choice", () => {
  test("names the handle and the day the deletion becomes final", async () => {
    holdForRestore();
    const { screen } = await openAt("/sign-in/restore");

    await expect.element(heading(screen)).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Your account ddieruf is waiting to be deleted. The deletion becomes final on 17 December 2026.",
        ),
      )
      .toBeVisible();
    await expect.element(restoreButton(screen)).toBeEnabled();
    await expect.element(startOverButton(screen)).toBeEnabled();
    await expect
      .poll(() => document.title)
      .toBe("Restore your account · Durables");
  });

  test("does not list the activities", async () => {
    holdForRestore();
    const { screen } = await openAt("/sign-in/restore");

    await expect.element(restoreButton(screen)).toBeVisible();
    const main = screen.getByRole("main");
    expect(main.getByRole("list").elements()).toEqual([]);
    expect(main.getByRole("listitem").elements()).toEqual([]);
    expect(main.getByRole("link").elements()).toEqual([]);
  });

  test("the two choices are drawn as rounded buttons of the same height", async () => {
    holdForRestore();
    const { screen } = await openAt("/sign-in/restore");

    await expect.element(restoreButton(screen)).toBeVisible();
    const restoreStyle = getComputedStyle(restoreButton(screen).element());
    const startOverStyle = getComputedStyle(startOverButton(screen).element());
    for (const style of [restoreStyle, startOverStyle]) {
      expect(style.borderTopLeftRadius).not.toBe("0px");
      expect(style.height).toBe("40px");
    }
  });

  test("an account with no handle is still offered both choices", async () => {
    holdForRestore({ handle: null });
    const { screen } = await openAt("/sign-in/restore");

    await expect
      .element(screen.getByText(/^Your account is waiting to be deleted\./))
      .toBeVisible();
    await expect.element(restoreButton(screen)).toBeEnabled();
    await expect.element(startOverButton(screen)).toBeEnabled();
  });

  test("the header offers neither Sign in nor Contribute", async () => {
    holdForRestore();
    const { screen } = await openAt("/sign-in/restore");

    await expect.element(heading(screen)).toBeVisible();
    await expect.element(restoreButton(screen)).toBeVisible();
    const header = screen.getByRole("banner");
    expect(header.getByRole("link", { name: "Sign in" }).elements()).toEqual(
      [],
    );
    expect(header.getByRole("link", { name: "Contribute" }).elements()).toEqual(
      [],
    );
  });
});

describe("Restore", () => {
  test("lands on the profile with the restored message", async () => {
    const sent = holdForRestore();
    const { screen, router } = await openAt("/sign-in/restore");

    await restoreButton(screen).click();

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Your profile" }))
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/profile");
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Your account is restored.");
    // The header now shows the restored publisher.
    await expect
      .element(screen.getByRole("button", { name: "Account menu" }))
      .toBeVisible();
    expect(sent).toEqual(["restore"]);
  });

  test("while it is being made, both choices are disabled", async () => {
    holdForRestore();
    let release: (() => void) | undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    worker.use(
      http.post("/api/session/restore", async () => {
        await released;
        return HttpResponse.json({ user: restored });
      }),
    );
    const { screen } = await openAt("/sign-in/restore");

    await restoreButton(screen).click();

    await expect
      .element(screen.getByRole("button", { name: "Restoring…" }))
      .toBeDisabled();
    await expect.element(startOverButton(screen)).toBeDisabled();

    release?.();
    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Your profile" }))
      .toBeVisible();
  });

  test("that fails keeps the prompt with a message, and can be tried again", async () => {
    const sent = holdForRestore({ restoreFailures: 1 });
    const { screen, router } = await openAt("/sign-in/restore");

    await restoreButton(screen).click();

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Restoring didn't finish. Try again.");
    expect(router.state.location.pathname).toBe("/sign-in/restore");
    await expect.element(heading(screen)).toBeVisible();
    await expect.element(restoreButton(screen)).toBeEnabled();
    await expect.element(startOverButton(screen)).toBeEnabled();

    await restoreButton(screen).click();

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Your profile" }))
      .toBeVisible();
    expect(sent).toEqual(["restore", "restore"]);
  });

  test("the failure message is neutral, never Ember", async () => {
    holdForRestore({ restoreFailures: 1 });
    const { screen } = await openAt("/sign-in/restore");

    await restoreButton(screen).click();
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
});

describe("Start as a new user", () => {
  test("continues into Contribute at Profile & Handle", async () => {
    const sent = holdForRestore();
    const { screen, router } = await openAt("/sign-in/restore");

    await startOverButton(screen).click();

    await expect
      .element(
        screen.getByRole("heading", { level: 2, name: "Choose your handle" }),
      )
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/contribute/profile");
    expect(sent).toEqual(["start-over"]);
  });

  test("that fails keeps the prompt with a message, and can be tried again", async () => {
    const sent = holdForRestore({ startOverFailures: 1 });
    const { screen, router } = await openAt("/sign-in/restore");

    await startOverButton(screen).click();

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Starting as a new user didn't finish. Try again.");
    expect(router.state.location.pathname).toBe("/sign-in/restore");
    await expect.element(restoreButton(screen)).toBeEnabled();
    await expect.element(startOverButton(screen)).toBeEnabled();

    await startOverButton(screen).click();

    await expect
      .element(
        screen.getByRole("heading", { level: 2, name: "Choose your handle" }),
      )
      .toBeVisible();
    expect(sent).toEqual(["start-over", "start-over"]);
  });
});

describe("other pages while a sign-in is held for the Restore choice", () => {
  test.each(["/", "/privacy", "/contribute/code", "/sign-in", "/profile"])(
    "%s leads back to the prompt",
    async (path) => {
      holdForRestore();
      const { screen, router } = await openAt(path);

      await expect.element(heading(screen)).toBeVisible();
      expect(router.state.location.pathname).toBe("/sign-in/restore");
      await expect.element(restoreButton(screen)).toBeVisible();
    },
  );

  test("an unknown address leads back to the prompt", async () => {
    holdForRestore();
    const { screen, router } = await openAt("/nowhere/at/all");

    await expect.element(heading(screen)).toBeVisible();
    expect(router.state.location.pathname).toBe("/sign-in/restore");
  });
});

describe("no sign-in held for the Restore choice", () => {
  test("says there is nothing to restore and offers the home page", async () => {
    const { screen } = await openAt("/sign-in/restore");

    await expect
      .element(
        screen.getByText("There's no deleted account waiting to be restored."),
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Go to Durables" }))
      .toHaveAttribute("href", "/");
    await expect.element(restoreButton(screen)).not.toBeInTheDocument();
  });

  test("other pages are not led to the prompt", async () => {
    const { screen, router } = await openAt("/privacy");

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Privacy" }))
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/privacy");
  });

  test("the profile reached any other way shows no restored message", async () => {
    worker.use(
      http.get("/api/session", () => HttpResponse.json({ user: restored })),
    );
    const { screen } = await openAt("/profile");

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Your profile" }))
      .toBeVisible();
    expect(screen.getByText("Your account is restored.").elements()).toEqual(
      [],
    );
  });
});
