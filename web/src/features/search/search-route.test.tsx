import "@/styles/global.css";
import { routes } from "@/app/router";
import { readSearch, searchAddress } from "@/lib/search-address";
import { testCatalogSdks } from "../../../test/sdk-catalog";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";
import {
  categoryGroups,
  categoryGroupsWith,
  groupsIn,
} from "../../../test/filter-groups";
import { http, HttpResponse } from "msw";
import {
  eightSdkCatalog,
  eightSdks,
  failCatalog,
  holdCatalog,
  serveCatalog,
} from "../../../test/serve-sdk-catalog";
import {
  gate,
  serveBrowse,
  testCard,
  testCards,
  type BrowseCall,
} from "./test-browse";

// The real route tree, opened at an address as if typed into the browser. The header reads
// the session, which the default MSW handler answers as an anonymous visitor. Only the API is
// faked: the browse read answers from test cards.
async function openAt(...paths: string[]) {
  const router = createMemoryRouter(routes, {
    initialEntries: paths,
    initialIndex: paths.length - 1,
  });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  return { router, screen };
}

type Opened = Awaited<ReturnType<typeof openAt>>;

afterEach(async () => {
  await page.viewport(414, 896);
});

/** The search the router's current address holds. */
function currentSearch({ router }: Opened) {
  return readSearch(
    new URLSearchParams(router.state.location.search),
    testCatalogSdks,
  );
}

function searchBox({ screen }: Opened) {
  return screen.getByRole("searchbox", { name: "Search activities" });
}

function sidebar({ screen }: Opened) {
  return screen.getByRole("complementary", { name: "Filters" });
}

