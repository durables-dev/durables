import "@/styles/global.css";
import { routes } from "@/app/router";
import { readSearch, searchAddress } from "@/lib/search-address";
import { categories } from "@durables/schemas";
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
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import {
  categoryGroups,
  categoryGroupsWith,
  groupsIn,
} from "../../../test/filter-groups";

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
  chips: string[];
  category: string | null;
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
        chips: params.getAll("chip"),
        category: params.get("category"),
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

/** A filter under its category's heading, such as Stripe under Payments. */
function filterChip(opened: Opened, label: string) {
  const group = categoryGroups.find(({ filters }) =>
    (filters as readonly string[]).includes(label),
  );
  if (group === undefined) {
    throw new Error(`${label} is under no category`);
  }
  return chip(opened, group.name, label);
}

/** The category groups in the Filters panel, after Temporal SDK. */
function categoryGroupsShown({ screen }: Opened) {
  return groupsIn(screen.getByRole("search")).slice(1);
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
    .toHaveTextContent("Temporal activities, ready to use.");
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
      {
        q: "charge card",
        sdks: [],
        chips: [],
        category: null,
        publisher: null,
      },
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
  await filterChip(opened, "Stripe").click();
  await filterChip(opened, "Amazon S3").click();
  await searchButton(opened).click();

  const address = await landedAt(opened);
  expect(address).toBe(
    searchAddress({
      words: "charge card",
      sdks: ["Python", ".NET"],
      chips: ["Stripe", "Amazon S3"],
    }),
  );
  expect(
    readSearch(new URLSearchParams(address.split("?")[1]), testCatalogSdks),
  ).toEqual({
    words: "charge card",
    sdks: ["Python", ".NET"],
    chips: ["Stripe", "Amazon S3"],
  });
  await expect
    .poll(() => calls)
    .toEqual([
      {
        q: "charge card",
        sdks: ["Python", ".NET"],
        chips: ["Stripe", "Amazon S3"],
        category: null,
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
  await filterChip(opened, "Slack").click();
  await filtersButton(opened).click();
  await searchButton(opened).click();

  expect(await landedAt(opened)).toBe(searchAddress({ chips: ["Slack"] }));
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
    .toEqual([
      { q: null, sdks: [], chips: [], category: null, publisher: null },
    ]);
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
    .element(opened.screen.getByRole("group", { name: "AI models" }))
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

  await filterChip(opened, "Postgres").click();
  await filterChip(opened, "Slack").click();
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

test("the panel shows the SDK chips with Any on, then the five category headings with their help lines and filters", async () => {
  const opened = await openHome();
  await openFilters(opened);

  await expect
    .element(opened.screen.getByText("What runtime are you using?"))
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
  expect(
    groupsIn(opened.screen.getByRole("search")).map(({ name }) => name),
  ).toEqual([
    "Temporal SDK",
    "AI models",
    "Data and storage",
    "Messaging",
    "Payments",
    "Workflow patterns",
  ]);
  expect(categoryGroupsShown(opened)).toEqual(categoryGroupsWith());
  for (const { name, help } of categoryGroups) {
    await expect
      .element(opened.screen.getByRole("group", { name, exact: true }))
      .toHaveAccessibleDescription(help);
  }
  await expect
    .element(opened.screen.getByText(/integrates with/i))
    .not.toBeInTheDocument();
  await expect
    .element(opened.screen.getByText("Here is the activity, make it work"))
    .not.toBeInTheDocument();
  await expect
    .element(opened.screen.getByRole("button", { name: "All" }))
    .not.toBeInTheDocument();
  await expect
    .element(opened.screen.getByRole("button", { name: /More/ }))
    .not.toBeInTheDocument();
  expect(opened.screen.container.textContent).not.toMatch(/\bchips?\b/i);
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
  expect(categoryGroupsShown(opened)).toEqual(categoryGroupsWith());
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

test("several filters can be on together, under one heading and under two", async () => {
  const opened = await openHome();
  await openFilters(opened);

  await filterChip(opened, "OpenAI").click();
  await filterChip(opened, "Groq").click();
  await filterChip(opened, "Saga").click();
  expect(categoryGroupsShown(opened)).toEqual(
    categoryGroupsWith("OpenAI", "Groq", "Saga"),
  );

  await filterChip(opened, "Groq").click();
  expect(categoryGroupsShown(opened)).toEqual(
    categoryGroupsWith("OpenAI", "Saga"),
  );
});

// Criteria 5 and 7: Clear filters shows only while a filter is on, and resets both

test("Clear filters is hidden while no filter is on", async () => {
  const opened = await openHome();
  await openFilters(opened);

  await expect.element(clearFilters(opened)).not.toBeInTheDocument();

  await filterChip(opened, "Stripe").click();
  await filterChip(opened, "Stripe").click();
  await expect.element(clearFilters(opened)).not.toBeInTheDocument();
});

test("Clear filters shows while a filter is on and resets both filters", async () => {
  const opened = await openHome();
  await openFilters(opened);

  await sdkChip(opened, "Python").click();
  await expect.element(clearFilters(opened)).toBeVisible();
  await filterChip(opened, "Amazon S3").click();
  await filterChip(opened, "Postgres").click();

  await clearFilters(opened).click();
  expect(pressedIn(opened, "Temporal SDK")).toEqual([
    ["Any", true],
    ["Python", false],
    ["TypeScript", false],
    [".NET", false],
  ]);
  expect(categoryGroupsShown(opened)).toEqual(categoryGroupsWith());
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
    .toEqual([
      { q: null, sdks: [], chips: [], category: null, publisher: null },
    ]);
});

test("searching with filters and no words opens the filtered results", async () => {
  const calls = serveNoResults();
  const opened = await openHome();

  await openFilters(opened);
  await sdkChip(opened, ".NET").click();
  await filterChip(opened, "Postgres").click();
  await searchButton(opened).click();

  const address = await landedAt(opened);
  expect(address).toBe(searchAddress({ sdks: [".NET"], chips: ["Postgres"] }));
  expect(address).not.toContain("q=");
  await expect
    .poll(() => calls)
    .toEqual([
      {
        q: null,
        sdks: [".NET"],
        chips: ["Postgres"],
        category: null,
        publisher: null,
      },
    ]);
});

// Category tiles

const categoryNames = [
  "AI models",
  "Data and storage",
  "Messaging",
  "Payments",
  "Workflow patterns",
];

/** Runs `run` at `width`, then restores the viewport the test started with. */
async function atWidth(width: number, run: () => Promise<void>) {
  const before = { width: window.innerWidth, height: window.innerHeight };
  await page.viewport(width, 900);
  try {
    await run();
  } finally {
    await page.viewport(before.width, before.height);
  }
}

function browseByCategory({ screen }: Opened) {
  return screen.getByRole("region", { name: "Browse by category" });
}

function tiles(opened: Opened) {
  return browseByCategory(opened).getByRole("link");
}

function tile(opened: Opened, name: string) {
  return browseByCategory(opened).getByRole("link", { name, exact: true });
}

function boxOf(element: Element) {
  return element.getBoundingClientRect();
}

/** The SDK and chip buttons pressed in the results page's Filters sidebar. */
function pressedOnResults({ screen }: Opened) {
  return screen
    .getByRole("complementary", { name: "Filters" })
    .getByRole("button", { pressed: true })
    .elements()
    .map((button) => button.textContent);
}

// Criterion 1: a "Browse by category" heading and five tiles in order, below Search

test("shows a Browse by category heading and five tiles in one row below the Search button", async () => {
  await atWidth(1280, async () => {
    const opened = await openHome();

    const heading = opened.screen.getByRole("heading", {
      level: 2,
      name: "Browse by category",
    });
    await expect.element(heading).toBeVisible();
    expect(
      tiles(opened)
        .elements()
        .map((link) => link.textContent),
    ).toEqual(categoryNames);

    const searchBottom = boxOf(searchButton(opened).element()).bottom;
    const headingBox = boxOf(heading.element());
    expect(headingBox.top).toBeGreaterThan(searchBottom);
    const tileBoxes = tiles(opened).elements().map(boxOf);
    for (const box of tileBoxes) {
      expect(box.top).toBeGreaterThan(headingBox.bottom);
      expect(box.top).toBe(tileBoxes[0]?.top);
    }
    // Left to right in list order.
    const lefts = tileBoxes.map((box) => box.left);
    expect(lefts).toEqual([...lefts].sort((a, b) => a - b));
  });
});

test("each tile has its own icon above its name", async () => {
  const opened = await openHome();

  const icons = categoryNames.map((name) => {
    const link = tile(opened, name).element();
    const icon = link.querySelector("svg");
    const label = link.querySelector("span");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(label?.textContent).toBe(name);
    if (icon !== null && label !== null) {
      expect(boxOf(icon).bottom).toBeLessThanOrEqual(boxOf(label).top);
    }
    return icon?.querySelector("path")?.getAttribute("d");
  });
  expect(new Set(icons).size).toBe(categoryNames.length);
});

test("the tiles' names and order come from the shared category list", async () => {
  const opened = await openHome();

  expect(
    tiles(opened)
      .elements()
      .map((link) => link.textContent),
  ).toEqual(categories.map(({ name }) => name));
});

// Criterion 2: a tile opens /search?category=<name> with no filter on

test("each tile links to /search with its category, encoded, and nothing else", async () => {
  const opened = await openHome();

  for (const name of categoryNames) {
    const href = tile(opened, name).element().getAttribute("href") ?? "";
    expect(href).toBe(searchAddress({ category: name as never }));
    expect(href).not.toContain(" ");
    expect(
      readSearch(new URLSearchParams(href.split("?")[1]), testCatalogSdks),
    ).toEqual({ words: "", sdks: [], chips: [], category: name });
  }
  await expect
    .element(tile(opened, "AI models"))
    .toHaveAttribute("href", "/search?category=AI+models");
  await expect
    .element(tile(opened, "Payments"))
    .toHaveAttribute("href", "/search?category=Payments");
});

test("choosing a tile opens the results for its category with no filter on", async () => {
  const calls = serveNoResults();
  const opened = await openHome();

  await tile(opened, "Payments").click();

  expect(await landedAt(opened)).toBe("/search?category=Payments");
  await expect
    .poll(() => calls)
    .toEqual([
      { q: null, sdks: [], chips: [], category: "Payments", publisher: null },
    ]);
  await expect.poll(() => pressedOnResults(opened)).toEqual(["Any"]);
});

test("a category name with spaces opens its results", async () => {
  const calls = serveNoResults();
  const opened = await openHome();

  await tile(opened, "Data and storage").click();

  expect(await landedAt(opened)).toBe("/search?category=Data+and+storage");
  await expect
    .poll(() => calls)
    .toEqual([
      {
        q: null,
        sdks: [],
        chips: [],
        category: "Data and storage",
        publisher: null,
      },
    ]);
});

test("with the Filters panel open and a filter on, a tile still opens its category alone", async () => {
  const calls = serveNoResults();
  const opened = await openHome();

  await searchBox(opened).fill("refund");
  await openFilters(opened);
  await sdkChip(opened, "Python").click();
  await filterChip(opened, "Stripe").click();
  await expect.element(tile(opened, "Messaging")).toBeVisible();
  await tile(opened, "Messaging").click();

  expect(await landedAt(opened)).toBe("/search?category=Messaging");
  await expect
    .poll(() => calls)
    .toEqual([
      { q: null, sdks: [], chips: [], category: "Messaging", publisher: null },
    ]);
});

// Criterion 3: two per row at 640px and narrower

test("at 640px wide the tiles wrap to two per row", async () => {
  await atWidth(640, async () => {
    const opened = await openHome();

    const rows = tiles(opened)
      .elements()
      .map((link) => [boxOf(link).top, boxOf(link).left]);
    const [first, second, third, fourth, fifth] = rows;
    expect(second?.[0]).toBe(first?.[0]);
    expect(third?.[0]).toBeGreaterThan(first?.[0] ?? 0);
    expect(fourth?.[0]).toBe(third?.[0]);
    expect(fifth?.[0]).toBeGreaterThan(third?.[0] ?? 0);
    expect(third?.[1]).toBe(first?.[1]);
    expect(fifth?.[1]).toBe(first?.[1]);
    expect(second?.[1]).toBeGreaterThan(first?.[1] ?? 0);
  });
});

test("at 641px wide the tiles stay in one row", async () => {
  await atWidth(641, async () => {
    const opened = await openHome();

    const tops = tiles(opened)
      .elements()
      .map((link) => boxOf(link).top);
    expect(new Set(tops).size).toBe(1);
  });
});

// Criterion 4: Explore All centred below the tiles; Search alone at the right

test("Explore All sits centred below the tiles", async () => {
  await atWidth(1280, async () => {
    const opened = await openHome();

    const explore = boxOf(
      opened.screen.getByRole("link", { name: "Explore All" }).element(),
    );
    const tileBoxes = tiles(opened).elements().map(boxOf);
    const rowLeft = Math.min(...tileBoxes.map((box) => box.left));
    const rowRight = Math.max(...tileBoxes.map((box) => box.right));
    expect(explore.top).toBeGreaterThan(
      Math.max(...tileBoxes.map((box) => box.bottom)),
    );
    const exploreCentre = (explore.left + explore.right) / 2;
    expect(Math.abs(exploreCentre - (rowLeft + rowRight) / 2)).toBeLessThan(1);
  });
});

test("Search stands alone, right-aligned under the search box", async () => {
  await atWidth(1280, async () => {
    const opened = await openHome();

    const search = boxOf(searchButton(opened).element());
    const form = boxOf(opened.screen.getByRole("search").element());
    expect(Math.abs(search.right - form.right)).toBeLessThan(1);
    expect(search.top).toBeGreaterThan(
      boxOf(searchBox(opened).element()).bottom,
    );

    // No other button or link shares Search's row.
    const main = opened.screen.getByRole("main");
    const beside = [
      ...main.getByRole("button").elements(),
      ...main.getByRole("link").elements(),
    ].filter((element) => {
      const box = boxOf(element);
      return box.bottom > search.top && box.top < search.bottom;
    });
    expect(beside.map((element) => element.textContent)).toEqual(["Search"]);
  });
});

// Criterion 5: no counts on tiles

test("no tile shows a number", async () => {
  const opened = await openHome();

  await expect.element(browseByCategory(opened)).toBeVisible();
  for (const link of tiles(opened).elements()) {
    expect(link.textContent).not.toMatch(/\d/);
  }
  expect(browseByCategory(opened).element().textContent).not.toMatch(/\d/);
});

// Criterion 6: tiles are links reached by Tab, and Enter opens the category

test("the tiles follow Search in tab order, and Enter on one opens its category", async () => {
  const calls = serveNoResults();
  const opened = await openHome();

  searchButton(opened).element().focus();
  await userEvent.tab();
  await expect.element(tile(opened, "AI models")).toHaveFocus();
  await userEvent.tab();
  await expect.element(tile(opened, "Data and storage")).toHaveFocus();
  await userEvent.keyboard("{Enter}");

  expect(await landedAt(opened)).toBe("/search?category=Data+and+storage");
  await resultsAsked(calls);
});

test("every tile is a link named by its category", async () => {
  const opened = await openHome();

  for (const name of categoryNames) {
    await expect.element(tile(opened, name)).toHaveAccessibleName(name);
    expect(tile(opened, name).element().tagName).toBe("A");
  }
});
