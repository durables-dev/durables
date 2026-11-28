import type { Locator, Page } from "@playwright/test";
import {
  expect,
  sample,
  test,
  type PublishDetails,
  type PublishedListing,
} from "../fixtures";

const python = sample("python");
const typescript = sample("typescript");
const dotnet = sample("dotnet");

/**
 * One activity per SDK, each titled with the test's unique word so a search for it finds these
 * and nothing else. Python imports no integration, TypeScript imports Amazon S3 and .NET imports
 * Stripe. Published in this order by one publisher, their names fall alphabetically from newest
 * to oldest. Cards published in the same second are ordered by handle then name, so newest
 * first reads .NET, TypeScript, Python however fast they were published.
 */
function threeListings(word: string) {
  return {
    python: {
      code: python,
      title: `Post slack message ${word}`,
      name: "slack-message",
      description:
        "Posts a message to a Slack channel and returns its reference.",
    },
    typescript: {
      code: typescript,
      title: `Upload report ${word}`,
      name: "report-upload",
      description: "Uploads a CSV report to S3 and returns where it is.",
    },
    dotnet: {
      code: dotnet,
      title: `Refund payment ${word}`,
      name: "payment-refund",
      description: "Refunds a Stripe payment and returns the refund.",
    },
  } satisfies Record<string, PublishDetails>;
}

/**
 * Gives threeListings' TypeScript and .NET listings the chips their imports imply, as an
 * operator's migration does. Publishing gives a listing none. The Python one stays without.
 */
async function setThreeListingsChips(
  setChips: (
    listing: { handle: string; name: string },
    chips: readonly string[],
  ) => Promise<void>,
  typescript: PublishedListing | undefined,
  dotnet: PublishedListing | undefined,
) {
  if (typescript === undefined || dotnet === undefined) {
    throw new Error("The TypeScript and .NET listings were not published.");
  }
  await setChips(typescript, ["Amazon S3"]);
  await setChips(dotnet, ["Stripe"]);
}

const anyCountSortedByNewest = /^[\d,]+ activit(y|ies) · sorted by newest$/;

function main(page: Page) {
  return page.getByRole("main");
}

function searchBox(page: Page) {
  return page.getByRole("searchbox", { name: "Search activities" });
}

function cards(page: Page) {
  return main(page).getByRole("article");
}

function card(page: Page, title: string) {
  return main(page).getByRole("article", { name: title, exact: true });
}

function cardTitles(page: Page) {
  return cards(page).getByRole("heading");
}

function countLine(page: Page) {
  return main(page).getByText(/ · sorted by /);
}

function sidebar(page: Page) {
  return page.getByRole("complementary", { name: "Filters" });
}

function chip(scope: Page | Locator, group: string, name: string) {
  return scope
    .getByRole("group", { name: group, exact: true })
    .getByRole("button", { name, exact: true });
}

/** The number at the start of the count line. */
async function shownCount(page: Page): Promise<number> {
  const text = (await countLine(page).textContent()) ?? "";
  return Number(text.split(" ")[0]?.replaceAll(",", ""));
}

/**
 * Scrolls to the last card, as a consumer does to load the next batch, until the target finds
 * the number of elements expected. Results are newest first, so a card just published is
 * usually in the first batch, but another worker publishing at the same time can push it on.
 */
async function scrollUntil(page: Page, target: Locator, count = 1) {
  await expect(async () => {
    await cards(page).last().scrollIntoViewIfNeeded();
    await expect(target).toHaveCount(count, { timeout: 1_000 });
  }).toPass();
}

