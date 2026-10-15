import { routes } from "@/app/router";
import "@/styles/global.css";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

const legalPages = [
  { path: "/terms", heading: "Terms", title: "Terms · Durables" },
  { path: "/privacy", heading: "Privacy", title: "Privacy · Durables" },
  { path: "/security", heading: "Security", title: "Security · Durables" },
] as const;

// The real route tree, opened at an address as if typed into the browser. There is no
// QueryClientProvider and no MSW handler, so the pages render with no signed-in state and
// any request to the API would fail the test.
async function openAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

afterEach(async () => {
  await page.viewport(414, 896);
});

test("the three legal addresses are registered inside the page frame", () => {
  const [frame] = routes;
  const paths = frame?.children?.map((route) => route.path);

  expect(frame?.id).toBe("frame");
  expect(paths).toEqual(
    expect.arrayContaining(["/terms", "/privacy", "/security"]),
  );
});

describe.each(legalPages)("$path", ({ path, heading, title }) => {
  test(`shows the "${heading}" heading inside the header frame`, async () => {
    const screen = await openAt(path);

    const main = screen.getByRole("main");
    await expect
      .element(main.getByRole("heading", { level: 1, name: heading }))
      .toBeVisible();
    await expect.element(screen.getByRole("banner")).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Durables home" }))
      .toBeVisible();
    await expect.element(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  test("shows when the text last changed, then the text, below the heading", async () => {
    const screen = await openAt(path);

    const headingLocator = screen.getByRole("heading", {
      level: 1,
      name: heading,
    });
    await expect.element(headingLocator).toBeVisible();
    const headingElement = headingLocator.element();
    const updated = screen.getByText(/^Last updated \d{1,2} \w+ \d{4}$/);
    await expect.element(updated).toBeVisible();

    const [, firstBody] = screen
      .getByRole("main")
      .element()
      .querySelectorAll("p");
    if (!firstBody) throw new Error("Expected text below the date");
    expect(
      headingElement.compareDocumentPosition(updated.element()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      updated.element().compareDocumentPosition(firstBody) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await expect.element(firstBody).toBeVisible();
  });

  test("shows no placeholder text", async () => {
    const screen = await openAt(path);

    await expect
      .element(screen.getByRole("heading", { level: 1, name: heading }))
      .toBeVisible();
    expect(
      screen.getByRole("note", { name: "Placeholder notice" }).elements(),
    ).toEqual([]);
    expect(screen.getByRole("main").element().textContent).not.toMatch(
      /placeholder|the final text/i,
    );
  });

  test("gives every contact address a mail link", async () => {
    const screen = await openAt(path);

    await expect
      .element(screen.getByRole("heading", { level: 1, name: heading }))
      .toBeVisible();
    const mailLinks = screen
      .getByRole("link", { name: /@durables\.dev$/ })
      .elements();
    expect(mailLinks.length).toBeGreaterThan(0);
    for (const link of mailLinks) {
      expect(link.getAttribute("href")).toBe(`mailto:${link.textContent}`);
    }
  });

  test(`sets the tab title to "${title}"`, async () => {
    const screen = await openAt(path);

    await expect
      .element(screen.getByRole("heading", { level: 1, name: heading }))
      .toBeVisible();
    await expect.poll(() => document.title).toBe(title);
  });

  test("is readable with no signed-in state and asks nobody to sign in", async () => {
    const screen = await openAt(path);

    await expect
      .element(screen.getByRole("heading", { level: 1, name: heading }))
      .toBeVisible();
    expect(screen.getByRole("link", { name: /sign in/i }).elements()).toEqual(
      [],
    );
    expect(screen.getByRole("button", { name: /sign in/i }).elements()).toEqual(
      [],
    );
  });

  test("keeps the text column inside a narrow viewport", async () => {
    await page.viewport(320, 640);
    const screen = await openAt(path);

    const article = screen.getByRole("article");
    await expect.element(article).toBeVisible();
    const box = article.element().getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(320);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
  });
});
