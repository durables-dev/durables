import { routes } from "@/app/router";
import "@/styles/global.css";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import { ContributeDraftProvider } from "./contribute-draft-provider";
import { draftStorageKey } from "./draft";
import type { StepId } from "./steps";
import { useContributeDraft } from "./use-contribute-draft";

// The real route tree, opened at an address as if typed into the browser.
async function openAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  return { screen, router };
}

// A draft kept in the browser session from earlier in the flow.
function keepDraft(finished: StepId[]) {
  sessionStorage.setItem(draftStorageKey, JSON.stringify({ finished }));
}

function follows(first: Element, second: Element) {
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

function stepLinks(screen: Awaited<ReturnType<typeof openAt>>["screen"]) {
  return screen.getByRole("navigation", { name: "Steps" });
}

afterEach(() => {
  sessionStorage.clear();
});

test("shows the small Contribute label above the New activity heading", async () => {
  const { screen } = await openAt("/contribute");

  const heading = screen.getByRole("heading", {
    level: 1,
    name: "New activity",
  });
  await expect.element(heading).toBeVisible();
  const label = screen
    .getByRole("main")
    .getByText("Contribute", { exact: true });
  await expect.element(label).toBeVisible();
  expect(label.element().getBoundingClientRect().bottom).toBeLessThanOrEqual(
    heading.element().getBoundingClientRect().top,
  );
});

test("opening /contribute shows the heading, the step list and the tab title", async () => {
  const { screen, router } = await openAt("/contribute");

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "New activity" }))
    .toBeVisible();
  await expect.element(stepLinks(screen)).toBeVisible();
  await expect.poll(() => document.title).toBe("Contribute · Durables");
  expect(router.state.location.pathname).toBe("/contribute/profile");
});

test("lists Profile & Handle above a divider, then the numbered steps, with no README", async () => {
  const { screen } = await openAt("/contribute");

  const nav = stepLinks(screen);
  await expect.element(nav).toBeVisible();
  const lists = nav.getByRole("list").elements();
  expect(lists.map((list) => list.tagName)).toEqual(["UL", "OL"]);
  const [profileList, numberedList] = lists;
  expect(profileList?.textContent).toBe("Profile & Handle");
  const items = [...(numberedList?.querySelectorAll("li") ?? [])].map(
    (item) => item.textContent,
  );
  expect(items).toEqual([
    "1Code (locked)",
    "2Detected (locked)",
    "3Details (locked)",
    "4Review (locked)",
  ]);

  const divider = nav.getByRole("separator").element();
  if (!profileList || !numberedList) throw new Error("Expected both lists");
  expect(follows(profileList, divider)).toBe(true);
  expect(follows(divider, numberedList)).toBe(true);
  expect(nav.element().textContent).not.toMatch(/readme/i);
});

test("marks the step on screen as the current step", async () => {
  const { screen } = await openAt("/contribute/profile");

  await expect
    .element(stepLinks(screen).getByRole("link", { name: "Profile & Handle" }))
    .toHaveAttribute("aria-current", "step");
});

test("locks every later step until the earlier steps are finished", async () => {
  const { screen } = await openAt("/contribute/profile");

  const nav = stepLinks(screen);
  await expect.element(nav).toBeVisible();
  expect(
    nav
      .getByRole("link")
      .elements()
      .map((link) => link.textContent),
  ).toEqual(["Profile & Handle"]);
  for (const name of ["Code", "Detected", "Details", "Review"]) {
    await expect.element(nav.getByText(`${name} (locked)`)).toBeInTheDocument();
  }
});

test("opens the next step once the steps before it are finished", async () => {
  keepDraft(["profile"]);
  const { screen } = await openAt("/contribute/profile");

  const nav = stepLinks(screen);
  await nav.getByRole("link", { name: "Code" }).click();

  await expect
    .element(nav.getByRole("link", { name: "Code" }))
    .toHaveAttribute("aria-current", "step");
  await expect.element(nav.getByText("Detected (locked)")).toBeInTheDocument();
});

describe("a finished step", () => {
  test("shows a tick", async () => {
    keepDraft(["profile", "code"]);
    const { screen } = await openAt("/contribute/detected");

    const nav = stepLinks(screen);
    for (const name of ["Profile & Handle", "Code"]) {
      const link = nav.getByRole("link", { name: `${name} (finished)` });
      await expect.element(link).toBeVisible();
      expect(link.element().querySelector("svg path")?.getAttribute("d")).toBe(
        "M5 12l5 5 9-10",
      );
    }
  });

  test("draws the tick on the positive token", async () => {
    keepDraft(["profile"]);
    const { screen } = await openAt("/contribute/code");

    const link = stepLinks(screen).getByRole("link", {
      name: "Profile & Handle (finished)",
    });
    await expect.element(link).toBeVisible();
    const mark = link.element().querySelector("svg")?.parentElement;
    if (!mark) throw new Error("Expected the tick's mark");
    const probe = document.createElement("span");
    probe.style.color = "var(--positive)";
    document.body.append(probe);
    const positive = getComputedStyle(probe).color;
    probe.remove();
    expect(getComputedStyle(mark).backgroundColor).toBe(positive);
  });

  test("an unfinished step shows its number, not a tick", async () => {
    keepDraft(["profile"]);
    const { screen } = await openAt("/contribute/code");

    const link = stepLinks(screen).getByRole("link", { name: "Code" });
    await expect.element(link).toBeVisible();
    expect(link.element().querySelector("svg")).toBeNull();
    expect(link.element().textContent).toBe("1Code");
  });
});

