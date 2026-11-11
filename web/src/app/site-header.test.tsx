import type { SessionUser } from "@/lib/session";
import "@/styles/global.css";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { worker } from "../../test/worker";
import { TestProviders } from "../../test/test-providers";
import { SiteHeader } from "./site-header";

interface RenderOptions {
  /** False renders the header as the Contribute pages do. */
  contribute?: boolean;
}

// The header above a page body, with a stand-in for the Contribute flow to land on.
function renderHeader({ contribute = true }: RenderOptions = {}) {
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <>
          <SiteHeader contribute={contribute} />
          <p>Page body</p>
        </>
      ),
    },
    { path: "/contribute", element: <h1>Contribute flow</h1> },
  ]);
  return render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
}

const publisher: SessionUser = {
  name: "Dana Dieruf",
  initials: "DD",
  provider: "github",
  handle: null,
  accountExists: false,
};

// The session endpoint answers for a signed-in publisher. Counts the reads.
function signIn(user: SessionUser = publisher) {
  const reads = { count: 0 };
  worker.use(
    http.get("/api/session", () => {
      reads.count += 1;
      return HttpResponse.json({ user });
    }),
  );
  return reads;
}

type Screen = Awaited<ReturnType<typeof renderHeader>>;

function initials(screen: Screen) {
  return screen.getByRole("banner").getByRole("button", {
    name: "Account menu",
  });
}

function contributeLink(screen: Screen) {
  return screen.getByRole("banner").getByRole("link", { name: "Contribute" });
}

// The menu, found whether it is open or closed.
function accountMenu(screen: Screen) {
  return screen.getByRole("menu", { name: "Account", includeHidden: true });
}

async function openMenu(screen: Screen) {
  await initials(screen).click();
  const menu = accountMenu(screen);
  await expect.element(menu).toBeVisible();
  return menu;
}

test('the logo is one link to the home page, named "Durables home"', async () => {
  const screen = await renderHeader();

  const logo = screen.getByRole("link", { name: "Durables home" });
  await expect.element(logo).toHaveAttribute("href", "/");
  await expect.element(logo).toHaveAccessibleName("Durables home");
});

test("the mark and wordmark sit at the left", async () => {
  const screen = await renderHeader();

  const header = screen.getByRole("banner");
  await expect.element(header).toBeVisible();

  const headerBox = header.element().getBoundingClientRect();
  const logoBox = header
    .getByRole("link", { name: "Durables home" })
    .element()
    .getBoundingClientRect();
  expect(logoBox.left - headerBox.left).toBeLessThanOrEqual(24);
  expect(logoBox.right).toBeLessThan(headerBox.left + headerBox.width / 2);
  expect(headerBox.height).toBe(60);
});

test("the wordmark is live text in Space Grotesk 600, not an image", async () => {
  const screen = await renderHeader();

  const wordmark = screen.getByText("Durables", { exact: true });
  await expect.element(wordmark).toBeVisible();
  expect(wordmark.element().tagName).not.toBe("IMG");
  const style = getComputedStyle(wordmark.element());
  expect(style.fontFamily).toContain("Space Grotesk");
  expect(style.fontWeight).toBe("600");
});

test("the picture offers the Cream mark under a light scheme and the Ink mark by default", async () => {
  const screen = await renderHeader();

  const picture = screen.container.querySelector("picture");
  const sources = picture?.querySelectorAll("source") ?? [];
  expect(sources).toHaveLength(1);
  expect(sources[0]?.getAttribute("media")).toBe(
    "(prefers-color-scheme: light)",
  );
  expect(sources[0]?.getAttribute("srcset")).toBe(
    "/durables-mark-on-cream.svg",
  );
  expect(picture?.querySelector("img")?.getAttribute("src")).toBe(
    "/durables-mark-on-ink.svg",
  );
});

test("both mark files resolve to the site's own origin", async () => {
  const screen = await renderHeader();

  const picture = screen.container.querySelector("picture");
  const paths = [
    picture?.querySelector("source")?.getAttribute("srcset"),
    picture?.querySelector("img")?.getAttribute("src"),
  ];
  for (const path of paths) {
    expect(path).toBeTruthy();
    expect(new URL(path ?? "", document.baseURI).origin).toBe(location.origin);
  }
});

