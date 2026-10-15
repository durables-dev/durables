import { routes } from "@/app/router";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { HomePage } from "./home-page";

test("shows the headline", async () => {
  const screen = await render(<HomePage />);

  await expect.element(screen.getByRole("heading", { level: 1 })).toBeVisible();
});

test("renders inside the page frame and no longer draws its own page body", async () => {
  const router = createMemoryRouter(routes, { initialEntries: ["/"] });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });

  const headline = screen.getByRole("heading", { level: 1 });
  await expect.element(headline).toBeVisible();
  await expect.element(screen.getByRole("banner")).toBeVisible();
  expect(screen.getByRole("main").elements()).toHaveLength(1);
  await expect
    .element(screen.getByRole("main").getByRole("heading", { level: 1 }))
    .toBeVisible();
});

test('sets the tab title to "Durables"', async () => {
  const router = createMemoryRouter(routes, { initialEntries: ["/"] });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });

  await expect.element(screen.getByRole("heading", { level: 1 })).toBeVisible();
  await expect.poll(() => document.title).toBe("Durables");
});
