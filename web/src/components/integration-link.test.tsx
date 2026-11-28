import "@/styles/global.css";
import { readSearch, searchAddress } from "@/lib/search-address";
import { testCatalogSdks } from "../../test/sdk-catalog";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { IntegrationLink } from "./integration-link";

// The link renders in a router, with /search standing in for the results page it opens.
async function renderIntegration(integration: string) {
  const router = createMemoryRouter(
    [
      { path: "/", element: <IntegrationLink integration={integration} /> },
      { path: "/search", element: <h1>Results</h1> },
    ],
    { initialEntries: ["/"] },
  );
  const screen = await render(<RouterProvider router={router} />);
  return Object.assign(screen, { router });
}

test("an integration on the shared list links to the results for it alone", async () => {
  const screen = await renderIntegration("Amazon S3");

  const link = screen.getByRole("link", { name: "Amazon S3", exact: true });
  expect(link.element().getAttribute("href")).toBe(
    searchAddress({ chips: ["Amazon S3"] }),
  );
  await link.click();

  await expect
    .element(screen.getByRole("heading", { name: "Results" }))
    .toBeVisible();
  const { pathname, search } = screen.router.state.location;
  expect(readSearch(new URLSearchParams(search), testCatalogSdks)).toEqual({
    words: "",
    sdks: [],
    chips: ["Amazon S3"],
  });
  expect(pathname).toBe("/search");
});

test("an integration not on the shared list shows as plain text", async () => {
  const screen = await renderIntegration("Twilio");

  await expect.element(screen.getByText("Twilio")).toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Twilio" }))
    .not.toBeInTheDocument();
});
