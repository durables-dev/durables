import "@/styles/global.css";
import { routes } from "@/app/router";
import { readSearch, searchAddress } from "@/lib/search-address";
import { testCatalogSdks } from "../../../test/sdk-catalog";
import {
  eightSdkCatalog,
  eightSdks,
  failCatalog,
  serveCatalog,
} from "../../../test/serve-sdk-catalog";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";

// The real route tree, opened at the home page. Only the API is faked: the header reads the
// session, and the results page the home page opens asks the browse read for its search.
async function openHome() {
  const router = createMemoryRouter(routes, { initialEntries: ["/"] });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  await expect.element(screen.getByRole("heading", { level: 1 })).toBeVisible();
  return { router, screen };
}

type Opened = Awaited<ReturnType<typeof openHome>>;

/** What the results page asked the browse read for. */
interface BrowseCall {
  q: string | null;
  sdks: string[];
  integrations: string[];
  publisher: string | null;
}

/** Answers every browse call with no results, and returns the calls as they arrive. */
function serveNoResults(): BrowseCall[] {
  const calls: BrowseCall[] = [];
  worker.use(
    http.get("/api/activities", ({ request }) => {
      const params = new URL(request.url).searchParams;
      const q = params.get("q");
      calls.push({
        q,
        sdks: params.getAll("sdk"),
        integrations: params.getAll("integration"),
        publisher: params.get("publisher"),
      });
      return HttpResponse.json({
        activities: [],
        count: 0,
        sort: (q ?? "").trim() === "" ? "newest" : "relevance",
        nextCursor: null,
      });
    }),
  );
  return calls;
}

function searchBox({ screen }: Opened) {
  return screen.getByRole("searchbox", { name: "Search activities" });
}

function filtersButton({ screen }: Opened) {
  return screen.getByRole("button", { name: /^Filters/ });
}

function searchButton({ screen }: Opened) {
  return screen.getByRole("button", { name: "Search", exact: true });
}

function clearFilters({ screen }: Opened) {
  return screen.getByRole("button", { name: "Clear filters" });
}

function chip({ screen }: Opened, group: string, label: string) {
  return screen
    .getByRole("group", { name: group })
    .getByRole("button", { name: label, exact: true });
}

function sdkChip(opened: Opened, label: string) {
  return chip(opened, "Temporal SDK", label);
}

function integrationChip(opened: Opened, label: string) {
  return chip(opened, "Integrates with", label);
}

/** The pressed state of every chip in a group, in order. */
function pressedIn({ screen }: Opened, group: string) {
  return screen
    .getByRole("group", { name: group })
    .getByRole("button")
    .elements()
    .map((button) => [
      button.textContent,
      button.getAttribute("aria-pressed") === "true",
    ]);
}

async function openFilters(opened: Opened) {
  await filtersButton(opened).click();
  await expect
    .element(opened.screen.getByRole("group", { name: "Temporal SDK" }))
    .toBeVisible();
}

/** The address the router is at, once it has left the home page. */
// Waits for the results page's browse call, so it cannot arrive after this test ends and be
// answered by the next test's handlers.
async function resultsAsked(calls: BrowseCall[]) {
  await expect.poll(() => calls.length).toBe(1);
}

async function landedAt({ router }: Opened) {
  // The first test to arrive loads the results page's chunk, which can take over a second.
  await expect
    .poll(() => router.state.location.pathname, { timeout: 5000 })
    .toBe("/search");
  return `${router.state.location.pathname}${router.state.location.search}`;
}

// The page

test("shows the headline above the search box", async () => {
  const opened = await openHome();

  const headline = opened.screen.getByRole("heading", { level: 1 });
  await expect
    .element(headline)
    .toHaveTextContent("Temporal activities, ready to copy.");
  await expect.element(searchBox(opened)).toBeVisible();
  const headlineBottom = headline.element().getBoundingClientRect().bottom;
  const boxTop = searchBox(opened).element().getBoundingClientRect().top;
  expect(headlineBottom).toBeLessThan(boxTop);
});

test("the search box says what it is for", async () => {
  const opened = await openHome();

  await expect
    .element(searchBox(opened))
    .toHaveAttribute(
      "placeholder",
      "Describe what you need, or just use Filters",
    );
});

