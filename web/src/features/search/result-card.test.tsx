import "@/styles/global.css";
import { readSearch, searchAddress } from "@/lib/search-address";
import { testCatalogSdks } from "../../../test/sdk-catalog";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import type { ActivityCard } from "./activity-card";
import { ResultCard } from "./result-card";

const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

// A card as the browse read answers it, at a version other than 1.0.0 so the links can be
// seen to follow the version on the card.
const chargeCard: ActivityCard = {
  address: "ddieruf/charge-card@1.2.0",
  handle: "ddieruf",
  name: "charge-card",
  version: "1.2.0",
  title: "Charge card",
  sdk: "Python",
  description: "Charge a saved card with Stripe and return the charge ID.",
  integrations: ["Stripe", "Amazon S3", "Slack"],
  publishedAt: twoDaysAgo,
};

const longWord = "x".repeat(400);

// The card in a router, as the results page will show it, in a column as narrow as the
// one-per-row layout on a small screen. The page it starts on can carry a search already.
async function renderCard(
  card: Partial<ActivityCard> = {},
  { at = "/search", width = "360px" } = {},
) {
  const router = createMemoryRouter(
    [
      {
        path: "/search",
        element: (
          <div style={{ width }}>
            <ResultCard card={{ ...chargeCard, ...card }} />
          </div>
        ),
      },
      { path: "/:handle/:nameAtVersion", element: <p>Activity page</p> },
    ],
    { initialEntries: [at] },
  );
  const screen = await render(<RouterProvider router={router} />);
  return { router, screen };
}

type Rendered = Awaited<ReturnType<typeof renderCard>>;

function cardOf({ screen }: Rendered, title = chargeCard.title) {
  return screen.getByRole("article", { name: title });
}

/** The search the router's current address holds. */
function currentSearch({ router }: Rendered) {
  return readSearch(
    new URLSearchParams(router.state.location.search),
    testCatalogSdks,
  );
}

function tileOf(article: HTMLElement): HTMLElement {
  const tile = article.querySelector<HTMLElement>("[aria-hidden='true']");
  if (tile === null) {
    throw new Error("The card has no icon tile.");
  }
  return tile;
}

test("a full card shows title, address, SDK, description, integrations, publisher and date", async () => {
  const rendered = await renderCard();
  const card = cardOf(rendered);

  await expect
    .element(card.getByRole("heading", { name: "Charge card" }))
    .toBeVisible();
  await expect
    .element(card.getByText("ddieruf/charge-card@1.2.0"))
    .toBeVisible();
  await expect.element(card.getByText("Python", { exact: true })).toBeVisible();
  await expect
    .element(
      card.getByText(
        "Charge a saved card with Stripe and return the charge ID.",
      ),
    )
    .toBeVisible();
  await expect.element(card.getByText("Integrates with")).toBeVisible();
  for (const integration of ["Stripe", "Amazon S3", "Slack"]) {
    await expect
      .element(card.getByRole("link", { name: integration, exact: true }))
      .toBeVisible();
  }
  await expect
    .element(card.getByRole("link", { name: "More from ddieruf" }))
    .toHaveTextContent("Dddieruf");
  await expect.element(card.getByText("Published 2 days ago")).toBeVisible();
  await expect.element(card.getByRole("link", { name: "View" })).toBeVisible();
});