test.describe("as an anonymous visitor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "an activity consumer searches from home with Enter and sees matching cards sorted by relevance",
    { tag: "@journey" },
    async ({ page, expectAccessible, publishListings, uniqueWord }) => {
      const word = uniqueWord();
      // The word is in the older one's title and the newer one's description. A title match
      // counts more, so relevance puts the older one first.
      const inTitle: PublishDetails = {
        code: python,
        title: `Post slack message ${word}`,
        name: "slack-message",
        description:
          "Posts a message to a Slack channel and returns its reference.",
      };
      const inDescription: PublishDetails = {
        code: typescript,
        title: "Upload report",
        name: "report-upload",
        description: `Uploads a CSV report to S3 and returns where it is. ${word}`,
      };
      const [titleMatch, descriptionMatch] = await publishListings([
        inTitle,
        inDescription,
      ]);

      await test.step("start on the home page", async () => {
        await page.goto("/");
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: "Temporal activities, ready to use.",
          }),
        ).toBeVisible();
        await expect(searchBox(page)).toHaveAttribute(
          "placeholder",
          "Describe what you need, or just use Filters",
        );
        await expectAccessible();
      });

      await test.step("type the word and press Enter", async () => {
        await searchBox(page).fill(word);
        await searchBox(page).press("Enter");

        await expect(page).toHaveURL(`/search?q=${word}`);
        await expect(
          main(page).getByRole("heading", { level: 1, name: "Search" }),
        ).toBeVisible();
        await expect(searchBox(page)).toHaveValue(word);
      });

      await test.step("see both matches, the title match first, sorted by relevance", async () => {
        await expect(countLine(page)).toHaveText(
          "2 activities · sorted by relevance",
        );
        await expect(cardTitles(page)).toHaveText([
          inTitle.title,
          inDescription.title,
        ]);
        await expect(cards(page).first()).toContainText(
          titleMatch?.address ?? "",
        );
        await expect(cards(page).last()).toContainText(
          descriptionMatch?.address ?? "",
        );
        await expectAccessible();
      });
    },
  );

  test(
    "an activity consumer picks an SDK and an integration on home, presses Search and sees only matching cards",
    { tag: "@journey" },
    async ({
      page,
      expectAccessible,
      publishListings,
      setChips,
      uniqueWord,
    }) => {
      const listings = threeListings(uniqueWord());
      const [, typescriptListing, dotnetListing] = await publishListings([
        listings.python,
        listings.typescript,
        listings.dotnet,
      ]);
      await setThreeListingsChips(setChips, typescriptListing, dotnetListing);
      const filtersButton = page.getByRole("button", { name: /^Filters/ });

      await test.step("open Filters and pick TypeScript and Amazon S3", async () => {
        await page.goto("/");
        await expect(filtersButton).toHaveAttribute("aria-expanded", "false");
        await filtersButton.click();
        await expect(filtersButton).toHaveAttribute("aria-expanded", "true");
        await expect(chip(page, "Temporal SDK", "Any")).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        // The SDK chips are Any, then the SDK catalog's SDKs in its order, so a new SDK needs
        // no change here.
        const catalog = await page.request.get("/api/sdks");
        expect(catalog.ok()).toBe(true);
        const sdkNames = ((await catalog.json()) as { name: string }[]).map(
          ({ name }) => name,
        );
        await expect(
          page.getByRole("group", { name: "Temporal SDK" }).getByRole("button"),
        ).toHaveText(["Any", ...sdkNames]);
        // After Temporal SDK, one heading per category, each with its help line and its
        // filters, in the shared list's order. No single Integrates with list.
        const headings = [
          {
            name: "AI models",
            help: "Call an AI model",
            filters: [
              "OpenAI",
              "Anthropic Claude",
              "Google Gemini",
              "Amazon Bedrock",
              "Ollama",
              "Cohere",
              "Groq",
              "xAI Grok",
            ],
          },
          {
            name: "Data and storage",
            help: "Read or write data",
            filters: ["Amazon S3", "Postgres", "Redis"],
          },
          {
            name: "Messaging",
            help: "Send or receive messages",
            filters: ["Slack", "Amazon SQS"],
          },
          {
            name: "Payments",
            help: "Take, refund or manage payments",
            filters: ["Stripe"],
          },
          {
            name: "Workflow patterns",
            help: "Common workflow steps",
            filters: ["Approval", "Polling", "Batching", "Saga"],
          },
        ];
        for (const { name, help, filters } of headings) {
          const group = page.getByRole("group", { name, exact: true });
          await expect(group).toHaveAccessibleDescription(help);
          await expect(group.getByRole("button")).toHaveText(filters);
        }
        await expect(
          page.getByRole("group", { name: "Integrates with" }),
        ).toHaveCount(0);

        await chip(page, "Temporal SDK", "TypeScript").click();
        await chip(page, "Data and storage", "Amazon S3").click();

        await expect(chip(page, "Temporal SDK", "TypeScript")).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        await expect(chip(page, "Temporal SDK", "Any")).toHaveAttribute(
          "aria-pressed",
          "false",
        );
        await expect(
          chip(page, "Data and storage", "Amazon S3"),
        ).toHaveAttribute("aria-pressed", "true");
        await expect(filtersButton).toHaveAccessibleName("Filters (2 on)");
        await expect(
          page.getByRole("button", { name: "Clear filters" }),
        ).toBeVisible();
        await expectAccessible();
      });

      await test.step("press Search and land on results with both filters on", async () => {
        await page.getByRole("button", { name: "Search", exact: true }).click();

        await expect(page).toHaveURL("/search?sdk=TypeScript&chip=Amazon+S3");
        await expect(searchBox(page)).toHaveValue("");
        await expect(
          chip(sidebar(page), "Temporal SDK", "TypeScript"),
        ).toHaveAttribute("aria-pressed", "true");
        await expect(
          chip(sidebar(page), "Data and storage", "Amazon S3"),
        ).toHaveAttribute("aria-pressed", "true");
        await expect(
          sidebar(page).getByRole("button", { name: "Clear (2)" }),
        ).toBeVisible();
        await expect(countLine(page)).toHaveText(anyCountSortedByNewest);
      });

      await test.step("see the TypeScript Amazon S3 activity and only cards that match both", async () => {
        await scrollUntil(page, card(page, listings.typescript.title));

        await expect(
          cards(page).filter({
            hasNot: page.getByText("TypeScript", { exact: true }),
          }),
        ).toHaveCount(0);
        await expect(
          cards(page).filter({
            hasNot: page.getByRole("link", { name: "Amazon S3", exact: true }),
          }),
        ).toHaveCount(0);
        await expect(card(page, listings.python.title)).toHaveCount(0);
        await expect(card(page, listings.dotnet.title)).toHaveCount(0);
        await expectAccessible();
      });
    },
  );

  test(
    "an activity consumer clicks Explore All and reaches every published activity, newest first",
    { tag: "@journey" },
    async ({ page, expectAccessible, publishListings, uniqueWord }) => {
      const word = uniqueWord();
      // Names fall alphabetically from newest to oldest, so newest first reads the same when
      // two are published in the same second and are ordered by name.
      const [oldest, middle, newest] = [
        { title: `Oldest post ${word}`, name: "post-c" },
        { title: `Middle post ${word}`, name: "post-b" },
        { title: `Newest post ${word}`, name: "post-a" },
      ].map(({ title, name }) => ({
        code: python,
        title,
        name,
        description:
          "Posts a message to a Slack channel and returns its reference.",
      }));
      if (!oldest || !middle || !newest) throw new Error("Three listings.");
      await publishListings([oldest, middle, newest]);
      const browse = await page.request.get("/api/activities");
      const { count: publishedBefore } = (await browse.json()) as {
        count: number;
      };

      await test.step("click Explore All under the search box", async () => {
        await page.goto("/");
        await page.getByRole("link", { name: "Explore All" }).click();

        await expect(page).toHaveURL("/search");
        await expect(searchBox(page)).toHaveValue("");
        await expect(
          chip(sidebar(page), "Temporal SDK", "Any"),
        ).toHaveAttribute("aria-pressed", "true");
        await expect(
          sidebar(page).getByRole("button", { name: /^Clear/ }),
        ).toHaveCount(0);
      });

      await test.step("the count covers every published activity, sorted by newest", async () => {
        await expect(countLine(page)).toHaveText(anyCountSortedByNewest);
        expect(await shownCount(page)).toBeGreaterThanOrEqual(publishedBefore);
        await expectAccessible();
      });

      await test.step("this test's three activities show newest first", async () => {
        const mine = cards(page).filter({ hasText: word });
        await scrollUntil(page, mine, 3);

        await expect(mine.getByRole("heading")).toHaveText([
          newest.title,
          middle.title,
          oldest.title,
        ]);
      });
    },
  );

  test("results narrow by SDK and by integration, the count and sort line follow, and Clear brings every match back", async ({
    page,
    expectAccessible,
    publishListings,
    setChips,
    uniqueWord,
  }) => {
    const word = uniqueWord();
    const listings = threeListings(word);
    const [, typescriptListing, dotnetListing] = await publishListings([
      listings.python,
      listings.typescript,
      listings.dotnet,
    ]);
    await setThreeListingsChips(setChips, typescriptListing, dotnetListing);

    await test.step("search from the results page's box", async () => {
      await page.goto("/search");
      await searchBox(page).fill(word);
      await searchBox(page).press("Enter");

      await expect(page).toHaveURL(`/search?q=${word}`);
      await expect(countLine(page)).toHaveText(
        "3 activities · sorted by relevance",
      );
      await expect(cardTitles(page)).toHaveText([
        listings.dotnet.title,
        listings.typescript.title,
        listings.python.title,
      ]);
    });

    await test.step("narrow by TypeScript, then add .NET", async () => {
      await chip(sidebar(page), "Temporal SDK", "TypeScript").click();

      await expect(page).toHaveURL(`/search?q=${word}&sdk=TypeScript`);
      await expect(countLine(page)).toHaveText(
        "1 activity · sorted by relevance",
      );
      await expect(cardTitles(page)).toHaveText([listings.typescript.title]);
      await expect(
        sidebar(page).getByRole("button", { name: "Clear (1)" }),
      ).toBeVisible();

      await chip(sidebar(page), "Temporal SDK", ".NET").click();

      await expect(countLine(page)).toHaveText(
        "2 activities · sorted by relevance",
      );
      await expect(cardTitles(page)).toHaveText([
        listings.dotnet.title,
        listings.typescript.title,
      ]);
      await expectAccessible();
    });

    await test.step("Any clears the SDKs", async () => {
      await chip(sidebar(page), "Temporal SDK", "Any").click();

      await expect(page).toHaveURL(`/search?q=${word}`);
      await expect(countLine(page)).toHaveText(
        "3 activities · sorted by relevance",
      );
    });

    // Stripe is under Payments and Amazon S3 under Data and storage. Chips in different
    // categories narrow, so no listing has both.
    await test.step("narrow by Stripe, then by Amazon S3 as well", async () => {
      await chip(sidebar(page), "Payments", "Stripe").click();

      await expect(countLine(page)).toHaveText(
        "1 activity · sorted by relevance",
      );
      await expect(cardTitles(page)).toHaveText([listings.dotnet.title]);

      await chip(sidebar(page), "Data and storage", "Amazon S3").click();

      await expect(page).toHaveURL(
        `/search?q=${word}&chip=Stripe&chip=Amazon+S3`,
      );
      await expect(countLine(page)).toHaveText(
        "0 activities · sorted by relevance",
      );
      await expect(cards(page)).toHaveCount(0);
    });

    await test.step("Clear removes the filters and keeps the words", async () => {
      await sidebar(page).getByRole("button", { name: "Clear (2)" }).click();

      await expect(page).toHaveURL(`/search?q=${word}`);
      await expect(searchBox(page)).toHaveValue(word);
      await expect(countLine(page)).toHaveText(
        "3 activities · sorted by relevance",
      );
    });

    await test.step("with no words the sort is newest", async () => {
      await searchBox(page).fill("");
      await searchBox(page).press("Enter");

      await expect(page).toHaveURL("/search");
      await expect(countLine(page)).toHaveText(anyCountSortedByNewest);
    });
  });

  test("with more than 50 matches the next batch loads at the bottom and That's every match shows at the end", async ({
    page,
    expectAccessible,
    publishListing,
    uniqueWord,
  }) => {
    test.slow();
    const word = uniqueWord();
    const total = 51;
    // Each publish is by a publisher of its own, so the publish rate limit never applies.
    for (let start = 0; start < total; start += 10) {
      await Promise.all(
        Array.from({ length: Math.min(10, total - start) }, (_unused, index) =>
          publishListing({
            code: python,
            title: `Batch post ${start + index + 1} ${word}`,
            name: "slack-message",
            description:
              "Posts a message to a Slack channel and returns its reference.",
          }),
        ),
      );
    }
    const end = main(page).getByText("That’s every match.", { exact: true });

    await page.goto(`/search?q=${word}`);

    await expect(countLine(page)).toHaveText(
      "51 activities · sorted by relevance",
    );
    await expect(cards(page)).toHaveCount(50);
    await expect(end).toHaveCount(0);
    await expectAccessible();

    await cards(page).last().scrollIntoViewIfNeeded();

    await expect(cards(page)).toHaveCount(51);
    await expect(end).toBeVisible();
    await expect(countLine(page)).toHaveText(
      "51 activities · sorted by relevance",
    );
  });

  test(
    "a search with no matches shows the empty state, Clear filters keeps the words, and emptying the box brings every activity back",
    { tag: "@journey" },
    async ({ page, expectAccessible, publishListing, uniqueWord }) => {
      const listing = threeListings(uniqueWord()).python;
      await publishListing(listing);
      const nothing = uniqueWord();

      await test.step("search home for a word nothing holds, with .NET picked", async () => {
        await page.goto("/");
        await searchBox(page).fill(nothing);
        await page.getByRole("button", { name: "Filters" }).click();
        await chip(page, "Temporal SDK", ".NET").click();
        await page.getByRole("button", { name: "Search", exact: true }).click();

        await expect(page).toHaveURL(`/search?q=${nothing}&sdk=.NET`);
      });

      await test.step("see the empty state", async () => {
        await expect(
          main(page).getByRole("heading", { name: "No activities match" }),
        ).toBeVisible();
        await expect(
          main(page).getByText(
            "Try removing a filter or describing what you need differently.",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(countLine(page)).toHaveText(
          "0 activities · sorted by relevance",
        );
        await expect(cards(page)).toHaveCount(0);
        await expectAccessible();
      });

      await test.step("Clear filters clears the filters and keeps the words", async () => {
        await main(page).getByRole("button", { name: "Clear filters" }).click();

        await expect(page).toHaveURL(`/search?q=${nothing}`);
        await expect(searchBox(page)).toHaveValue(nothing);
        await expect(
          chip(sidebar(page), "Temporal SDK", "Any"),
        ).toHaveAttribute("aria-pressed", "true");
        await expect(
          chip(sidebar(page), "Temporal SDK", ".NET"),
        ).toHaveAttribute("aria-pressed", "false");
        await expect(
          main(page).getByRole("heading", { name: "No activities match" }),
        ).toBeVisible();
        await expectAccessible();
      });

      await test.step("emptying the box brings every activity back", async () => {
        await searchBox(page).fill("");
        await searchBox(page).press("Enter");

        await expect(page).toHaveURL("/search");
        await expect(
          main(page).getByRole("heading", { name: "No activities match" }),
        ).toHaveCount(0);
        await expect(countLine(page)).toHaveText(anyCountSortedByNewest);
        await scrollUntil(page, card(page, listing.title));
        await expectAccessible();
      });
    },
  );

  test("the results keep their words and filters after a refresh and after Back", async ({
    page,
    publishListings,
    uniqueWord,
  }) => {
    const word = uniqueWord();
    const listings = threeListings(word);
    await publishListings([listings.python, listings.typescript]);
    const address = `/search?q=${word}&sdk=TypeScript`;

    async function expectTypeScriptSearch() {
      await expect(page).toHaveURL(address);
      await expect(searchBox(page)).toHaveValue(word);
      await expect(
        chip(sidebar(page), "Temporal SDK", "TypeScript"),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        chip(sidebar(page), "Temporal SDK", "Python"),
      ).toHaveAttribute("aria-pressed", "false");
      await expect(countLine(page)).toHaveText(
        "1 activity · sorted by relevance",
      );
      await expect(cardTitles(page)).toHaveText([listings.typescript.title]);
    }

    await test.step("search home for the word with TypeScript picked", async () => {
      await page.goto("/");
      await page.getByRole("button", { name: "Filters" }).click();
      await chip(page, "Temporal SDK", "TypeScript").click();
      await searchBox(page).fill(word);
      await searchBox(page).press("Enter");

      await expectTypeScriptSearch();
    });

    await test.step("refresh and see the same search", async () => {
      await page.reload();

      await expectTypeScriptSearch();
    });

    await test.step("add Python, go Back and see the search before it", async () => {
      await chip(sidebar(page), "Temporal SDK", "Python").click();
      await expect(countLine(page)).toHaveText(
        "2 activities · sorted by relevance",
      );

      await page.goBack();

      await expectTypeScriptSearch();
    });

    await test.step("open the activity page, go Back and see the same search", async () => {
      await card(page, listings.typescript.title)
        .getByRole("link", { name: "View" })
        .click();
      await expect(
        main(page).getByRole("heading", {
          level: 1,
          name: listings.typescript.title,
        }),
      ).toBeVisible();

      await page.goBack();

      await expectTypeScriptSearch();
    });
  });

  test(
    "an activity consumer opens a publisher's activities and a filter's results from the cards",
    { tag: "@journey" },
    async ({
      page,
      expectAccessible,
      publishListing,
      publishListings,
      setChips,
      uniqueWord,
    }) => {
      const word = uniqueWord();
      const listings = threeListings(word);
      const [pythonListing, typescriptListing] = await publishListings([
        listings.python,
        listings.typescript,
      ]);
      const handle = pythonListing?.handle ?? "";
      const dotnetListing = await publishListing(listings.dotnet);
      await setThreeListingsChips(setChips, typescriptListing, dotnetListing);

      await test.step("search for the word and see each card's details", async () => {
        await page.goto(`/search?q=${word}`);
        await expect(countLine(page)).toHaveText(
          "3 activities · sorted by relevance",
        );

        const pythonCard = card(page, listings.python.title);
        await expect(pythonCard).toContainText(pythonListing?.address ?? "");
        await expect(
          pythonCard.getByText("Python", { exact: true }),
        ).toBeVisible();
        await expect(pythonCard).toContainText(listings.python.description);
        await expect(pythonCard).toContainText("Published just now");
        await expect(
          pythonCard.getByText("Filters", { exact: true }),
        ).toHaveCount(0);

        const typescriptCard = card(page, listings.typescript.title);
        await expect(
          typescriptCard.getByText("Filters", { exact: true }),
        ).toBeVisible();
        await expect(
          typescriptCard.getByRole("link", { name: "Amazon S3", exact: true }),
        ).toBeVisible();
        await expect(
          card(page, listings.dotnet.title).getByRole("link", {
            name: "Stripe",
            exact: true,
          }),
        ).toBeVisible();
        await expectAccessible();
      });

      await test.step("a card's publisher opens only that publisher's activities, newest first", async () => {
        await card(page, listings.python.title)
          .getByRole("link", { name: `More from ${handle}` })
          .click();

        await expect(page).toHaveURL(`/search?publisher=${handle}`);
        await expect(countLine(page)).toHaveText(
          "2 activities · sorted by newest",
        );
        await expect(cardTitles(page)).toHaveText([
          listings.typescript.title,
          listings.python.title,
        ]);
        await expectAccessible();
      });

      await test.step("a card's filter becomes the only filter on and keeps the search words", async () => {
        await page.goBack();
        await expect(countLine(page)).toHaveText(
          "3 activities · sorted by relevance",
        );

        await card(page, listings.dotnet.title)
          .getByRole("link", { name: "Stripe", exact: true })
          .click();

        await expect(page).toHaveURL(`/search?q=${word}&chip=Stripe`);
        await expect(searchBox(page)).toHaveValue(word);
        await expect(chip(sidebar(page), "Payments", "Stripe")).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        await expect(countLine(page)).toHaveText(
          "1 activity · sorted by relevance",
        );
        await expect(cardTitles(page)).toHaveText([listings.dotnet.title]);
        await expectAccessible();
      });
    },
  );

  test(
    "an activity consumer finds a newly published activity by searching its title",
    { tag: "@journey" },
    async ({ page, expectAccessible, publishListing, uniqueWord }) => {
      const details: PublishDetails = {
        code: dotnet,
        title: `Refund payment ${uniqueWord()}`,
        name: "payment-refund",
        description: "Refunds a Stripe payment and returns the refund.",
      };
      const listing = await publishListing(details);

      await page.goto("/");
      await searchBox(page).fill(details.title);
      await searchBox(page).press("Enter");

      await expect(page).toHaveURL(
        `/search?q=${details.title.replaceAll(" ", "+")}`,
      );
      await expect(countLine(page)).toHaveText(
        "1 activity · sorted by relevance",
      );
      const found = card(page, details.title);
      await expect(found).toContainText(listing.address);
      await expect(found.getByText(".NET", { exact: true })).toBeVisible();
      await expect(found).toContainText(details.description);
      await expect(found).toContainText("Published just now");
      await expectAccessible();
    },
  );

  test("a newly published activity's card shows no integrations until a release gives the listing its chips", async ({
    page,
    expectAccessible,
    publishListing,
    setChips,
    uniqueWord,
  }) => {
    const details: PublishDetails = {
      code: dotnet,
      title: `Refund payment ${uniqueWord()}`,
      name: "payment-refund",
      description: "Refunds a Stripe payment and returns the refund.",
    };
    const listing = await publishListing(details);
    const found = card(page, details.title);

    await test.step("the card shows no integrations, though the code imports Stripe", async () => {
      await page.goto(`/search?q=${details.title.replaceAll(" ", "+")}`);
      await expect(found).toContainText(listing.address);
      await expect(found.getByText("Filters", { exact: true })).toHaveCount(0);
    });

    await test.step("after the chips are set, the card shows them and the filter finds it", async () => {
      await setChips(listing, ["Stripe", "Amazon S3"]);
      await page.reload();

      await expect(found.getByText("Filters", { exact: true })).toBeVisible();
      await expect(
        found.getByRole("link", { name: "Stripe", exact: true }),
      ).toBeVisible();
      await expect(
        found.getByRole("link", { name: "Amazon S3", exact: true }),
      ).toBeVisible();
      await expectAccessible();

      await page.goto(
        `/search?q=${details.title.replaceAll(" ", "+")}&chip=Amazon+S3`,
      );
      await expect(countLine(page)).toHaveText(
        "1 activity · sorted by relevance",
      );
      await expect(found).toBeVisible();
    });
  });
});

