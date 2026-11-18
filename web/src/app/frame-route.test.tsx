import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../test/test-providers";
import type { RouteHandle } from "./route-handle";
import { routes } from "./router";

// The real route tree, with extra pages added under the frame, as later epics will.
function renderAt(path: string) {
  const [frame] = routes;
  if (!frame || frame.index) throw new Error("Expected the frame layout route");
  const noFooterHandle: RouteHandle = { footer: false };
  const router = createMemoryRouter(
    [
      {
        ...frame,
        children: [
          ...(frame.children ?? []),
          { path: "/elsewhere", element: <h1>Elsewhere</h1> },
          {
            path: "/no-footer",
            element: <h1>No footer</h1>,
            handle: noFooterHandle,
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
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
        name: "Temporal activities, ready to use.",
      }),
    )
    .toBeVisible();
});

test("a page that opts out of the footer keeps the header and has no footer slot", async () => {
  const screen = await renderAt("/no-footer");

  await expect
    .element(screen.getByRole("heading", { name: "No footer" }))
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

test("the header's Contribute pill takes a signed-out visitor to the sign-in step", async () => {
  const router = createMemoryRouter(routes, { initialEntries: ["/"] });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });

  await screen
    .getByRole("banner")
    .getByRole("link", { name: "Contribute" })
    .click();

  await expect
    .element(screen.getByRole("region", { name: "Profile & Handle" }))
    .toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/contribute/profile");
});

test("every page outside the Contribute flow shows the Contribute pill", async () => {
  for (const path of ["/", "/elsewhere", "/search", "/no-such-page"]) {
    const screen = await renderAt(path);

    await expect
      .element(
        screen.getByRole("banner").getByRole("link", { name: "Contribute" }),
      )
      .toBeVisible();
    await screen.unmount();
  }
});

test("signed out, every page outside Contribute and Sign in shows the Sign in link", async () => {
  for (const path of [
    "/",
    "/elsewhere",
    "/search",
    "/terms",
    "/no-such-page",
  ]) {
    const screen = await renderAt(path);

    await expect
      .element(
        screen.getByRole("banner").getByRole("link", { name: "Sign in" }),
      )
      .toBeVisible();
    await screen.unmount();
  }
});

test("the Contribute pages and the Sign in page leave the Sign in link out", async () => {
  for (const [path, heading] of [
    ["/contribute", "Sign in to contribute"],
    ["/contribute/profile", "Sign in to contribute"],
    ["/sign-in", "Sign in"],
  ] as const) {
    const screen = await renderAt(path);

    await expect
      .element(screen.getByRole("heading", { name: heading, exact: true }))
      .toBeVisible();
    await expect
      .element(
        screen.getByRole("banner").getByRole("link", { name: "Sign in" }),
      )
      .not.toBeInTheDocument();
    await screen.unmount();
  }
});