test("the published label reads from the version's date", async () => {
  const fiveDaysAgo = new Date(
    Date.now() - 5 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const rendered = await renderCard({ publishedAt: fiveDaysAgo });

  const date = cardOf(rendered).getByText("5 days ago");
  await expect
    .element(cardOf(rendered).getByText("Published 5 days ago"))
    .toBeVisible();
  expect(date.element().getAttribute("datetime")).toBe(fiveDaysAgo);
});

test("a card with no integrations has no Integrates with row", async () => {
  const rendered = await renderCard({ integrations: [] });
  const card = cardOf(rendered);

  await expect.element(card.getByText("Published 2 days ago")).toBeVisible();
  await expect
    .element(card.getByText("Integrates with"))
    .not.toBeInTheDocument();
  expect(card.getByRole("listitem").elements()).toHaveLength(0);
});

test("the integrations sit in one row with no list markers", async () => {
  const rendered = await renderCard({}, { width: "600px" });
  const card = cardOf(rendered);

  const list = card.getByRole("list").element();
  expect(getComputedStyle(list).listStyleType).toBe("none");
  const tops = card
    .getByRole("listitem")
    .elements()
    .map((item) => item.getBoundingClientRect().top);
  expect(new Set(tops).size).toBe(1);
});

test("each integration link's address holds that integration alone", async () => {
  const rendered = await renderCard();
  const card = cardOf(rendered);

  for (const integration of ["Stripe", "Amazon S3", "Slack"] as const) {
    expect(
      card
        .getByRole("link", { name: integration, exact: true })
        .element()
        .getAttribute("href"),
    ).toBe(searchAddress({ integrations: [integration] }));
  }
});

test("clicking an integration opens /search with that integration alone, replacing other choices", async () => {
  const rendered = await renderCard(
    {},
    { at: searchAddress({ integrations: ["Slack", "Amazon S3"] }) },
  );

  await cardOf(rendered)
    .getByRole("link", { name: "Stripe", exact: true })
    .click();

  await expect
    .poll(() => rendered.router.state.location.pathname)
    .toBe("/search");
  expect(currentSearch(rendered).integrations).toEqual(["Stripe"]);
});

test("the publisher link's address holds the handle alone", async () => {
  const rendered = await renderCard();

  expect(
    cardOf(rendered)
      .getByRole("link", { name: "More from ddieruf" })
      .element()
      .getAttribute("href"),
  ).toBe(searchAddress({ publisher: "ddieruf" }));
});

test("clicking the publisher opens /search for that publisher's activities only", async () => {
  const rendered = await renderCard(
    {},
    {
      at: searchAddress({
        words: "charge",
        sdks: ["TypeScript"],
        integrations: ["Slack"],
      }),
    },
  );

  await cardOf(rendered)
    .getByRole("link", { name: "More from ddieruf" })
    .click();

  await expect
    .poll(() => rendered.router.state.location.pathname)
    .toBe("/search");
  expect(currentSearch(rendered)).toEqual({
    words: "",
    sdks: [],
    integrations: [],
    publisher: "ddieruf",
  });
});

test("the title and View both point at the card's version", async () => {
  const rendered = await renderCard();
  const card = cardOf(rendered);

  for (const link of [
    card.getByRole("link", { name: "Charge card" }),
    card.getByRole("link", { name: "View" }),
  ]) {
    expect(link.element().getAttribute("href")).toBe(
      "/ddieruf/charge-card@1.2.0",
    );
  }
});

test("clicking the title opens the activity page for the card's version", async () => {
  const rendered = await renderCard();

  await cardOf(rendered).getByRole("link", { name: "Charge card" }).click();

  await expect
    .element(rendered.screen.getByText("Activity page"))
    .toBeVisible();
  expect(rendered.router.state.location.pathname).toBe(
    "/ddieruf/charge-card@1.2.0",
  );
});

test("clicking View opens the activity page for the card's version", async () => {
  const rendered = await renderCard();

  await cardOf(rendered).getByRole("link", { name: "View" }).click();

  await expect
    .element(rendered.screen.getByText("Activity page"))
    .toBeVisible();
  expect(rendered.router.state.location.pathname).toBe(
    "/ddieruf/charge-card@1.2.0",
  );
});

test("the same card draws its tile in the same colour each time", async () => {
  const first = await renderCard();
  const firstTile = getComputedStyle(
    tileOf(cardOf(first).element() as HTMLElement),
  );
  const colours = [firstTile.backgroundColor, firstTile.fill];
  await first.screen.unmount();

  const second = await renderCard();
  const secondTile = getComputedStyle(
    tileOf(cardOf(second).element() as HTMLElement),
  );

  expect(colours[0]).not.toBe("rgba(0, 0, 0, 0)");
  expect([secondTile.backgroundColor, secondTile.fill]).toEqual(colours);
});

test("a very long title, address and description stay within the card", async () => {
  const rendered = await renderCard({
    title: `Charge ${longWord}`,
    address: `ddieruf/${longWord}@1.2.0`,
    description: `Charges ${longWord}`,
  });
  const card = cardOf(rendered, `Charge ${longWord}`);
  await expect.element(card).toBeVisible();

  const article = card.element() as HTMLElement;
  const bounds = article.getBoundingClientRect();
  expect(article.scrollWidth).toBeLessThanOrEqual(article.clientWidth);
  for (const child of article.querySelectorAll("*")) {
    const box = child.getBoundingClientRect();
    if (box.width === 0) {
      continue;
    }
    expect(box.right).toBeLessThanOrEqual(bounds.right + 0.5);
  }
});

test("no rating, download count or other popularity signal appears", async () => {
  const rendered = await renderCard();
  const article = cardOf(rendered).element() as HTMLElement;
  await expect.element(cardOf(rendered)).toBeVisible();

  expect(article.textContent).not.toMatch(
    /\bstars?\b|rating|download|installs|popular|trending|\bviews\b|\blikes?\b|★|☆/i,
  );
  expect(
    article.querySelectorAll("meter, progress, [role='meter']"),
  ).toHaveLength(0);
});
