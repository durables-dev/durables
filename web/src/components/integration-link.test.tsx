import "@/styles/global.css";
import { readSearch, searchAddress, type Search } from "@/lib/search-address";
import { testCatalogSdks } from "../../test/sdk-catalog";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { IntegrationLink } from "./integration-link";

// The link renders in a router, with /search standing in for the results page it opens. It is
// given the current search when the test passes one, as the results page does.
async function renderIntegration(integration: string, search?: Search) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element:
          search === undefined ? (
            <IntegrationLink integration={integration} />
          ) : (
            <IntegrationLink integration={integration} search={search} />
          ),
      },
      { path: "/search", element: <h1>Results</h1> },
    ],
    { initialEntries: ["/"] },
  );
  const screen = await render(<RouterProvider router={router} />);
  return Object.assign(screen, { router });
}

type Rendered = Awaited<ReturnType<typeof renderIntegration>>;

/** Clicks the link named `name` and answers the search the address it opened holds. */
async function follow(screen: Rendered, name: string) {
  await screen.getByRole("link", { name, exact: true }).click();
  await expect
    .element(screen.getByRole("heading", { name: "Results" }))
    .toBeVisible();
  const { pathname, search } = screen.router.state.location;
  expect(pathname).toBe("/search");
  return readSearch(new URLSearchParams(search), testCatalogSdks);
}

const currentSearch: Search = {
  words: "charge card",
  sdks: ["Python", "TypeScript"],
  chips: ["Slack", "Amazon S3"],
};

test("an integration on the shared list links to the results for it alone", async () => {
  const screen = await renderIntegration("Amazon S3");

  const link = screen.getByRole("link", { name: "Amazon S3", exact: true });
  expect(link.element().getAttribute("href")).toBe(
    searchAddress({ chips: ["Amazon S3"] }),
  );

  expect(await follow(screen, "Amazon S3")).toEqual({
    words: "",
    sdks: [],
    chips: ["Amazon S3"],
  });
});

test("a workflow pattern links to the results for it alone, like an integration", async () => {
  const screen = await renderIntegration("Saga");

  expect(await follow(screen, "Saga")).toEqual({
    words: "",
    sdks: [],
    chips: ["Saga"],
  });
});

test("an integration not on the shared list shows as plain text", async () => {
  const screen = await renderIntegration("Twilio");

  await expect.element(screen.getByText("Twilio")).toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Twilio" }))
    .not.toBeInTheDocument();
});

test("given the current search, the link replaces the chosen chips and keeps the words and SDKs", async () => {
  const screen = await renderIntegration("Stripe", currentSearch);

  expect(await follow(screen, "Stripe")).toEqual({
    words: "charge card",
    sdks: ["Python", "TypeScript"],
    chips: ["Stripe"],
  });
});

test("given the current search, a pattern replaces the chosen chips the same way", async () => {
  const screen = await renderIntegration("Polling", currentSearch);

  expect(await follow(screen, "Polling")).toEqual({
    words: "charge card",
    sdks: ["Python", "TypeScript"],
    chips: ["Polling"],
  });
});

test("given a search with a category, the link leaves the category in the address", async () => {
  const screen = await renderIntegration("Stripe", {
    ...currentSearch,
    category: "Payments",
  });

  expect(
    screen
      .getByRole("link", { name: "Stripe", exact: true })
      .element()
      .getAttribute("href"),
  ).toContain("category=Payments");
  expect(await follow(screen, "Stripe")).toEqual({
    words: "charge card",
    sdks: ["Python", "TypeScript"],
    chips: ["Stripe"],
    category: "Payments",
  });
});

test("given a search with a publisher, the link drops the publisher", async () => {
  const screen = await renderIntegration("Stripe", {
    ...currentSearch,
    publisher: "ddieruf",
  });

  expect(await follow(screen, "Stripe")).toEqual({
    words: "charge card",
    sdks: ["Python", "TypeScript"],
    chips: ["Stripe"],
  });
});

test("given a search whose only chip is this one, the link opens the same search", async () => {
  const search: Search = {
    words: "charge",
    sdks: ["Python"],
    chips: ["Stripe"],
    category: "Payments",
  };
  const screen = await renderIntegration("Stripe", search);

  expect(
    screen
      .getByRole("link", { name: "Stripe", exact: true })
      .element()
      .getAttribute("href"),
  ).toBe(searchAddress(search));
  expect(await follow(screen, "Stripe")).toEqual(search);
});