test("renders inside the page frame and no longer draws its own page body", async () => {
  const { screen } = await openHome();

  await expect.element(screen.getByRole("banner")).toBeVisible();
  expect(screen.getByRole("main").elements()).toHaveLength(1);
  await expect
    .element(screen.getByRole("main").getByRole("heading", { level: 1 }))
    .toBeVisible();
});

test('sets the tab title to "Durables"', async () => {
  await openHome();

  await expect.poll(() => document.title).toBe("Durables");
});

// Criterion 1: Enter and the Search button both open /search with the words

test("pressing Enter opens /search with the words typed", async () => {
  const calls = serveNoResults();
  const opened = await openHome();

  await searchBox(opened).fill("charge card");
  await userEvent.keyboard("{Enter}");

  expect(await landedAt(opened)).toBe(searchAddress({ words: "charge card" }));
  await expect
    .element(opened.screen.getByRole("heading", { level: 1, name: "Search" }))
    .toBeInTheDocument();
  await expect
    .poll(() => calls)
    .toEqual([
      { q: "charge card", sdks: [], integrations: [], publisher: null },
    ]);
});

test("the Search button opens /search with the words typed", async () => {
  const calls = serveNoResults();
  const opened = await openHome();

  await searchBox(opened).fill("send email");
  await searchButton(opened).click();

  expect(await landedAt(opened)).toBe(searchAddress({ words: "send email" }));
  await resultsAsked(calls);
});

// Criterion 2: words and both filters are carried into the results

test("words with SDK and integration chips open results with both filters applied", async () => {
  const calls = serveNoResults();
  const opened = await openHome();

  await searchBox(opened).fill("charge card");
  await openFilters(opened);
  await sdkChip(opened, "Python").click();
  await sdkChip(opened, ".NET").click();
  await integrationChip(opened, "Stripe").click();
  await integrationChip(opened, "Amazon S3").click();
  await searchButton(opened).click();

  const address = await landedAt(opened);
  expect(address).toBe(
    searchAddress({
      words: "charge card",
      sdks: ["Python", ".NET"],
      integrations: ["Stripe", "Amazon S3"],
    }),
  );
  expect(
    readSearch(new URLSearchParams(address.split("?")[1]), testCatalogSdks),
  ).toEqual({
    words: "charge card",
    sdks: ["Python", ".NET"],
    integrations: ["Stripe", "Amazon S3"],
  });
  await expect
    .poll(() => calls)
    .toEqual([
      {
        q: "charge card",
        sdks: ["Python", ".NET"],
        integrations: ["Stripe", "Amazon S3"],
        publisher: null,
      },
    ]);
  await expect
    .element(
      opened.screen
        .getByRole("complementary", { name: "Filters" })
        .getByRole("button", { name: "Python", exact: true }),
    )
    .toHaveAttribute("aria-pressed", "true");
});

test("filters chosen with the panel closed again are still carried", async () => {
  const calls = serveNoResults();
  const opened = await openHome();

  await openFilters(opened);
  await integrationChip(opened, "Slack").click();
  await filtersButton(opened).click();
  await searchButton(opened).click();

  expect(await landedAt(opened)).toBe(
    searchAddress({ integrations: ["Slack"] }),
  );
  await resultsAsked(calls);
});

// Criterion 3: Explore All opens every activity, newest first, with no filters

test("Explore All sits under the search box and links to /search with nothing set", async () => {
  const opened = await openHome();

  const explore = opened.screen.getByRole("link", { name: "Explore All" });
  await expect.element(explore).toHaveAttribute("href", "/search");
  const boxBottom = searchBox(opened).element().getBoundingClientRect().bottom;
  expect(explore.element().getBoundingClientRect().top).toBeGreaterThan(
    boxBottom,
  );
});

test("Explore All opens every activity newest first, with no filters, even when chips are on", async () => {
  const calls = serveNoResults();
  const opened = await openHome();

  await searchBox(opened).fill("charge");
  await openFilters(opened);
  await sdkChip(opened, "Python").click();
  await opened.screen.getByRole("link", { name: "Explore All" }).click();

  expect(await landedAt(opened)).toBe("/search");
  await expect
    .poll(() => calls)
    .toEqual([{ q: null, sdks: [], integrations: [], publisher: null }]);
  await expect
    .element(opened.screen.getByText("0 activities · sorted by newest"))
    .toBeVisible();
});

// Criterion 4: the Filters button opens the panel, looks pressed, and counts filters on