describe("the address", () => {
  test("a locked step redirects to the earliest unfinished step", async () => {
    const { screen, router } = await openAt("/contribute/review");

    await expect
      .element(
        stepLinks(screen).getByRole("link", { name: "Profile & Handle" }),
      )
      .toHaveAttribute("aria-current", "step");
    expect(router.state.location.pathname).toBe("/contribute/profile");
  });

  test("a locked step redirects past the steps already finished", async () => {
    keepDraft(["profile"]);
    const { screen, router } = await openAt("/contribute/details");

    await expect
      .element(stepLinks(screen).getByRole("link", { name: "Code" }))
      .toHaveAttribute("aria-current", "step");
    expect(router.state.location.pathname).toBe("/contribute/code");
  });

  test("an unknown step falls back to the earliest unfinished step", async () => {
    keepDraft(["profile"]);
    const { screen, router } = await openAt("/contribute/readme");

    await expect
      .element(stepLinks(screen).getByRole("link", { name: "Code" }))
      .toHaveAttribute("aria-current", "step");
    expect(router.state.location.pathname).toBe("/contribute/code");
  });

  test("Profile & Handle shows its step slot", async () => {
    const { screen } = await openAt("/contribute/profile");

    await expect
      .element(screen.getByRole("region", { name: "Profile & Handle" }))
      .toBeInTheDocument();
  });
});

// Finishes a step the way a step's form will, through the draft.
function FinishStep({ step }: { step: StepId }) {
  const { dispatch } = useContributeDraft();
  return (
    <button
      type="button"
      onClick={() => dispatch({ type: "stepFinished", step })}
    >
      Finish {step}
    </button>
  );
}

test("reloading mid-flow keeps the draft and the current step", async () => {
  const before = await render(
    <ContributeDraftProvider>
      <FinishStep step="profile" />
    </ContributeDraftProvider>,
  );
  await before.getByRole("button", { name: "Finish profile" }).click();
  await expect
    .poll(() => sessionStorage.getItem(draftStorageKey))
    .toContain("profile");
  await before.unmount();

  // The reload: a fresh page at the same address, with the browser session kept.
  const { screen, router } = await openAt("/contribute/code");

  const nav = stepLinks(screen);
  await expect
    .element(nav.getByRole("link", { name: "Code" }))
    .toHaveAttribute("aria-current", "step");
  await expect
    .element(nav.getByRole("link", { name: "Profile & Handle (finished)" }))
    .toBeVisible();
  expect(router.state.location.pathname).toBe("/contribute/code");
});

test("an unreadable draft in the session starts the flow from the beginning", async () => {
  sessionStorage.setItem(draftStorageKey, "{not json");
  const { screen, router } = await openAt("/contribute/code");

  await expect
    .element(stepLinks(screen).getByRole("link", { name: "Profile & Handle" }))
    .toHaveAttribute("aria-current", "step");
  expect(router.state.location.pathname).toBe("/contribute/profile");
});

test("the header shows only the logo, with no Contribute button or link", async () => {
  const { screen } = await openAt("/contribute");

  const header = screen.getByRole("banner");
  await expect.element(header).toBeVisible();
  expect(
    header
      .getByRole("link")
      .elements()
      .map((link) => link.getAttribute("aria-label")),
  ).toEqual(["Durables home"]);
  expect(header.getByRole("button").elements()).toHaveLength(0);
  expect(
    screen.getByRole("link", { name: /contribute/i }).elements(),
  ).toHaveLength(0);
  expect(
    screen.getByRole("button", { name: /contribute/i }).elements(),
  ).toHaveLength(0);
});

test("signed in, the header shows the logo and the initials, with no Contribute button", async () => {
  worker.use(
    http.get("/api/session", () =>
      HttpResponse.json({
        user: {
          name: "Dana Dieruf",
          initials: "DD",
          provider: "google",
          handle: null,
          accountExists: false,
        },
      }),
    ),
  );
  const { screen } = await openAt("/contribute");

  const header = screen.getByRole("banner");
  await expect
    .element(header.getByRole("button", { name: "Account menu" }))
    .toHaveTextContent("DD");
  expect(
    header
      .getByRole("link")
      .elements()
      .map((link) => link.getAttribute("aria-label")),
  ).toEqual(["Durables home"]);
  expect(
    screen.getByRole("link", { name: /contribute/i }).elements(),
  ).toHaveLength(0);
  expect(
    screen.getByRole("button", { name: /contribute/i }).elements(),
  ).toHaveLength(0);
});

test("the flow has no footer, as the contribute canvas shows", async () => {
  const { screen } = await openAt("/contribute");

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "New activity" }))
    .toBeVisible();
  await expect.element(screen.getByRole("contentinfo")).not.toBeInTheDocument();
});

test("carries no Temporal or official wording", async () => {
  const { screen } = await openAt("/contribute");

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "New activity" }))
    .toBeVisible();
  expect(document.body.textContent).not.toMatch(/temporal|official/i);
});

test("useContributeDraft throws outside its provider", async () => {
  function Orphan() {
    useContributeDraft();
    return null;
  }
  // React reports the thrown error to the console before rethrowing it.
  const error = console.error;
  console.error = () => undefined;
  try {
    await expect(render(<Orphan />)).rejects.toThrow(/ContributeDraftProvider/);
  } finally {
    console.error = error;
  }
});
