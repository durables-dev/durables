import type { ReactNode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { PageFrame } from "./page-frame";

// The header holds a Link, so the frame renders inside a router.
function renderFrame(frame: ReactNode) {
  const router = createMemoryRouter([{ path: "/", element: frame }]);
  return render(<RouterProvider router={router} />);
}

function follows(first: Element, second: Element) {
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

test("renders the header, the page's content, then the footer", async () => {
  const screen = await renderFrame(
    <PageFrame>
      <h1>Page content</h1>
    </PageFrame>,
  );

  const header = screen.getByRole("banner");
  const main = screen.getByRole("main");
  const footer = screen.getByRole("contentinfo");
  await expect.element(header).toBeVisible();
  await expect
    .element(main.getByRole("heading", { name: "Page content" }))
    .toBeVisible();
  await expect.element(footer).toBeVisible();
  await expect
    .element(footer.getByRole("navigation", { name: "Footer" }))
    .toBeVisible();
  expect(follows(header.element(), main.element())).toBe(true);
  expect(follows(main.element(), footer.element())).toBe(true);
});

test("leaves out the footer and keeps the header when the page opts out", async () => {
  const screen = await renderFrame(
    <PageFrame footer={false}>
      <h1>Search results</h1>
    </PageFrame>,
  );

  await expect.element(screen.getByRole("banner")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Search results" }))
    .toBeVisible();
  await expect.element(screen.getByRole("contentinfo")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Terms" }).elements()).toEqual([]);
});