test("Filters opens and closes the panel and looks pressed while it is open", async () => {
  const opened = await openHome();
  const button = filtersButton(opened);
  const closedBackground = getComputedStyle(button.element()).backgroundColor;

  await expect.element(button).toHaveAttribute("aria-expanded", "false");
  await expect
    .element(opened.screen.getByRole("group", { name: "Temporal SDK" }))
    .not.toBeInTheDocument();

  await button.click();
  await expect.element(button).toHaveAttribute("aria-expanded", "true");
  await expect
    .element(opened.screen.getByRole("group", { name: "Temporal SDK" }))
    .toBeVisible();
  await expect
    .element(opened.screen.getByRole("group", { name: "Integrates with" }))
    .toBeVisible();
  expect(getComputedStyle(button.element()).backgroundColor).not.toBe(
    closedBackground,
  );

  await button.click();
  await expect.element(button).toHaveAttribute("aria-expanded", "false");
  await expect
    .element(opened.screen.getByRole("group", { name: "Temporal SDK" }))
    .not.toBeInTheDocument();
  expect(getComputedStyle(button.element()).backgroundColor).toBe(
    closedBackground,
  );
});

test("the Filters button shows how many filters are on, and no count when none are", async () => {
  const opened = await openHome();

  await expect.element(filtersButton(opened)).toHaveAccessibleName("Filters");

  await openFilters(opened);
  await sdkChip(opened, "TypeScript").click();
  await expect
    .element(filtersButton(opened))
    .toHaveAccessibleName("Filters (1 on)");

  await integrationChip(opened, "Postgres").click();
  await integrationChip(opened, "Slack").click();
  await expect
    .element(filtersButton(opened))
    .toHaveAccessibleName("Filters (3 on)");
  await expect.element(filtersButton(opened)).toHaveTextContent(/3/);

  await sdkChip(opened, "Any").click();
  await expect
    .element(filtersButton(opened))
    .toHaveAccessibleName("Filters (2 on)");
});

// The chips

test("the panel shows the SDK chips with Any on, and only the four integration chips", async () => {
  const opened = await openHome();
  await openFilters(opened);

  await expect
    .element(opened.screen.getByText("What runtime are you using?"))
    .toBeVisible();
  await expect
    .element(opened.screen.getByText("Here is the activity, make it work"))
    .toBeVisible();
  // The SDK chips come with the SDK catalog.
  await expect
    .poll(() => pressedIn(opened, "Temporal SDK"))
    .toEqual([
      ["Any", true],
      ["Python", false],
      ["TypeScript", false],
      [".NET", false],
    ]);
  expect(pressedIn(opened, "Integrates with")).toEqual([
    ["Stripe", false],
    ["Amazon S3", false],
    ["Postgres", false],
    ["Slack", false],
  ]);
  await expect
    .element(opened.screen.getByRole("button", { name: /More/ }))
    .not.toBeInTheDocument();
});

test("with eight SDKs in the catalog, the chips are Any then the eight in catalog order, with Any on", async () => {
  serveCatalog(eightSdkCatalog);
  const opened = await openHome();
  await openFilters(opened);

  await expect
    .poll(() => pressedIn(opened, "Temporal SDK"))
    .toEqual([["Any", true], ...eightSdks.map((sdk) => [sdk, false])]);
});

test("a new SDK's chip carries into the results address alongside another", async () => {
  serveNoResults();
  serveCatalog(eightSdkCatalog);
  const opened = await openHome();
  await openFilters(opened);

  await sdkChip(opened, "Go").click();
  await sdkChip(opened, "Python").click();
  await expect
    .element(sdkChip(opened, "Any"))
    .toHaveAttribute("aria-pressed", "false");
  await searchButton(opened).click();

  expect(await landedAt(opened)).toBe("/search?sdk=Go&sdk=Python");
});

test("when the catalog cannot be read, Home still renders and the only SDK chip is Any", async () => {
  const failed = failCatalog();
  const opened = await openHome();
  await openFilters(opened);
  await failed;

  await expect
    .element(opened.screen.getByText("What runtime are you using?"))
    .toBeVisible();
  expect(pressedIn(opened, "Temporal SDK")).toEqual([["Any", true]]);
  expect(pressedIn(opened, "Integrates with")).toHaveLength(4);
  await expect.element(searchBox(opened)).toBeVisible();
});

// Criterion 6: Any clears the other SDKs; clearing them all returns to Any