test("the header carries no Temporal wording, logo or colour", async () => {
  const screen = await renderHeader();

  const header = screen.getByRole("banner").element();
  expect(header.textContent).toBe("DurablesContribute");
  expect(header.textContent).not.toMatch(/temporal|official/i);

  const images = [...header.querySelectorAll("img, source")].map(
    (image) => image.getAttribute("src") ?? image.getAttribute("srcset"),
  );
  expect(images.sort()).toEqual([
    "/durables-mark-on-cream.svg",
    "/durables-mark-on-ink.svg",
  ]);

  // The header draws on the page background, with text in the theme's foreground token.
  const root = getComputedStyle(document.documentElement);
  const probe = document.createElement("span");
  probe.style.color = root.getPropertyValue("--fg");
  document.body.append(probe);
  const fg = getComputedStyle(probe).color;
  probe.remove();
  expect(getComputedStyle(header).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(
    getComputedStyle(screen.getByText("Durables", { exact: true }).element())
      .color,
  ).toBe(fg);
});

describe("signed out", () => {
  test("shows the Contribute pill, linking to the start of the Contribute flow", async () => {
    const screen = await renderHeader();

    const contribute = contributeLink(screen);
    await expect.element(contribute).toBeVisible();
    await expect.element(contribute).toHaveAttribute("href", "/contribute");
    await expect.element(initials(screen)).not.toBeInTheDocument();

    await contribute.click();
    await expect
      .element(screen.getByRole("heading", { name: "Contribute flow" }))
      .toBeVisible();
  });

  test("the Contribute pill sits at the right of the header", async () => {
    const screen = await renderHeader();

    const header = screen.getByRole("banner");
    const contribute = contributeLink(screen);
    await expect.element(contribute).toBeVisible();
    const headerBox = header.element().getBoundingClientRect();
    const box = contribute.element().getBoundingClientRect();
    expect(headerBox.right - box.right).toBeLessThanOrEqual(24);
    expect(box.height).toBe(40);
  });

  test("a session that cannot be read shows the signed-out header", async () => {
    const reads = { count: 0 };
    worker.use(
      http.get("/api/session", () => {
        reads.count += 1;
        return HttpResponse.json(
          { type: "about:blank", title: "Internal Server Error", status: 500 },
          { status: 500 },
        );
      }),
    );
    const screen = await renderHeader();

    await expect.poll(() => reads.count).toBe(1);
    // Let the failed read reach the header before looking.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect.element(contributeLink(screen)).toBeVisible();
    await expect.element(initials(screen)).not.toBeInTheDocument();
  });
});

describe("signed in", () => {
  test("shows Contribute, then the initials, with Contribute to the left", async () => {
    signIn();
    const screen = await renderHeader();

    const badge = initials(screen);
    const contribute = contributeLink(screen);
    await expect.element(badge).toBeVisible();
    await expect.element(contribute).toBeVisible();

    const contributeBox = contribute.element().getBoundingClientRect();
    const badgeBox = badge.element().getBoundingClientRect();
    expect(contributeBox.right).toBeLessThanOrEqual(badgeBox.left);
    expect(
      contribute.element().compareDocumentPosition(badge.element()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("shows the initials from the session in a round Tangerine badge, never an avatar", async () => {
    signIn({ ...publisher, name: "Kai Ō", initials: "KŌ" });
    const screen = await renderHeader();

    const badge = initials(screen);
    await expect.element(badge).toBeVisible();
    await expect.element(badge).toHaveTextContent("KŌ");

    const header = screen.getByRole("banner").element();
    const images = [...header.querySelectorAll("img, source")].map(
      (image) => image.getAttribute("src") ?? image.getAttribute("srcset"),
    );
    expect(images.sort()).toEqual([
      "/durables-mark-on-cream.svg",
      "/durables-mark-on-ink.svg",
    ]);
    expect(header.querySelectorAll("svg, canvas")).toHaveLength(0);

    const circle = badge.element().querySelector("span");
    if (!circle) throw new Error("Expected the badge");
    const probe = document.createElement("span");
    probe.style.color = "var(--accent)";
    document.body.append(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    const style = getComputedStyle(circle);
    expect(style.backgroundColor).toBe(accent);
    expect(accent).toBe("rgb(255, 90, 31)");
    const box = circle.getBoundingClientRect();
    expect(box.width).toBe(32);
    expect(box.height).toBe(32);
    expect(style.borderRadius).not.toBe("0px");
  });

  test("the initials open a menu with exactly one item, Sign out", async () => {
    signIn();
    const screen = await renderHeader();

    await expect
      .element(initials(screen))
      .toHaveAttribute("aria-haspopup", "menu");
    const menu = await openMenu(screen);

    const items = menu.getByRole("menuitem");
    expect(items.elements()).toHaveLength(1);
    await expect.element(items).toHaveAccessibleName("Sign out");
    await expect.element(items).toHaveFocus();
    expect(menu.getByRole("link").elements()).toHaveLength(0);
  });

  test("signing out returns the header to its signed-out state", async () => {
    signIn();
    const signOuts = { count: 0 };
    worker.use(
      http.delete("/api/session", () => {
        signOuts.count += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const screen = await renderHeader();

    const menu = await openMenu(screen);
    await menu.getByRole("menuitem", { name: "Sign out" }).click();

    await expect.element(initials(screen)).not.toBeInTheDocument();
    await expect.element(contributeLink(screen)).toBeVisible();
    await expect.element(menu).not.toBeInTheDocument();
    expect(signOuts.count).toBe(1);
  });

  test("a failed sign-out keeps the menu open and the header signed in", async () => {
    signIn();
    worker.use(
      http.delete("/api/session", () =>
        HttpResponse.json(
          { type: "about:blank", title: "Internal Server Error", status: 500 },
          { status: 500 },
        ),
      ),
    );
    const screen = await renderHeader();

    const menu = await openMenu(screen);
    await menu.getByRole("menuitem", { name: "Sign out" }).click();

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Sign-out didn't finish. Try again.");
    await expect.element(menu).toBeVisible();
    await expect.element(initials(screen)).toBeVisible();
    await expect
      .element(menu.getByRole("menuitem", { name: "Sign out" }))
      .toBeEnabled();
  });

  test("Escape closes the menu and returns focus to the initials", async () => {
    signIn();
    const screen = await renderHeader();

    const menu = await openMenu(screen);
    await userEvent.keyboard("{Escape}");

    await expect.element(menu).not.toBeVisible();
    await expect.element(initials(screen)).toHaveFocus();
  });

  test("a click outside closes the menu", async () => {
    signIn();
    const screen = await renderHeader();

    const menu = await openMenu(screen);
    await screen.getByText("Page body").click();

    await expect.element(menu).not.toBeVisible();
    await expect.element(initials(screen)).toBeVisible();
  });
});

describe("on the Contribute pages", () => {
  test("signed out, the header shows only the logo", async () => {
    const reads = { count: 0 };
    worker.use(
      http.get("/api/session", () => {
        reads.count += 1;
        return HttpResponse.json({ user: null });
      }),
    );
    const screen = await renderHeader({ contribute: false });

    const header = screen.getByRole("banner");
    await expect.element(header).toBeVisible();
    await expect.poll(() => reads.count).toBe(1);
    expect(header.getByRole("link").elements()).toHaveLength(1);
    expect(header.getByRole("button").elements()).toHaveLength(0);
    expect(header.element().textContent).toBe("Durables");
  });

  test("signed in, the header shows the logo and the initials, with no Contribute button", async () => {
    signIn();
    const screen = await renderHeader({ contribute: false });

    await expect.element(initials(screen)).toBeVisible();
    const header = screen.getByRole("banner");
    expect(
      header
        .getByRole("link")
        .elements()
        .map((link) => link.getAttribute("aria-label")),
    ).toEqual(["Durables home"]);
    expect(
      header
        .getByRole("button")
        .elements()
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Account menu"]);
    expect(
      screen.getByRole("link", { name: /contribute/i }).elements(),
    ).toHaveLength(0);
  });
});