function chip(opened: Opened, group: string, label: string) {
  return sidebar(opened)
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

/** The category groups in the sidebar, after Temporal SDK. */
function categoryGroupsShown(opened: Opened) {
  return groupsIn(sidebar(opened)).slice(1);
}

function cards({ screen }: Opened) {
  return screen.getByRole("article");
}

function cardCount(opened: Opened) {
  return cards(opened).elements().length;
}

/** Scrolls the end of the list into view, as reaching the bottom of the page does. */
function scrollToEnd(opened: Opened) {
  const last = cards(opened).last().element();
  last.scrollIntoView({ block: "start" });
}

/** The pressed state of every chip in a group, in order. */
function pressedIn(opened: Opened, group: string) {
  return sidebar(opened)
    .getByRole("group", { name: group })
    .getByRole("button")
    .elements()
    .map((button) => [
      button.textContent,
      button.getAttribute("aria-pressed") === "true",
    ]);
}

const firstCall: BrowseCall = {
  q: null,
  sdks: [],
  chips: [],
  category: null,
  publisher: null,
  cursor: null,
};

const chargeSearch = searchAddress({
  words: "charge & refund café",
  sdks: ["Python", ".NET"],
  chips: ["Stripe", "Amazon S3"],
});

const slackSearch = searchAddress({
  words: "post message",
  sdks: ["TypeScript"],
  chips: ["Slack"],
});

/** Lets any request the page was about to send go out. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 300));
}

// Routing

test("/search is registered inside the page frame", () => {
  const [frame] = routes;
  expect(frame?.children?.map((route) => route.path)).toContain("/search");
});

test("/search opens the results page, not a publisher's page", async () => {
  serveBrowse(testCards(1));
  const { screen } = await openAt("/search");

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Search" }))
    .toBeInTheDocument();
  await expect.element(screen.getByRole("article")).toBeVisible();
  await expect
    .element(screen.getByText("Page not found"))
    .not.toBeInTheDocument();
  await expect.poll(() => document.title).toBe("Search · Durables");
});

// Criterion 1: the page reads its state from the address

test("opening /search with words and filters asks for them and shows them", async () => {
  const calls = serveBrowse([
    testCard(1, { title: "Charge card" }),
    testCard(2, { title: "Refund charge" }),
    testCard(3, { title: "Charge café" }),
  ]);
  const opened = await openAt(chargeSearch);

  await expect.poll(() => cardCount(opened)).toBe(3);
  expect(calls).toEqual([
    {
      q: "charge & refund café",
      sdks: ["Python", ".NET"],
      chips: ["Stripe", "Amazon S3"],
      category: null,
      publisher: null,
      cursor: null,
    },
  ]);
  await expect.element(searchBox(opened)).toHaveValue("charge & refund café");
  await expect
    .element(opened.screen.getByText("3 activities · sorted by relevance"))
    .toBeVisible();
  await expect
    .element(opened.screen.getByRole("heading", { name: "Charge card" }))
    .toBeVisible();
});

test("filters carried in from the address show as selected chips", async () => {
  serveBrowse(testCards(1));
  const opened = await openAt(chargeSearch);

  await expect
    .element(sdkChip(opened, "Python"))
    .toHaveAttribute("aria-pressed", "true");
  expect(pressedIn(opened, "Temporal SDK")).toEqual([
    ["Any", false],
    ["Python", true],
    ["TypeScript", false],
    [".NET", true],
  ]);
  expect(categoryGroupsShown(opened)).toEqual(
    categoryGroupsWith("Stripe", "Amazon S3"),
  );
});

test("an address with no parameters asks for every activity, with Any on", async () => {
  const calls = serveBrowse(testCards(2));
  const opened = await openAt("/search");

  await expect.poll(() => cardCount(opened)).toBe(2);
  expect(calls).toEqual([firstCall]);
  await expect.element(searchBox(opened)).toHaveValue("");
  expect(pressedIn(opened, "Temporal SDK")).toEqual([
    ["Any", true],
    ["Python", false],
    ["TypeScript", false],
    [".NET", false],
  ]);
  expect(categoryGroupsShown(opened)).toEqual(categoryGroupsWith());
});

test("a publisher in the address is asked for", async () => {
  const calls = serveBrowse(testCards(1));
  const opened = await openAt(searchAddress({ publisher: "ddieruf" }));

  await expect.poll(() => cardCount(opened)).toBe(1);
  expect(calls).toEqual([{ ...firstCall, publisher: "ddieruf" }]);
});

test("unknown SDK and chip values in the address are ignored", async () => {
  const calls = serveBrowse(testCards(1));
  const opened = await openAt("/search?sdk=Java&chip=Twilio&chip=Slack");

  await expect.poll(() => cardCount(opened)).toBe(1);
  expect(calls).toEqual([{ ...firstCall, chips: ["Slack"] }]);
  await expect
    .element(sdkChip(opened, "Any"))
    .toHaveAttribute("aria-pressed", "true");
  await expect
    .element(filterChip(opened, "Slack"))
    .toHaveAttribute("aria-pressed", "true");
  // An unknown filter shows nowhere: no heading lists it and nothing is on in its place.
  await expect
    .element(opened.screen.getByText("Twilio"))
    .not.toBeInTheDocument();
  expect(categoryGroupsShown(opened)).toEqual(categoryGroupsWith("Slack"));
});

test("the chosen filters go to the api as chip, never as integration", async () => {
  const sent: URLSearchParams[] = [];
  worker.use(
    http.get("/api/activities", ({ request }) => {
      sent.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        activities: [testCard(1)],
        count: 1,
        sort: "newest",
        nextCursor: null,
      });
    }),
  );
  const opened = await openAt("/search?chip=Stripe&chip=Slack");

  await expect.poll(() => cardCount(opened)).toBe(1);
  expect(sent.map((params) => params.getAll("chip"))).toEqual([
    ["Stripe", "Slack"],
  ]);
  expect(sent.map((params) => params.has("integration"))).toEqual([false]);
});

// Chips and the category in the address

test("a chip in the address is read ignoring case and shows as on", async () => {
  const calls = serveBrowse(testCards(1));
  const opened = await openAt("/search?chip=stripe&chip=SLACK");

  await expect.poll(() => cardCount(opened)).toBe(1);
  expect(calls).toEqual([{ ...firstCall, chips: ["Stripe", "Slack"] }]);
  await expect
    .element(filterChip(opened, "Stripe"))
    .toHaveAttribute("aria-pressed", "true");
  await expect
    .element(filterChip(opened, "Slack"))
    .toHaveAttribute("aria-pressed", "true");
});

test("an SDK in the address is read ignoring case", async () => {
  const calls = serveBrowse(testCards(1));
  const opened = await openAt("/search?sdk=python");

  await expect.poll(() => cardCount(opened)).toBe(1);
  expect(calls).toEqual([{ ...firstCall, sdks: ["Python"] }]);
  await expect
    .element(sdkChip(opened, "Python"))
    .toHaveAttribute("aria-pressed", "true");
});

test("a category in the address is asked for and turns no chip on", async () => {
  const calls = serveBrowse(testCards(1));
  const opened = await openAt("/search?category=payments");

  await expect.poll(() => cardCount(opened)).toBe(1);
  expect(calls).toEqual([{ ...firstCall, category: "Payments" }]);
  expect(categoryGroupsShown(opened)).toEqual(categoryGroupsWith());
  expect(currentSearch(opened)).toEqual({
    words: "",
    sdks: [],
    chips: [],
    category: "Payments",
  });
});

test("of several categories in the address, the api is sent the first alone", async () => {
  const sent: URLSearchParams[] = [];
  worker.use(
    http.get("/api/activities", ({ request }) => {
      sent.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        activities: [testCard(1)],
        count: 1,
        sort: "newest",
        nextCursor: null,
      });
    }),
  );
  const opened = await openAt(
    "/search?category=Payments&category=Messaging&chip=Stripe",
  );

  await expect.poll(() => cardCount(opened)).toBe(1);
  expect(sent.map((params) => params.getAll("category"))).toEqual([
    ["Payments"],
  ]);
  expect(sent.map((params) => params.getAll("chip"))).toEqual([["Stripe"]]);
});

test("an unknown chip and an unknown category in the address are dropped", async () => {
  const calls = serveBrowse(testCards(1));
  const opened = await openAt("/search?chip=Nonsense&category=Shipping");

  await expect.poll(() => cardCount(opened)).toBe(1);
  expect(calls).toEqual([firstCall]);
  expect(currentSearch(opened)).toEqual({ words: "", sdks: [], chips: [] });
});

test("the old integration parameter turns nothing on", async () => {
  const calls = serveBrowse(testCards(1));
  const opened = await openAt("/search?integration=Stripe");

  await expect.poll(() => cardCount(opened)).toBe(1);
  expect(calls).toEqual([firstCall]);
  await expect
    .element(filterChip(opened, "Stripe"))
    .toHaveAttribute("aria-pressed", "false");
});

test("turning a chip on keeps the category in the address, and turning it off leaves the category", async () => {
  const calls = serveBrowse(testCards(1));
  const opened = await openAt("/search?category=Payments");
  await expect.poll(() => cardCount(opened)).toBe(1);

  await filterChip(opened, "Stripe").click();

  await expect
    .poll(() => opened.router.state.location.search)
    .toBe("?chip=Stripe&category=Payments");
  await expect
    .poll(() => calls.at(-1))
    .toEqual({ ...firstCall, chips: ["Stripe"], category: "Payments" });

  await filterChip(opened, "Stripe").click();

  await expect
    .poll(() => opened.router.state.location.search)
    .toBe("?category=Payments");
  await expect
    .poll(() => calls.at(-1))
    .toEqual({ ...firstCall, category: "Payments" });
});

test("opening the same address again, as a refresh does, shows the same search", async () => {
  serveBrowse(testCards(1));
  const first = await openAt(chargeSearch);
  await expect.element(searchBox(first)).toHaveValue("charge & refund café");
  await first.screen.unmount();

  const calls = serveBrowse(testCards(1));
  const second = await openAt(chargeSearch);

  await expect.element(searchBox(second)).toHaveValue("charge & refund café");
  await expect
    .element(sdkChip(second, ".NET"))
    .toHaveAttribute("aria-pressed", "true");
  // The box and chips come from the address before the browse request goes out, so wait for it.
  await expect
    .poll(() => calls[0])
    .toMatchObject({
      q: "charge & refund café",
      sdks: ["Python", ".NET"],
      chips: ["Stripe", "Amazon S3"],
    });
});

test("Back returns to the previous search's words and filters", async () => {
  serveBrowse(testCards(1));
  const opened = await openAt(chargeSearch, slackSearch);
  await expect.element(searchBox(opened)).toHaveValue("post message");

  await opened.router.navigate(-1);

  await expect.element(searchBox(opened)).toHaveValue("charge & refund café");
  await expect
    .element(sdkChip(opened, "Python"))
    .toHaveAttribute("aria-pressed", "true");
  await expect
    .element(filterChip(opened, "Slack"))
    .toHaveAttribute("aria-pressed", "false");
});

// Criteria 2 and 4: Enter submits the words; typing alone sends nothing

test("pressing Enter submits the words, puts them in the address and sorts by relevance", async () => {
  const calls = serveBrowse(testCards(4));
  const opened = await openAt(searchAddress({ sdks: ["Python"] }));
  await expect
    .element(opened.screen.getByText("4 activities · sorted by newest"))
    .toBeVisible();

  await searchBox(opened).fill("charge card");
  await userEvent.keyboard("{Enter}");

  await expect
    .element(opened.screen.getByText("4 activities · sorted by relevance"))
    .toBeVisible();
  expect(currentSearch(opened)).toEqual({
    words: "charge card",
    sdks: ["Python"],
    chips: [],
  });
  expect(calls.at(-1)).toEqual({
    ...firstCall,
    q: "charge card",
    sdks: ["Python"],
  });
  await expect.element(searchBox(opened)).toHaveValue("charge card");
});

test("typing words without pressing Enter sends no request", async () => {
  const calls = serveBrowse(testCards(2));
  const opened = await openAt("/search");
  await expect.poll(() => cardCount(opened)).toBe(2);
  expect(calls).toHaveLength(1);

  await searchBox(opened).fill("charge");
  await userEvent.type(searchBox(opened), " card");
  await settle();

  expect(calls).toHaveLength(1);
  expect(currentSearch(opened).words).toBe("");
  await expect
    .element(opened.screen.getByText("2 activities · sorted by newest"))
    .toBeVisible();
});

// Criterion 3: a chip applies at once

test("clicking a chip applies it at once and puts it in the address", async () => {
  const python = testCard(1, { sdk: "Python" });
  const typescript = testCard(2, { sdk: "TypeScript" });
  const calls = serveBrowse([python, typescript], {
    matching: (call) =>
      [python, typescript].filter(
        (card) => call.sdks.length === 0 || call.sdks.includes(card.sdk),
      ),
  });
  const opened = await openAt("/search");
  await expect.poll(() => cardCount(opened)).toBe(2);

  await sdkChip(opened, "TypeScript").click();

  await expect.poll(() => cardCount(opened)).toBe(1);
  await expect
    .element(opened.screen.getByRole("heading", { name: "Activity 2" }))
    .toBeVisible();
  expect(currentSearch(opened).sdks).toEqual(["TypeScript"]);
  expect(calls.at(-1)).toEqual({ ...firstCall, sdks: ["TypeScript"] });
  await expect
    .element(sdkChip(opened, "TypeScript"))
    .toHaveAttribute("aria-pressed", "true");
});

test("a chip click carries the words in the address, not words typed but not submitted", async () => {
  const calls = serveBrowse(testCards(1));
  const opened = await openAt(searchAddress({ words: "charge" }));
  await expect.poll(() => cardCount(opened)).toBe(1);

  await searchBox(opened).fill("refund");
  await filterChip(opened, "Stripe").click();

  await expect.poll(() => calls.length).toBe(2);
  expect(calls[1]).toEqual({
    ...firstCall,
    q: "charge",
    chips: ["Stripe"],
  });
  expect(currentSearch(opened)).toEqual({
    words: "charge",
    sdks: [],
    chips: ["Stripe"],
  });
});

// The SDK chips' Any rule, and several integrations

test("picking Any clears the other SDKs", async () => {
  serveBrowse(testCards(1));
  const opened = await openAt(searchAddress({ sdks: ["Python", ".NET"] }));
  await expect.poll(() => cardCount(opened)).toBe(1);

  await sdkChip(opened, "Any").click();

  await expect
    .element(sdkChip(opened, "Any"))
    .toHaveAttribute("aria-pressed", "true");
  expect(currentSearch(opened).sdks).toEqual([]);
  expect(pressedIn(opened, "Temporal SDK")).toEqual([
    ["Any", true],
    ["Python", false],
    ["TypeScript", false],
    [".NET", false],
  ]);
});

test("picking an SDK turns Any off, and clearing every SDK returns to Any", async () => {
  serveBrowse(testCards(1));
  const opened = await openAt("/search");
  await expect.poll(() => cardCount(opened)).toBe(1);

  await sdkChip(opened, "Python").click();
  await sdkChip(opened, ".NET").click();

  await expect
    .element(sdkChip(opened, "Any"))
    .toHaveAttribute("aria-pressed", "false");
  expect(currentSearch(opened).sdks).toEqual(["Python", ".NET"]);

  await sdkChip(opened, "Python").click();
  await sdkChip(opened, ".NET").click();

  await expect
    .element(sdkChip(opened, "Any"))
    .toHaveAttribute("aria-pressed", "true");
  expect(currentSearch(opened).sdks).toEqual([]);
});

test("several integrations can be picked together", async () => {
  const calls = serveBrowse(testCards(1));
  const opened = await openAt("/search");
  await expect.poll(() => cardCount(opened)).toBe(1);

  await filterChip(opened, "Stripe").click();
  await filterChip(opened, "Slack").click();

  await expect
    .element(filterChip(opened, "Slack"))
    .toHaveAttribute("aria-pressed", "true");
  await expect
    .element(filterChip(opened, "Stripe"))
    .toHaveAttribute("aria-pressed", "true");
  expect(currentSearch(opened).chips).toEqual(["Stripe", "Slack"]);
  await expect.poll(() => calls.at(-1)?.chips).toEqual(["Stripe", "Slack"]);
});

// Category headings (DUR-131)

test("the sidebar shows Temporal SDK first, then the five category headings with their help lines and filters", async () => {
  serveBrowse(testCards(1));
  const opened = await openAt("/search");
  await expect.poll(() => cardCount(opened)).toBe(1);

  await expect
    .poll(() => groupsIn(sidebar(opened)).map(({ name }) => name))
    .toEqual([
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
      .element(sidebar(opened).getByRole("group", { name, exact: true }))
      .toHaveAccessibleDescription(help);
    await expect.element(sidebar(opened).getByText(help)).toBeVisible();
  }
});

test("Workflow patterns lists Approval, Polling, Batching and Saga", async () => {
  serveBrowse(testCards(1));
  const opened = await openAt("/search");

  await expect
    .element(filterChip(opened, "Saga"))
    .toHaveAttribute("aria-pressed", "false");
  expect(
    sidebar(opened)
      .getByRole("group", { name: "Workflow patterns" })
      .getByRole("button")
      .elements()
      .map((button) => button.textContent),
  ).toEqual(["Approval", "Polling", "Batching", "Saga"]);
});

test("there is no All filter, and no heading can be picked", async () => {
  serveBrowse(testCards(1));
  const opened = await openAt("/search");
  await expect.poll(() => cardCount(opened)).toBe(1);

  await expect
    .element(sidebar(opened).getByRole("button", { name: "All" }))
    .not.toBeInTheDocument();
  for (const { name } of categoryGroups) {
    await expect
      .element(sidebar(opened).getByRole("button", { name, exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(sidebar(opened).getByRole("checkbox", { name, exact: true }))
      .not.toBeInTheDocument();
  }
  expect(sidebar(opened).element().querySelectorAll("[title]")).toHaveLength(0);
});

test("clicking a filter turns on that filter alone, and clicking it again turns it off", async () => {
  const calls = serveBrowse(testCards(1));
  const opened = await openAt("/search");
  await expect.poll(() => cardCount(opened)).toBe(1);

  await filterChip(opened, "Polling").click();

  await expect
    .element(filterChip(opened, "Polling"))
    .toHaveAttribute("aria-pressed", "true");
  expect(categoryGroupsShown(opened)).toEqual(categoryGroupsWith("Polling"));
  expect(pressedIn(opened, "Temporal SDK")[0]).toEqual(["Any", true]);
  expect(currentSearch(opened)).toEqual({
    words: "",
    sdks: [],
    chips: ["Polling"],
  });
  await expect.poll(() => calls.at(-1)?.chips).toEqual(["Polling"]);

  await filterChip(opened, "Polling").click();

  await expect
    .element(filterChip(opened, "Polling"))
    .toHaveAttribute("aria-pressed", "false");
  expect(categoryGroupsShown(opened)).toEqual(categoryGroupsWith());
  expect(currentSearch(opened)).toEqual({ words: "", sdks: [], chips: [] });
});

test("filters on under two headings both show as on", async () => {
  serveBrowse(testCards(1));
  const opened = await openAt("/search?chip=Slack&chip=Polling");

  await expect
    .element(filterChip(opened, "Slack"))
    .toHaveAttribute("aria-pressed", "true");
  expect(categoryGroupsShown(opened)).toEqual(
    categoryGroupsWith("Slack", "Polling"),
  );
});

test("no Integrates with list, and no word chip, appears on the page", async () => {
  serveBrowse(testCards(3));
  const opened = await openAt("/search?chip=Stripe&category=Payments");
  await expect.poll(() => cardCount(opened)).toBe(3);

  await expect
    .element(opened.screen.getByText(/integrates with/i))
    .not.toBeInTheDocument();
  await expect
    .element(opened.screen.getByRole("group", { name: /integrates with/i }))
    .not.toBeInTheDocument();
  const text = opened.screen.container.textContent;
  expect(text).not.toMatch(/\bchips?\b/i);
  const labels = [
    ...opened.screen.container.querySelectorAll("[aria-label]"),
  ].map((element) => element.getAttribute("aria-label"));
  expect(labels.join(" ")).not.toMatch(/\bchips?\b/i);
});

// Clear (n)

test("Clear (n) is absent when no filter is on", async () => {
  serveBrowse(testCards(1));
  const opened = await openAt(searchAddress({ words: "charge" }));
  await expect.poll(() => cardCount(opened)).toBe(1);

  await expect
    .element(sidebar(opened).getByRole("button", { name: /^Clear/ }))
    .not.toBeInTheDocument();
});

test("Clear (n) counts the filters that are on and clears them all, keeping the words", async () => {
  const calls = serveBrowse(testCards(1));
  const opened = await openAt(
    searchAddress({
      words: "charge",
      sdks: ["Python", "TypeScript"],
      chips: ["Stripe"],
    }),
  );
  const clear = sidebar(opened).getByRole("button", { name: "Clear (3)" });
  await expect.element(clear).toBeVisible();

  await clear.click();

  await expect
    .element(sidebar(opened).getByRole("button", { name: /^Clear/ }))
    .not.toBeInTheDocument();
  expect(currentSearch(opened)).toEqual({
    words: "charge",
    sdks: [],
    chips: [],
  });
  await expect.poll(() => calls.at(-1)).toEqual({ ...firstCall, q: "charge" });
  await expect.element(searchBox(opened)).toHaveValue("charge");
});

test("a category in the address counts as a filter on its own, and Clear (1) removes it", async () => {
  serveBrowse(testCards(1));
  const opened = await openAt("/search?category=Payments");

  await sidebar(opened).getByRole("button", { name: "Clear (1)" }).click();

  await expect
    .poll(() => currentSearch(opened))
    .toEqual({ words: "", sdks: [], chips: [] });
  expect(opened.router.state.location.search).toBe("");
});

test("with the category Workflow patterns and Saga on, Clear reads Clear (2) and removes both, keeping the words", async () => {
  const calls = serveBrowse(testCards(1));
  const opened = await openAt(
    "/search?q=refund&chip=Saga&category=Workflow+patterns",
  );
  const clear = sidebar(opened).getByRole("button", { name: "Clear (2)" });
  await expect.element(clear).toBeVisible();

  await clear.click();

  await expect
    .element(sidebar(opened).getByRole("button", { name: /^Clear/ }))
    .not.toBeInTheDocument();
  expect(opened.router.state.location.search).toBe("?q=refund");
  await expect.poll(() => calls.at(-1)).toEqual({ ...firstCall, q: "refund" });
  await expect.element(searchBox(opened)).toHaveValue("refund");
});

test("Clear (n) counts each SDK, each filter, the category and the publisher, not the words, and clears them all", async () => {
  const calls = serveBrowse(testCards(1));
  const opened = await openAt(
    searchAddress({
      words: "charge card",
      sdks: ["Python", ".NET"],
      chips: ["Stripe", "Approval"],
      category: "Payments",
      publisher: "ddieruf",
    }),
  );
  const clear = sidebar(opened).getByRole("button", { name: "Clear (6)" });
  await expect.element(clear).toBeVisible();

  await clear.click();

  await expect
    .poll(() => currentSearch(opened))
    .toEqual({ words: "charge card", sdks: [], chips: [] });
  expect(categoryGroupsShown(opened)).toEqual(categoryGroupsWith());
  expect(pressedIn(opened, "Temporal SDK")[0]).toEqual(["Any", true]);
  await expect
    .poll(() => calls.at(-1))
    .toEqual({ ...firstCall, q: "charge card" });
});

test("a publisher counts as a filter and Clear (n) clears it", async () => {
  serveBrowse(testCards(1));
  const opened = await openAt(searchAddress({ publisher: "ddieruf" }));

  await sidebar(opened).getByRole("button", { name: "Clear (1)" }).click();

  await expect
    .poll(() => currentSearch(opened))
    .toEqual({ words: "", sdks: [], chips: [] });
});

// Count line (criteria 2 and 9) and the grid

test("the count line shows the total of every match, not the cards loaded, sorted by newest with no words", async () => {
  serveBrowse(testCards(120));
  const opened = await openAt("/search");

  await expect.poll(() => cardCount(opened)).toBe(50);
  await expect
    .element(opened.screen.getByText("120 activities · sorted by newest"))
    .toBeVisible();
});

test("one match reads as one activity", async () => {
  serveBrowse(testCards(1));
  const opened = await openAt(searchAddress({ words: "charge" }));

  await expect
    .element(opened.screen.getByText("1 activity · sorted by relevance"))
    .toBeVisible();
});

test("the grid shows one card per result", async () => {
  serveBrowse([
    testCard(1, { title: "Charge card" }),
    testCard(2, { title: "Refund charge" }),
    testCard(3, { title: "Post Slack message" }),
  ]);
  const opened = await openAt("/search");

  await expect.poll(() => cardCount(opened)).toBe(3);
  for (const title of ["Charge card", "Refund charge", "Post Slack message"]) {
    await expect
      .element(opened.screen.getByRole("article", { name: title }))
      .toBeVisible();
  }
});

test("cards sit two per row on a wide screen", async () => {
  await page.viewport(1280, 900);
  serveBrowse(testCards(4));
  const opened = await openAt("/search");
  await expect.poll(() => cardCount(opened)).toBe(4);

  const [first, second, third] = cards(opened)
    .elements()
    .map((card) => card.getBoundingClientRect());
  expect(second?.top).toBe(first?.top);
  expect(second?.left).toBeGreaterThan(first?.right ?? Infinity);
  expect(third?.top).toBeGreaterThan(first?.bottom ?? Infinity);
});

test("cards sit one per row on a narrow screen", async () => {
  await page.viewport(414, 896);
  serveBrowse(testCards(2));
  const opened = await openAt("/search");
  await expect.poll(() => cardCount(opened)).toBe(2);

  const [first, second] = cards(opened)
    .elements()
    .map((card) => card.getBoundingClientRect());
  expect(second?.left).toBe(first?.left);
  expect(second?.top).toBeGreaterThan(first?.bottom ?? Infinity);
});

// Criterion 5: batches of 50

test("reaching the bottom loads the next 50, with Loading more… meanwhile", async () => {
  const second = gate();
  const calls = serveBrowse(testCards(120), {
    before: (call) => (call.cursor === null ? undefined : second.opened),
  });
  const opened = await openAt("/search");
  await expect.poll(() => cardCount(opened)).toBe(50);
  await expect
    .element(opened.screen.getByText("That’s every match."))
    .not.toBeInTheDocument();

  scrollToEnd(opened);

  await expect.element(opened.screen.getByText("Loading more…")).toBeVisible();
  expect(calls).toHaveLength(2);
  expect(calls[1]?.cursor).toBe("50");
  second.open();
  await expect.poll(() => cardCount(opened)).toBe(100);
  await expect
    .element(opened.screen.getByText("Loading more…"))
    .not.toBeInTheDocument();
  await expect
    .element(opened.screen.getByRole("heading", { name: "Activity 100" }))
    .toBeInTheDocument();
});

test("That’s every match. shows after the last batch", async () => {
  serveBrowse(testCards(120));
  const opened = await openAt("/search");
  await expect.poll(() => cardCount(opened)).toBe(50);

  scrollToEnd(opened);
  await expect.poll(() => cardCount(opened)).toBe(100);
  await expect
    .element(opened.screen.getByText("That’s every match."))
    .not.toBeInTheDocument();
  scrollToEnd(opened);

  await expect.poll(() => cardCount(opened)).toBe(120);
  await expect
    .element(opened.screen.getByText("That’s every match."))
    .toBeVisible();
  await expect
    .element(opened.screen.getByText("120 activities · sorted by newest"))
    .toBeVisible();
});

test("That’s every match. shows at once when one batch holds every match", async () => {
  const calls = serveBrowse(testCards(3));
  const opened = await openAt("/search");

  await expect
    .element(opened.screen.getByText("That’s every match."))
    .toBeVisible();
  scrollToEnd(opened);
  await settle();
  expect(calls).toHaveLength(1);
});

test("a failure on a later batch keeps the cards already shown", async () => {
  let failing = true;
  const calls = serveBrowse(testCards(120), {
    fails: (call) => call.cursor !== null && failing,
  });
  const opened = await openAt("/search");
  await expect.poll(() => cardCount(opened)).toBe(50);

  scrollToEnd(opened);

  await expect
    .element(opened.screen.getByText("More activities could not be loaded."))
    .toBeVisible();
  await expect.poll(() => cardCount(opened)).toBe(50);
  await expect
    .element(opened.screen.getByText("120 activities · sorted by newest"))
    .toBeVisible();
  await expect
    .element(opened.screen.getByText("Something went wrong"))
    .not.toBeInTheDocument();

  failing = false;
  await opened.screen.getByRole("button", { name: "Try again" }).click();

  await expect.poll(() => cardCount(opened)).toBe(100);
  expect(calls.at(-1)?.cursor).toBe("50");
});

test("changing a filter starts again from the first batch", async () => {
  const calls = serveBrowse(testCards(120));
  const opened = await openAt("/search");
  await expect.poll(() => cardCount(opened)).toBe(50);
  scrollToEnd(opened);
  await expect.poll(() => cardCount(opened)).toBe(100);

  await filterChip(opened, "Postgres").click();

  await expect
    .poll(() => calls.at(-1))
    .toEqual({ ...firstCall, chips: ["Postgres"] });
  await expect
    .element(filterChip(opened, "Postgres"))
    .toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => cardCount(opened)).toBe(50);
});

test("changing the words starts again from the first batch", async () => {
  const calls = serveBrowse(testCards(120));
  const opened = await openAt("/search");
  await expect.poll(() => cardCount(opened)).toBe(50);
  scrollToEnd(opened);
  await expect.poll(() => cardCount(opened)).toBe(100);

  await searchBox(opened).fill("charge");
  await userEvent.keyboard("{Enter}");

  await expect.poll(() => calls.at(-1)).toEqual({ ...firstCall, q: "charge" });
  await expect
    .element(opened.screen.getByText("120 activities · sorted by relevance"))
    .toBeVisible();
  await expect.poll(() => cardCount(opened)).toBe(50);
});

test("an answer that arrives after a newer change is ignored", async () => {
  const old = gate();
  const everyActivity = testCard(1, { title: "Old answer", sdk: "Python" });
  const dotnet = testCard(2, { title: "New answer", sdk: ".NET" });
  serveBrowse([], {
    matching: (call) => (call.sdks.length === 0 ? [everyActivity] : [dotnet]),
    before: (call) => (call.sdks.length === 0 ? old.opened : undefined),
  });
  const opened = await openAt("/search");
  await expect
    .element(opened.screen.getByText("Loading activities…"))
    .toBeVisible();

  await sdkChip(opened, ".NET").click();
  await expect
    .element(opened.screen.getByRole("heading", { name: "New answer" }))
    .toBeVisible();
  old.open();
  await settle();

  await expect.poll(() => cardCount(opened)).toBe(1);
  await expect
    .element(opened.screen.getByRole("heading", { name: "New answer" }))
    .toBeVisible();
  await expect
    .element(opened.screen.getByText("Old answer"))
    .not.toBeInTheDocument();
  await expect
    .element(opened.screen.getByText("1 activity · sorted by newest"))
    .toBeVisible();
});

// The category pill (DUR-133)

/** The pill naming the category that applies, by its accessible name. */
function categoryPill({ screen }: Opened, category: string) {
  return screen.getByRole("button", { name: `Remove ${category}` });
}

/** Any category pill, whatever its category. */
function anyCategoryPill({ screen }: Opened) {
  return screen.getByRole("button", { name: /^Remove / });
}

function countLineOf({ screen }: Opened) {
  return screen.getByText(/activit(y|ies) · sorted by/);
}

test("with a category and no chip, the pill reads the category and sits beside the count line", async () => {
  await page.viewport(1280, 900);
  serveBrowse(testCards(3));
  const opened = await openAt("/search?category=payments");

  const pill = categoryPill(opened, "Payments");
  await expect.element(pill).toBeVisible();
  await expect.element(pill).toHaveTextContent("Payments ×");
  await expect
    .element(countLineOf(opened))
    .toHaveTextContent("3 activities · sorted by newest");

  const pillBox = pill.element().getBoundingClientRect();
  const countBox = countLineOf(opened).element().getBoundingClientRect();
  const firstCard = cards(opened).first().element().getBoundingClientRect();
  // Same row: the pill starts after the count line ends, and their middles line up.
  expect(pillBox.left).toBeGreaterThanOrEqual(countBox.right);
  expect(
    Math.abs(
      pillBox.top + pillBox.height / 2 - (countBox.top + countBox.height / 2),
    ),
  ).toBeLessThan(4);
  // Above the results.
  expect(pillBox.bottom).toBeLessThanOrEqual(firstCard.top);
});

test("the pill's accessible name says it removes the category", async () => {
  serveBrowse(testCards(1));
  const opened = await openAt("/search?category=Messaging");

  await expect
    .element(categoryPill(opened, "Messaging"))
    .toHaveAccessibleName("Remove Messaging");
});

test("the pill sits outside the count line's live region", async () => {
  serveBrowse(testCards(2));
  const opened = await openAt("/search?category=Payments");
  await expect.element(categoryPill(opened, "Payments")).toBeVisible();

  await expect
    .element(countLineOf(opened))
    .toHaveAttribute("aria-live", "polite");
  expect(
    categoryPill(opened, "Payments").element().closest("[aria-live]"),
  ).toBeNull();
});

test("the pill is hidden while a chip is on", async () => {
  serveBrowse(testCards(1));
  const opened = await openAt("/search?category=Payments&chip=Stripe");

  await expect.poll(() => cardCount(opened)).toBe(1);
  await expect.element(anyCategoryPill(opened)).not.toBeInTheDocument();
});

test("the pill shows while only an SDK is on", async () => {
  serveBrowse(testCards(1));
  const opened = await openAt("/search?category=Payments&sdk=Python");

  await expect.element(categoryPill(opened, "Payments")).toBeVisible();
});

test("the pill hides when a chip goes on and returns when the last chip goes off", async () => {
  serveBrowse(testCards(1));
  const opened = await openAt("/search?category=Payments");
  await expect.element(categoryPill(opened, "Payments")).toBeVisible();

  await filterChip(opened, "Stripe").click();
  await filterChip(opened, "Slack").click();
  await expect
    .poll(() => opened.router.state.location.search)
    .toBe("?chip=Stripe&chip=Slack&category=Payments");
  await expect.poll(() => cardCount(opened)).toBe(1);
  await expect.element(anyCategoryPill(opened)).not.toBeInTheDocument();

  await filterChip(opened, "Stripe").click();
  await expect
    .poll(() => opened.router.state.location.search)
    .toBe("?chip=Slack&category=Payments");
  await expect.poll(() => cardCount(opened)).toBe(1);
  await expect.element(anyCategoryPill(opened)).not.toBeInTheDocument();

  await filterChip(opened, "Slack").click();
  await expect
    .poll(() => opened.router.state.location.search)
    .toBe("?category=Payments");
  await expect.element(categoryPill(opened, "Payments")).toBeVisible();
});

test("removing the pill takes the category out of the address and keeps the words, SDKs and publisher", async () => {
  const calls = serveBrowse(testCards(1));
  const opened = await openAt(
    searchAddress({
      words: "charge",
      sdks: ["Python"],
      chips: [],
      category: "Payments",
      publisher: "ddieruf",
    }),
  );
  await expect.element(categoryPill(opened, "Payments")).toBeVisible();

  await categoryPill(opened, "Payments").click();

  await expect
    .poll(() => opened.router.state.location.search)
    .toBe("?q=charge&sdk=Python&publisher=ddieruf");
  expect(currentSearch(opened)).toEqual({
    words: "charge",
    sdks: ["Python"],
    chips: [],
    publisher: "ddieruf",
  });
  await expect
    .poll(() => calls.at(-1))
    .toEqual({
      ...firstCall,
      q: "charge",
      sdks: ["Python"],
      publisher: "ddieruf",
    });
  await expect.element(anyCategoryPill(opened)).not.toBeInTheDocument();
  await expect.element(searchBox(opened)).toHaveValue("charge");
});

test("removing the pill on a tile's address shows every activity", async () => {
  const all = testCards(4);
  const calls = serveBrowse(all, {
    matching: (call) => (call.category === null ? all : all.slice(0, 1)),
  });
  const opened = await openAt("/search?category=Payments");
  await expect.poll(() => cardCount(opened)).toBe(1);

  await categoryPill(opened, "Payments").click();

  await expect.poll(() => opened.router.state.location.search).toBe("");
  await expect.poll(() => cardCount(opened)).toBe(4);
  expect(calls.at(-1)).toEqual(firstCall);
});

test("an unknown category in the address shows no pill", async () => {
  serveBrowse(testCards(1));
  const opened = await openAt("/search?category=Shipping");

  await expect.poll(() => cardCount(opened)).toBe(1);
  await expect.element(anyCategoryPill(opened)).not.toBeInTheDocument();
});

test("the pill shows beside the count line in the empty state too", async () => {
  serveBrowse([testCard(1)], { matching: () => [] });
  const opened = await openAt("/search?category=Workflow+patterns");

  await expect
    .element(
      opened.screen.getByRole("heading", { name: "No activities match" }),
    )
    .toBeVisible();
  await expect.element(categoryPill(opened, "Workflow patterns")).toBeVisible();
});

// Criterion 6: the empty state

test("no matches shows the empty state, and Clear filters clears the words and the filters", async () => {
  const card = testCard(1);
  const calls = serveBrowse([card], {
    matching: (call) =>
      call.q === null && call.sdks.length === 0 ? [card] : [],
  });
  const opened = await openAt(
    searchAddress({
      words: "nothing like this",
      sdks: [".NET"],
      chips: ["Slack"],
    }),
  );

  await expect
    .element(
      opened.screen.getByRole("heading", { name: "No activities match" }),
    )
    .toBeVisible();
  await expect
    .element(
      opened.screen.getByText(
        "Try removing a filter or describing what you need differently.",
      ),
    )
    .toBeVisible();
  await expect
    .element(opened.screen.getByText("0 activities · sorted by relevance"))
    .toBeVisible();
  await expect
    .element(opened.screen.getByText("That’s every match."))
    .not.toBeInTheDocument();

  await opened.screen.getByRole("button", { name: "Clear filters" }).click();

  await expect.poll(() => cardCount(opened)).toBe(1);
  expect(currentSearch(opened)).toEqual({
    words: "",
    sdks: [],
    chips: [],
  });
  expect(calls.at(-1)).toEqual(firstCall);
  await expect.element(searchBox(opened)).toHaveValue("");
  await expect
    .element(sdkChip(opened, "Any"))
    .toHaveAttribute("aria-pressed", "true");
});

test("the empty state's heading, text and Clear filters button take their styles", async () => {
  serveBrowse([testCard(1)], { matching: () => [] });
  const opened = await openAt(searchAddress({ words: "nothing like this" }));

  // A class name the CSS module does not export is undefined, and React then writes no class.
  await expect
    .element(
      opened.screen.getByRole("heading", { name: "No activities match" }),
    )
    .toHaveAttribute("class");
  await expect
    .element(
      opened.screen.getByText(
        "Try removing a filter or describing what you need differently.",
      ),
    )
    .toHaveAttribute("class");
  await expect
    .element(opened.screen.getByRole("button", { name: "Clear filters" }))
    .toHaveAttribute("class");
});

// Criterion 7: the error state

test("a failed load shows the error state, and Try again asks again", async () => {
  let failing = true;
  const calls = serveBrowse(testCards(2), { fails: () => failing });
  const opened = await openAt(searchAddress({ sdks: ["Python"] }));

  await expect
    .element(
      opened.screen.getByRole("heading", { name: "Something went wrong" }),
    )
    .toBeVisible();
  await expect
    .element(opened.screen.getByText(/Results could not be loaded/))
    .toBeVisible();

  failing = false;
  await opened.screen.getByRole("button", { name: "Try again" }).click();

  await expect.poll(() => cardCount(opened)).toBe(2);
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
  await expect
    .element(opened.screen.getByText("Something went wrong"))
    .not.toBeInTheDocument();
});

test("the error state's heading and text take their styles", async () => {
  serveBrowse(testCards(1), { fails: () => true });
  const opened = await openAt("/search");

  await expect
    .element(
      opened.screen.getByRole("heading", { name: "Something went wrong" }),
    )
    .toHaveAttribute("class");
  await expect
    .element(opened.screen.getByText(/Results could not be loaded/))
    .toHaveAttribute("class");
});

test("the filters stay usable while the results have failed", async () => {
  serveBrowse(testCards(1), { fails: () => true });
  const opened = await openAt("/search");
  await expect
    .element(opened.screen.getByText("Something went wrong"))
    .toBeVisible();

  await expect.element(searchBox(opened)).toBeVisible();
  await expect.element(sdkChip(opened, "Python")).toBeEnabled();
});

// Criterion 8: loading

test("while the first batch loads, the results area says Loading activities…", async () => {
  const first = gate();
  serveBrowse(testCards(2), { before: () => first.opened });
  const opened = await openAt("/search");

  await expect
    .element(opened.screen.getByText("Loading activities…"))
    .toBeVisible();
  await expect.element(sidebar(opened)).toBeVisible();
  expect(cards(opened).elements()).toHaveLength(0);

  first.open();

  await expect.poll(() => cardCount(opened)).toBe(2);
  await expect
    .element(opened.screen.getByText("Loading activities…"))
    .not.toBeInTheDocument();
});

// The SDK catalog: the sidebar's SDK chips and the SDKs an address can hold come from it

/**
 * Answers browse calls from a Go card and a Python card, matching the SDK filter, and returns
 * each call's SDKs. The cards are JSON, so a Go card needs no Go in web's types.
 */
function serveGoAndPython() {
  const cards = [
    { ...testCard(1), sdk: "Go" },
    { ...testCard(2), sdk: "Python" },
  ];
  const calls: string[][] = [];
  worker.use(
    http.get("/api/activities", ({ request }) => {
      const sdks = new URL(request.url).searchParams.getAll("sdk");
      calls.push(sdks);
      const matches = cards.filter(
        (card) => sdks.length === 0 || sdks.includes(card.sdk),
      );
      return HttpResponse.json({
        activities: matches,
        count: matches.length,
        sort: "newest",
        nextCursor: null,
      });
    }),
  );
  return calls;
}

test("the sidebar's SDK chips are Any then the catalog's SDKs, in catalog order", async () => {
  serveBrowse(testCards(1));
  serveCatalog(eightSdkCatalog);
  const opened = await openAt("/search");

  await expect
    .poll(() => pressedIn(opened, "Temporal SDK"))
    .toEqual([["Any", true], ...eightSdks.map((sdk) => [sdk, false])]);
});

test("picking a new SDK's chip in the sidebar shows only that SDK's activities", async () => {
  serveCatalog(eightSdkCatalog);
  const calls = serveGoAndPython();
  const opened = await openAt("/search");
  await expect.poll(() => cardCount(opened)).toBe(2);

  await sdkChip(opened, "Go").click();

  await expect.poll(() => cardCount(opened)).toBe(1);
  await expect
    .element(opened.screen.getByRole("heading", { name: "Activity 1" }))
    .toBeVisible();
  expect(calls.at(-1)).toEqual(["Go"]);
  expect(opened.router.state.location.search).toBe("?sdk=Go");
  await expect
    .element(sdkChip(opened, "Go"))
    .toHaveAttribute("aria-pressed", "true");
});

test("a new SDK in the address counts when the catalog lists it", async () => {
  serveCatalog(eightSdkCatalog);
  const calls = serveGoAndPython();
  const opened = await openAt("/search?sdk=Go");

  await expect.poll(() => cardCount(opened)).toBe(1);
  expect(calls).toEqual([["Go"]]);
  await expect
    .element(sdkChip(opened, "Go"))
    .toHaveAttribute("aria-pressed", "true");
});

test("an SDK in the address that the catalog does not list is dropped", async () => {
  const calls = serveGoAndPython();
  const opened = await openAt("/search?sdk=Go&sdk=Python");

  await expect.poll(() => cardCount(opened)).toBe(1);
  expect(calls).toEqual([["Python"]]);
});

test("while the catalog loads, the page says so and asks for no results yet", async () => {
  const answerCatalog = holdCatalog();
  const calls = serveBrowse(testCards(1));
  const opened = await openAt("/search?sdk=Python");

  await expect
    .element(opened.screen.getByRole("status"))
    .toHaveTextContent("Loading the search…");
  expect(calls).toEqual([]);

  answerCatalog();
  await expect.poll(() => cardCount(opened)).toBe(1);
  expect(calls).toEqual([{ ...firstCall, sdks: ["Python"] }]);
});

test("when the catalog cannot be read, the page still renders with Any as the only SDK chip, and no SDK filter", async () => {
  const failed = failCatalog();
  const calls = serveBrowse(testCards(2));
  const opened = await openAt("/search?sdk=Python&chip=Stripe");
  await failed;

  await expect.poll(() => cardCount(opened)).toBe(2);
  expect(pressedIn(opened, "Temporal SDK")).toEqual([["Any", true]]);
  expect(calls).toEqual([{ ...firstCall, chips: ["Stripe"] }]);
});

test("every result card's SDK tag looks the same, whatever the SDK", async () => {
  serveCatalog(eightSdkCatalog);
  const eight = eightSdks.map((sdk, index) => ({
    ...testCard(index + 1),
    sdk,
  }));
  worker.use(
    http.get("/api/activities", () =>
      HttpResponse.json({
        activities: eight,
        count: eight.length,
        sort: "newest",
        nextCursor: null,
      }),
    ),
  );
  const opened = await openAt("/search");
  await expect.poll(() => cardCount(opened)).toBe(8);

  const looks = cards(opened)
    .elements()
    .map((card) => {
      const tag = [...card.querySelectorAll("p")].find((p) =>
        (eightSdks as readonly string[]).includes(p.textContent),
      );
      if (tag === undefined) throw new Error("A card has no SDK tag.");
      const style = getComputedStyle(tag);
      return [
        style.backgroundColor,
        style.color,
        style.borderRadius,
        style.fontSize,
        style.fontWeight,
      ].join(" ");
    });
  expect(looks).toHaveLength(8);
  expect(new Set(looks).size).toBe(1);
});
