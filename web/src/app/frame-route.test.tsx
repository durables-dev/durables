import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import type { RouteHandle } from "./route-handle";
import { routes } from "./router";

// The real route tree, with extra pages added under the frame, as later epics will.
function renderAt(path: string) {
  const [frame] = routes;
  if (!frame || frame.index) throw new Error("Expected the frame layout route");
  const searchHandle: RouteHandle = { footer: false };
  const router = createMemoryRouter(
    [
      {
        ...frame,
        children: [
          ...(frame.children ?? []),
          { path: "/elsewhere", element: <h1>Elsewhere</h1> },
          { path: "/search", element: <h1>Results</h1>, handle: searchHandle },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

test("the logo link takes a visitor home from another page", async () => {
  const screen = await renderAt("/elsewhere");

  await expect
    .element(screen.getByRole("heading", { name: "Elsewhere" }))
    .toBeVisible();
  await screen.getByRole("link", { name: "Durables home" }).click();

  await expect
    .element(
      screen.getByRole("heading", {
        name: "Temporal activities, ready to copy.",
      }),
    )
    .toBeVisible();
});

test("a page that opts out of the footer keeps the header and has no footer slot", async () => {
  const screen = await renderAt("/search");

  await expect
    .element(screen.getByRole("heading", { name: "Results" }))
    .toBeVisible();
  await expect.element(screen.getByRole("banner")).toBeVisible();
  await expect.element(screen.getByRole("contentinfo")).not.toBeInTheDocument();
});

test("a page that does not opt out has the footer slot", async () => {
  const screen = await renderAt("/elsewhere");

  await expect
    .element(screen.getByRole("heading", { name: "Elsewhere" }))
    .toBeVisible();
  await expect.element(screen.getByRole("contentinfo")).toBeInTheDocument();
});

test("an unknown address renders inside the frame, with the logo link home", async () => {
  const screen = await renderAt("/no-such-page");

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Page not found" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Durables home" }))
    .toBeVisible();
  await expect.poll(() => document.title).toBe("Page not found · Durables");
});