/** Every SDK Temporal officially supports, in Temporal's order (docs.temporal.io, temporal-sdks). */
const temporalSdks = [
  "Go",
  "Java",
  "Python",
  "TypeScript",
  ".NET",
  "Ruby",
  "PHP",
  "Rust",
];

test.describe("the Temporal SDK chips", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("list Any, then all eight SDKs in Temporal's order, on home and in the results sidebar", async ({
    page,
    expectAccessible,
  }) => {
    const sdkChips = (scope: Page | Locator) =>
      scope
        .getByRole("group", { name: "Temporal SDK", exact: true })
        .getByRole("button");

    await page.goto("/");
    await page.getByRole("button", { name: /^Filters/ }).click();

    await expect(sdkChips(page)).toHaveText(["Any", ...temporalSdks]);
    await expect(chip(page, "Temporal SDK", "Any")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expectAccessible();

    await page.goto("/search");

    await expect(sdkChips(sidebar(page))).toHaveText(["Any", ...temporalSdks]);
    await expect(chip(sidebar(page), "Temporal SDK", "Any")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expectAccessible();
  });
});

const categoryNames = [
  "AI models",
  "Data and storage",
  "Messaging",
  "Payments",
  "Workflow patterns",
];

test.describe("category and chip results", () => {
  test("a listing with no chips and a removed listing appear in no category or chip result, and only the first shows in unfiltered browse", async ({
    page,
    expectAccessible,
    publishOwnListing,
    publishThroughApi,
    removeFromSearch,
    setChips,
    uniqueWord,
  }) => {
    const word = uniqueWord();
    // One publisher owns all three, so they can remove one. Then they sign out, so the page
    // visits as a consumer.
    const kept: PublishDetails = {
      code: dotnet,
      title: `Refund payment ${word}`,
      name: "payment-refund",
      description: "Refunds a Stripe payment and returns the refund.",
    };
    const removed: PublishDetails = {
      code: dotnet,
      title: `Refund order ${word}`,
      name: "order-refund",
      description: "Refunds a Stripe order and polls until it settles.",
    };
    const plain: PublishDetails = {
      code: python,
      title: `Post slack message ${word}`,
      name: "slack-message",
      description:
        "Posts a message to a Slack channel and returns its reference.",
    };
    const keptListing = await publishOwnListing(kept);
    const removedResponse = await publishThroughApi(removed);
    await publishThroughApi(plain);
    await setChips(keptListing, ["Stripe"]);
    // Between them, the removed listing's chips sit under every category.
    await setChips(removedResponse, [
      "OpenAI",
      "Postgres",
      "Slack",
      "Stripe",
      "Polling",
    ]);
    await removeFromSearch({
      ...removedResponse,
      address: `${removedResponse.handle}/${removedResponse.name}@${removedResponse.version}`,
    });
    await page.context().clearCookies();

    await test.step("each category's results leave out the removed and the chipless listing", async () => {
      for (const category of categoryNames) {
        await page.goto(
          `/search?q=${word}&category=${encodeURIComponent(category)}`,
        );

        await expect(
          main(page).getByRole("button", { name: `Remove ${category}` }),
        ).toBeVisible();
        if (category === "Payments") {
          await expect(countLine(page)).toHaveText(
            "1 activity · sorted by relevance",
          );
          await expect(cardTitles(page)).toHaveText([kept.title]);
        } else {
          await expect(countLine(page)).toHaveText(
            "0 activities · sorted by relevance",
          );
          await expect(cards(page)).toHaveCount(0);
        }
      }
      await expectAccessible();
    });

    await test.step("each of the removed listing's chips finds it nowhere", async () => {
      for (const name of ["OpenAI", "Postgres", "Slack", "Stripe", "Polling"]) {
        await page.goto(`/search?q=${word}&chip=${name}`);

        await expect(countLine(page)).toHaveText(
          name === "Stripe"
            ? "1 activity · sorted by relevance"
            : "0 activities · sorted by relevance",
        );
        await expect(card(page, removed.title)).toHaveCount(0);
        await expect(card(page, plain.title)).toHaveCount(0);
      }
    });

    await test.step("unfiltered search shows the chipless listing and not the removed one", async () => {
      await page.goto(`/search?q=${word}`);

      await expect(countLine(page)).toHaveText(
        "2 activities · sorted by relevance",
      );
      await expect(card(page, kept.title)).toBeVisible();
      await expect(card(page, plain.title)).toBeVisible();
      await expect(card(page, removed.title)).toHaveCount(0);
    });

    await test.step("unfiltered browse shows the chipless listing", async () => {
      await page.goto("/search");

      await expect(countLine(page)).toHaveText(anyCountSortedByNewest);
      await scrollUntil(page, card(page, plain.title));
      await expectAccessible();
    });
  });

  test.describe("as an anonymous visitor", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("an address with a category the site does not know shows every activity and no pill", async ({
      page,
      expectAccessible,
      publishListings,
      setChips,
      uniqueWord,
    }) => {
      const word = uniqueWord();
      const listings = threeListings(word);
      const [, typescriptListing, dotnetListing] = await publishListings([
        listings.python,
        listings.typescript,
        listings.dotnet,
      ]);
      await setThreeListingsChips(setChips, typescriptListing, dotnetListing);
      const pill = main(page).getByRole("button", { name: /^Remove / });

      await page.goto(`/search?q=${word}&category=Robots`);

      await expect(countLine(page)).toHaveText(
        "3 activities · sorted by relevance",
      );
      await expect(cardTitles(page)).toHaveText([
        listings.dotnet.title,
        listings.typescript.title,
        listings.python.title,
      ]);
      await expect(pill).toHaveCount(0);
      await expect(
        sidebar(page).getByRole("button", { name: /^Clear/ }),
      ).toHaveCount(0);
      await expectAccessible();

      await page.goto("/search?category=Robots");

      await expect(countLine(page)).toHaveText(anyCountSortedByNewest);
      await scrollUntil(page, card(page, listings.python.title));
      await expect(pill).toHaveCount(0);
    });
  });
});