test("picking Any while other SDKs are on clears them", async () => {
  const opened = await openHome();
  await openFilters(opened);

  await sdkChip(opened, "Python").click();
  await sdkChip(opened, ".NET").click();
  await expect
    .element(sdkChip(opened, "Any"))
    .toHaveAttribute("aria-pressed", "false");

  await sdkChip(opened, "Any").click();
  expect(pressedIn(opened, "Temporal SDK")).toEqual([
    ["Any", true],
    ["Python", false],
    ["TypeScript", false],
    [".NET", false],
  ]);
});

test("several SDKs can be on, and taking them all off returns to Any", async () => {
  const opened = await openHome();
  await openFilters(opened);

  await sdkChip(opened, "Python").click();
  await sdkChip(opened, "TypeScript").click();
  expect(pressedIn(opened, "Temporal SDK")).toEqual([
    ["Any", false],
    ["Python", true],
    ["TypeScript", true],
    [".NET", false],
  ]);

  await sdkChip(opened, "Python").click();
  await sdkChip(opened, "TypeScript").click();
  await expect
    .element(sdkChip(opened, "Any"))
    .toHaveAttribute("aria-pressed", "true");
});

test("several integrations can be on together", async () => {
  const opened = await openHome();
  await openFilters(opened);

  await integrationChip(opened, "Stripe").click();
  await integrationChip(opened, "Slack").click();
  expect(pressedIn(opened, "Integrates with")).toEqual([
    ["Stripe", true],
    ["Amazon S3", false],
    ["Postgres", false],
    ["Slack", true],
  ]);
});

// Criteria 5 and 7: Clear filters shows only while a filter is on, and resets both

test("Clear filters is hidden while no filter is on", async () => {
  const opened = await openHome();
  await openFilters(opened);

  await expect.element(clearFilters(opened)).not.toBeInTheDocument();

  await integrationChip(opened, "Stripe").click();
  await integrationChip(opened, "Stripe").click();
  await expect.element(clearFilters(opened)).not.toBeInTheDocument();
});

test("Clear filters shows while a filter is on and resets both filters", async () => {
  const opened = await openHome();
  await openFilters(opened);

  await sdkChip(opened, "Python").click();
  await expect.element(clearFilters(opened)).toBeVisible();
  await integrationChip(opened, "Amazon S3").click();
  await integrationChip(opened, "Postgres").click();

  await clearFilters(opened).click();
  expect(pressedIn(opened, "Temporal SDK")).toEqual([
    ["Any", true],
    ["Python", false],
    ["TypeScript", false],
    [".NET", false],
  ]);
  expect(
    pressedIn(opened, "Integrates with").every(([, pressed]) => !pressed),
  ).toBe(true);
  await expect.element(clearFilters(opened)).not.toBeInTheDocument();
  await expect.element(filtersButton(opened)).toHaveAccessibleName("Filters");
});

test("Clear filters keeps the words typed", async () => {
  const calls = serveNoResults();
  const opened = await openHome();

  await searchBox(opened).fill("refund");
  await openFilters(opened);
  await sdkChip(opened, "Python").click();
  await clearFilters(opened).click();
  await expect.element(searchBox(opened)).toHaveValue("refund");
  await searchButton(opened).click();

  expect(await landedAt(opened)).toBe(searchAddress({ words: "refund" }));
  await resultsAsked(calls);
});

// Fringe cases

test("searching with no words and no filters opens every activity", async () => {
  const calls = serveNoResults();
  const opened = await openHome();

  await searchButton(opened).click();

  expect(await landedAt(opened)).toBe("/search");
  await expect
    .poll(() => calls)
    .toEqual([{ q: null, sdks: [], integrations: [], publisher: null }]);
});

test("searching with filters and no words opens the filtered results", async () => {
  const calls = serveNoResults();
  const opened = await openHome();

  await openFilters(opened);
  await sdkChip(opened, ".NET").click();
  await integrationChip(opened, "Postgres").click();
  await searchButton(opened).click();

  const address = await landedAt(opened);
  expect(address).toBe(
    searchAddress({ sdks: [".NET"], integrations: ["Postgres"] }),
  );
  expect(address).not.toContain("q=");
  await expect
    .poll(() => calls)
    .toEqual([
      { q: null, sdks: [".NET"], integrations: ["Postgres"], publisher: null },
    ]);
});
