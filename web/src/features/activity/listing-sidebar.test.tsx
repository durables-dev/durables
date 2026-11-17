import "@/styles/global.css";
import { readSearch, searchAddress } from "@/lib/search-address";
import { testCatalogSdks } from "../../../test/sdk-catalog";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { cdp } from "vitest/browser";
import { render } from "vitest-browser-react";
import { http } from "msw";
import { ListingSidebar, type ListingSidebarProps } from "./listing-sidebar";
import { TestProviders } from "../../../test/test-providers";
import {
  failCatalog,
  failLogo,
  holdCatalog,
  holdLogo,
  logoPath,
  logoProfile,
  rustProfile,
  serveCatalog,
  serveLogo,
  testLogo,
} from "../../../test/serve-sdk-catalog";
import { testCatalog } from "../../../test/sdk-catalog";
import { worker } from "../../../test/worker";

const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

const chargeCard: ListingSidebarProps = {
  sdk: "Python",
  integrations: ["Stripe"],
  dependencies: ["stripe"],
  publishedAt: twoDaysAgo,
  handle: "ddieruf",
};

// The sidebar sits in a 300px column on the page, so the tests give it the same width. It
// renders in a router, with /search standing in for the results page its links open.
async function renderSidebar(props: Partial<ListingSidebarProps> = {}) {
  const router = createMemoryRouter(
    [
      {
        path: "/:handle/:nameAtVersion",
        element: (
          <aside style={{ width: "300px" }}>
            <ListingSidebar {...chargeCard} {...props} />
          </aside>
        ),
      },
      { path: "/search", element: <h1>Results</h1> },
    ],
    { initialEntries: ["/ddieruf/charge-card@1.0.0"] },
  );
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  return Object.assign(screen, { router });
}

type Rendered = Awaited<ReturnType<typeof renderSidebar>>;

/** The search the router's current address holds, once it has moved to /search. */
async function searchOpened({ router, getByRole }: Rendered) {
  await expect
    .element(getByRole("heading", { level: 1, name: "Results" }))
    .toBeVisible();
  expect(router.state.location.pathname).toBe("/search");
  return readSearch(
    new URLSearchParams(router.state.location.search),
    testCatalogSdks,
  );
}

/** The About card's rows, as [term, value] pairs in the order they show. */
function aboutRows(card: HTMLElement) {
  return [...card.querySelectorAll("dt")].map((term) => [
    term.textContent,
    term.nextElementSibling?.textContent,
  ]);
}

test("a version with integrations and dependencies shows all five About rows", async () => {
  const screen = await renderSidebar();

  const about = screen.getByRole("region", { name: "About" });
  await expect.element(about).toBeVisible();
  await expect
    .element(about.getByRole("heading", { level: 2, name: "About" }))
    .toBeVisible();
  // The package arrives with the SDK catalog, after the card first renders.
  await expect
    .poll(() => aboutRows(about.element() as HTMLElement))
    .toEqual([
      ["SDK", "Python, temporalio"],
      ["Integrates with", "Stripe"],
      ["Dependencies", "stripe"],
      ["Published", "2 days ago"],
      ["License", "MIT-0"],
    ]);
  expect(about.getByText("2 days ago").element().getAttribute("datetime")).toBe(
    twoDaysAgo,
  );
});

test("the SDK row names each SDK's package", async () => {
  for (const [sdk, name] of [
    ["Python", "Python, temporalio"],
    ["TypeScript", "TypeScript, @temporalio/activity"],
    [".NET", ".NET, Temporalio"],
  ] as const) {
    const screen = await renderSidebar({ sdk });
    const about = screen.getByRole("region", { name: "About" });
    await expect
      .poll(() => aboutRows(about.element() as HTMLElement)[0])
      .toEqual(["SDK", name]);
    await screen.unmount();
  }
});

test("an SDK web has no code for shows its name and the catalog's package", async () => {
  serveCatalog([...testCatalog, rustProfile]);
  const screen = await renderSidebar({ sdk: "Rust" });

  const about = screen.getByRole("region", { name: "About" });
  await expect
    .poll(() => aboutRows(about.element() as HTMLElement)[0])
    .toEqual(["SDK", "Rust, temporalio-sdk"]);
});

test("an SDK the catalog does not list shows its name only", async () => {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <>
            <aside aria-label="Zig">
              <ListingSidebar {...chargeCard} sdk="Zig" />
            </aside>
            <aside aria-label="Python">
              <ListingSidebar {...chargeCard} />
            </aside>
          </>
        ),
      },
    ],
    { initialEntries: ["/"] },
  );
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  const firstRow = (sdk: string) =>
    aboutRows(
      screen
        .getByRole("complementary", { name: sdk })
        .getByRole("region", { name: "About" })
        .element() as HTMLElement,
    )[0];

  // The Python sidebar shows its package once the catalog has arrived.
  await expect
    .poll(() => firstRow("Python"))
    .toEqual(["SDK", "Python, temporalio"]);
  expect(firstRow("Zig")).toEqual(["SDK", "Zig"]);
});

test("when the catalog cannot be read, the SDK row shows the name only and the card still renders", async () => {
  const failed = failCatalog();
  const screen = await renderSidebar();
  await failed;

  const about = screen.getByRole("region", { name: "About" });
  await expect.element(about).toBeVisible();
  expect(aboutRows(about.element() as HTMLElement)).toEqual([
    ["SDK", "Python"],
    ["Integrates with", "Stripe"],
    ["Dependencies", "stripe"],
    ["Published", "2 days ago"],
    ["License", "MIT-0"],
  ]);
});

test("several integrations and dependencies are listed in order, and each integration is a link", async () => {
  const screen = await renderSidebar({
    integrations: ["Stripe", "Slack"],
    dependencies: ["stripe", "slack_sdk"],
  });

  const about = screen.getByRole("region", { name: "About" });
  const rows = aboutRows(about.element() as HTMLElement);
  expect(rows).toContainEqual(["Integrates with", "Stripe, Slack"]);
  expect(rows).toContainEqual(["Dependencies", "stripe, slack_sdk"]);
  expect(
    about
      .getByRole("link")
      .elements()
      .map((link) => link.textContent),
  ).toEqual(["Stripe", "Slack"]);
  await expect
    .element(about.getByRole("link", { name: "stripe", exact: true }))
    .not.toBeInTheDocument();
});

test("each integration links to the results for that integration alone", async () => {
  const screen = await renderSidebar({
    integrations: ["Stripe", "Amazon S3", "Slack"],
  });

  const about = screen.getByRole("region", { name: "About" });
  for (const integration of ["Stripe", "Amazon S3", "Slack"] as const) {
    expect(
      about
        .getByRole("link", { name: integration, exact: true })
        .element()
        .getAttribute("href"),
    ).toBe(searchAddress({ integrations: [integration] }));
  }
});

test("clicking an integration opens /search for that integration", async () => {
  const screen = await renderSidebar({ integrations: ["Stripe", "Slack"] });

  await screen
    .getByRole("region", { name: "About" })
    .getByRole("link", { name: "Slack", exact: true })
    .click();

  expect(await searchOpened(screen)).toEqual({
    words: "",
    sdks: [],
    integrations: ["Slack"],
  });
});

test("an integration name with a space builds an address that reads back unchanged", async () => {
  const screen = await renderSidebar({ integrations: ["Amazon S3"] });

  const link = screen
    .getByRole("region", { name: "About" })
    .getByRole("link", { name: "Amazon S3", exact: true });
  const href = link.element().getAttribute("href") ?? "";
  expect(href).not.toContain(" ");
  expect(() => new URL(href, "https://durables.dev")).not.toThrow();
  await link.click();

  expect((await searchOpened(screen)).integrations).toEqual(["Amazon S3"]);
});

test("an integration not on the shared list shows as plain text", async () => {
  const screen = await renderSidebar({ integrations: ["Stripe", "Twilio"] });

  const about = screen.getByRole("region", { name: "About" });
  expect(aboutRows(about.element() as HTMLElement)).toContainEqual([
    "Integrates with",
    "Stripe, Twilio",
  ]);
  await expect
    .element(about.getByRole("link", { name: "Stripe", exact: true }))
    .toBeVisible();
  await expect.element(about.getByText("Twilio")).toBeVisible();
  await expect
    .element(about.getByRole("link", { name: "Twilio" }))
    .not.toBeInTheDocument();
});

test("a version with no integrations hides the Integrates with row", async () => {
  const screen = await renderSidebar({ integrations: [] });

  const about = screen.getByRole("region", { name: "About" });
  await expect.element(about).toBeVisible();
  await expect
    .element(about.getByText("Integrates with"))
    .not.toBeInTheDocument();
  expect(
    aboutRows(about.element() as HTMLElement).map(([term]) => term),
  ).toEqual(["SDK", "Dependencies", "Published", "License"]);
  await expect.element(about.getByRole("link")).not.toBeInTheDocument();
});

test('a version with no dependencies says "None beyond the SDK"', async () => {
  const screen = await renderSidebar({ dependencies: [] });

  const about = screen.getByRole("region", { name: "About" });
  expect(aboutRows(about.element() as HTMLElement)).toContainEqual([
    "Dependencies",
    "None beyond the SDK",
  ]);
  expect(
    aboutRows(about.element() as HTMLElement).map(([term]) => term),
  ).toEqual(["SDK", "Integrates with", "Dependencies", "Published", "License"]);
});

test('with no integrations and no dependencies, the row is hidden and Dependencies says "None beyond the SDK"', async () => {
  const screen = await renderSidebar({ integrations: [], dependencies: [] });

  const about = screen.getByRole("region", { name: "About" });
  await expect.element(about).toBeVisible();
  await expect
    .poll(() => aboutRows(about.element() as HTMLElement))
    .toEqual([
      ["SDK", "Python, temporalio"],
      ["Dependencies", "None beyond the SDK"],
      ["Published", "2 days ago"],
      ["License", "MIT-0"],
    ]);
});

test("a long dependency list wraps inside the card", async () => {
  const dependencies = Array.from(
    { length: 14 },
    (_, i) => `a_rather_long_package_name_${String(i)}`,
  );
  const screen = await renderSidebar({ dependencies });

  const about = screen.getByRole("region", { name: "About" });
  const value = about.getByText(dependencies.join(", "));
  await expect.element(value).toBeVisible();
  const card = about.element().getBoundingClientRect();
  const box = value.element().getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(card.left);
  expect(box.right).toBeLessThanOrEqual(card.right);
  expect(about.element().scrollWidth).toBeLessThanOrEqual(
    about.element().clientWidth,
  );
  // More than one line: the value is taller than the License row's single line.
  const license = about.getByText("MIT-0").element().getBoundingClientRect();
  expect(box.height).toBeGreaterThan(license.height * 2);
});

test("the Publisher card shows the initial in a circle and the handle, which links to the publisher's activities", async () => {
  const screen = await renderSidebar();

  const publisher = screen.getByRole("region", { name: "Publisher" });
  await expect
    .element(publisher.getByRole("heading", { level: 2, name: "Publisher" }))
    .toBeVisible();
  const handle = publisher.getByRole("link", { name: "ddieruf", exact: true });
  await expect.element(handle).toBeVisible();
  expect(handle.element().getAttribute("href")).toBe(
    searchAddress({ publisher: "ddieruf" }),
  );
  const initial = handle.element().previousElementSibling;
  expect(initial).toBeInstanceOf(HTMLElement);
  if (!(initial instanceof HTMLElement)) return;
  expect(initial.getAttribute("aria-hidden")).toBe("true");
  expect(initial.textContent).toBe("D");
  const circle = initial.getBoundingClientRect();
  expect(circle.width).toBe(circle.height);
  expect(getComputedStyle(initial).borderRadius).not.toBe("0px");
});

test('the Publisher card has a "Search all activities by" link to the publisher\'s activities', async () => {
  const screen = await renderSidebar();

  const publisher = screen.getByRole("region", { name: "Publisher" });
  const search = publisher.getByRole("link", {
    name: "Search all activities by ddieruf",
    exact: true,
  });
  await expect.element(search).toBeVisible();
  expect(search.element().getAttribute("href")).toBe(
    searchAddress({ publisher: "ddieruf" }),
  );
  // It sits under the handle.
  const handle = publisher.getByRole("link", { name: "ddieruf", exact: true });
  expect(search.element().getBoundingClientRect().top).toBeGreaterThanOrEqual(
    handle.element().getBoundingClientRect().bottom,
  );
});

test('clicking "Search all activities by" opens /search for that publisher', async () => {
  const screen = await renderSidebar();

  await screen
    .getByRole("link", { name: "Search all activities by ddieruf" })
    .click();

  expect(await searchOpened(screen)).toEqual({
    words: "",
    sdks: [],
    integrations: [],
    publisher: "ddieruf",
  });
});

test("clicking the handle opens the same results as Search all activities by", async () => {
  const screen = await renderSidebar();

  const publisher = screen.getByRole("region", { name: "Publisher" });
  const searchHref = publisher
    .getByRole("link", { name: "Search all activities by ddieruf" })
    .element()
    .getAttribute("href");
  await publisher.getByRole("link", { name: "ddieruf", exact: true }).click();

  expect(await searchOpened(screen)).toEqual({
    words: "",
    sdks: [],
    integrations: [],
    publisher: "ddieruf",
  });
  expect(
    `${screen.router.state.location.pathname}${screen.router.state.location.search}`,
  ).toBe(searchHref);
});

test("a handle with a hyphen builds an address that reads back unchanged", async () => {
  const screen = await renderSidebar({ handle: "data-loom" });

  const search = screen.getByRole("link", {
    name: "Search all activities by data-loom",
  });
  expect(search.element().getAttribute("href")).toBe(
    searchAddress({ publisher: "data-loom" }),
  );
  await search.click();

  expect((await searchOpened(screen)).publisher).toBe("data-loom");
});

test("the no-review note shows under the cards", async () => {
  const screen = await renderSidebar();

  const note = screen.getByText(
    "Durables doesn't review published code. You are responsible for what you run.",
    { exact: true },
  );
  await expect.element(note).toBeVisible();
  const publisher = screen
    .getByRole("region", { name: "Publisher" })
    .element()
    .getBoundingClientRect();
  expect(note.element().getBoundingClientRect().top).toBeGreaterThanOrEqual(
    publisher.bottom,
  );
});

test("the sidebar has no Report this activity link and no Provenance card", async () => {
  const screen = await renderSidebar();

  await expect
    .element(screen.getByRole("region", { name: "About" }))
    .toBeVisible();
  await expect.element(screen.getByText(/report/i)).not.toBeInTheDocument();
  await expect.element(screen.getByText(/provenance/i)).not.toBeInTheDocument();
  expect(
    screen
      .getByRole("link")
      .elements()
      .map((link) => link.textContent),
  ).toEqual(["Stripe", "ddieruf", "Search all activities by ddieruf"]);
  await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
  expect(
    screen
      .getByRole("heading")
      .elements()
      .map((heading) => heading.textContent),
  ).toEqual(["About", "Publisher"]);
});

// The SDK row's logo (API map D1–D9). Each logo comes from the catalog profile's logo URL;
// these tests serve the profile and the image the URL answers with.

const rubyCredit = "Ruby logo © 2006 Yukihiro Matsumoto, CC BY-SA 2.5";

/** A Java profile as the api answers it: a package, and no logo, credit or tile. */
const javaProfile = {
  ...rustProfile,
  name: "Java",
  package: "io.temporal:temporal-sdk",
  highlightLanguage: "java",
  activityFileName: "Activities.java",
};

async function emulateColorScheme(value: "light" | "dark" | "") {
  await cdp().send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value }],
  });
}

afterEach(async () => {
  await emulateColorScheme("");
});

/** The About card's SDK value: the definition beside the SDK term. */
function sdkValue(screen: Rendered): HTMLElement {
  const value = screen
    .getByRole("region", { name: "About" })
    .element()
    .querySelector("dd");
  if (!(value instanceof HTMLElement)) throw new Error("No SDK row.");
  return value;
}

/** The images in the SDK row, shown or not. */
function rowImages(screen: Rendered): HTMLImageElement[] {
  return [...sdkValue(screen).querySelectorAll("img")];
}

/** The SDK row's logo, once it shows. */
async function shownLogo(screen: Rendered): Promise<HTMLImageElement> {
  await expect.poll(() => rowImages(screen).length).toBe(1);
  const [logo] = rowImages(screen);
  if (logo === undefined) throw new Error("No logo.");
  await expect.element(logo).toBeVisible();
  return logo;
}

/** The text node that holds the SDK's name in the SDK row. */
function nameText(screen: Rendered, sdk: string): Text {
  const walker = document.createTreeWalker(
    sdkValue(screen),
    NodeFilter.SHOW_TEXT,
  );
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node instanceof Text && node.data === sdk) return node;
  }
  throw new Error(`No ${sdk} in the SDK row.`);
}

/** The box the SDK's name is drawn in. */
function nameBox(screen: Rendered, sdk: string): DOMRect {
  const range = document.createRange();
  range.selectNodeContents(nameText(screen, sdk));
  return range.getBoundingClientRect();
}

/** The first thing the SDK row holds, text or image, in reading order. */
function firstInRow(screen: Rendered): Node | null {
  const walker = document.createTreeWalker(
    sdkValue(screen),
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    (node) =>
      node instanceof Text || node instanceof HTMLImageElement
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP,
  );
  return walker.nextNode();
}

/**
 * Records what the SDK row shows each time it changes, as "name", "name+package" or
 * "logo+name+package", so a test can see whether the logo and package arrived together.
 */
function watchRow(screen: Rendered): string[] {
  const seen: string[] = [];
  const record = () => {
    const value = sdkValue(screen);
    const logo = [...value.querySelectorAll("img")].some(
      (image) => image.checkVisibility() && image.naturalWidth > 0,
    );
    const brokenImage = [...value.querySelectorAll("img")].some(
      (image) => image.checkVisibility() && image.naturalWidth === 0,
    );
    const hasPackage = value.textContent.includes(",");
    const state = [
      brokenImage ? "broken" : null,
      logo ? "logo" : null,
      "name",
      hasPackage ? "package" : null,
    ]
      .filter((part) => part !== null)
      .join("+");
    if (seen.at(-1) !== state) seen.push(state);
  };
  record();
  new MutationObserver(record).observe(sdkValue(screen), {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  return seen;
}

test("a profile with a logo URL shows that logo before the name, then the name and package", async () => {
  serveCatalog([logoProfile("Python")]);
  serveLogo(testLogo(16, 16));
  const screen = await renderSidebar();

  const logo = await shownLogo(screen);
  expect(new URL(logo.src).pathname).toBe("/api/sdks/Python/logo.svg");
  expect(firstInRow(screen)).toBe(logo);
  expect(
    aboutRows(
      screen.getByRole("region", { name: "About" }).element() as HTMLElement,
    )[0],
  ).toEqual(["SDK", "Python, temporalio"]);
  // 6px before the name, and centred on the name's line.
  const box = logo.getBoundingClientRect();
  const name = nameBox(screen, "Python");
  expect(name.left - box.right).toBeCloseTo(6, 0);
  expect(
    Math.abs((box.top + box.bottom) / 2 - (name.top + name.bottom) / 2),
  ).toBeLessThanOrEqual(1);
});

test("the logo is 16px tall, and its width follows its proportions up to 40px", async () => {
  for (const [width, height, shownWidth] of [
    [16, 16, 16],
    [100, 80, 20],
    [207, 78, 40],
  ] as const) {
    serveCatalog([logoProfile("Python")]);
    serveLogo(testLogo(width, height));
    const screen = await renderSidebar();
    const box = (await shownLogo(screen)).getBoundingClientRect();
    expect(box.height).toBe(16);
    expect(box.width).toBeCloseTo(shownWidth, 0);
    await screen.unmount();
  }
});

test("the logo shows in its own colours, with no tint, filter or blend", async () => {
  serveCatalog([logoProfile("Python")]);
  serveLogo(testLogo(16, 16));
  const screen = await renderSidebar();

  const style = getComputedStyle(await shownLogo(screen));
  expect(style.filter).toBe("none");
  expect(style.mixBlendMode).toBe("normal");
  expect(style.opacity).toBe("1");
  expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
});

describe.each(["dark", "light"] as const)(
  "under a %s colour scheme",
  (scheme) => {
    test("a profile with the tile flag shows its logo on a cream tile with 2px padding and the tag radius", async () => {
      await emulateColorScheme(scheme);
      serveCatalog([logoProfile("Rust", { lightTile: true })]);
      serveLogo(testLogo(16, 16));
      const screen = await renderSidebar({ sdk: "Rust" });

      const logo = await shownLogo(screen);
      const style = getComputedStyle(logo);
      expect(style.backgroundColor).toBe("rgb(255, 251, 245)");
      for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
        expect(style[`padding${side}`]).toBe("2px");
      }
      expect(style.borderRadius).toBe("6px");
      // The logo stays 16px tall inside the tile.
      expect(logo.getBoundingClientRect().height).toBe(20);
      expect(logo.clientHeight - 4).toBe(16);
    });
  },
);

test("a profile without the tile flag shows its logo with no tile", async () => {
  serveCatalog([logoProfile("Python")]);
  serveLogo(testLogo(16, 16));
  const screen = await renderSidebar();

  const style = getComputedStyle(await shownLogo(screen));
  expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(style.paddingTop).toBe("0px");
  expect(style.paddingLeft).toBe("0px");
});

test("a profile with a credit shows it as the logo's tooltip", async () => {
  serveCatalog([logoProfile("Ruby", { credit: rubyCredit })]);
  serveLogo(testLogo(16, 16));
  const screen = await renderSidebar({ sdk: "Ruby" });

  const logo = screen
    .getByRole("region", { name: "About" })
    .getByRole("img", { name: rubyCredit });
  await expect.element(logo).toBeVisible();
  expect(logo.element().getAttribute("title")).toBe(rubyCredit);
});

test("a profile without a credit gives its logo empty alt text and no tooltip", async () => {
  serveCatalog([logoProfile("Python")]);
  serveLogo(testLogo(16, 16));
  const screen = await renderSidebar();

  const logo = await shownLogo(screen);
  expect(logo.getAttribute("alt")).toBe("");
  expect(logo.hasAttribute("title")).toBe(false);
  await expect
    .element(screen.getByRole("region", { name: "About" }).getByRole("img"))
    .not.toBeInTheDocument();
});

test("a logo that fails to load leaves the name and package, with no image, placeholder or gap", async () => {
  serveCatalog([logoProfile("Python")]);
  failLogo();
  const screen = await renderSidebar();
  const seen = watchRow(screen);

  await expect
    .poll(() => sdkValue(screen).textContent)
    .toBe("Python, temporalio");
  expect(rowImages(screen)).toEqual([]);
  // The name starts the row, where it starts with no logo.
  expect(firstInRow(screen)).toBe(nameText(screen, "Python"));
  expect(seen.filter((state) => state.startsWith("broken"))).toEqual([]);
});

test("the logo and package appear together once the logo has loaded", async () => {
  serveCatalog([logoProfile("Python")]);
  const answer = holdLogo(testLogo(16, 16));
  const screen = await renderSidebar();

  // The catalog has arrived and the logo is loading: the name alone.
  await expect.poll(() => rowImages(screen).length).toBe(1);
  const seen = watchRow(screen);
  expect(sdkValue(screen).textContent).toBe("Python");
  await expect.element(rowImages(screen)[0] ?? null).not.toBeVisible();

  answer();
  await shownLogo(screen);
  await expect
    .poll(() => sdkValue(screen).textContent)
    .toBe("Python, temporalio");
  expect(seen).toEqual(["name", "logo+name+package"]);
});

test("the package appears once the logo has failed, and the name never moves for a logo", async () => {
  serveCatalog([logoProfile("Python")]);
  const answer = holdLogo("not an image");
  const screen = await renderSidebar();

  await expect.poll(() => rowImages(screen).length).toBe(1);
  const seen = watchRow(screen);
  expect(sdkValue(screen).textContent).toBe("Python");

  answer();
  await expect
    .poll(() => sdkValue(screen).textContent)
    .toBe("Python, temporalio");
  expect(rowImages(screen)).toEqual([]);
  expect(seen).toEqual(["name", "name+package"]);
});

test("while the catalog loads, the SDK row shows the name alone", async () => {
  const answer = holdCatalog([logoProfile("Python")]);
  serveLogo(testLogo(16, 16));
  const screen = await renderSidebar();

  await expect
    .element(screen.getByRole("region", { name: "About" }))
    .toBeVisible();
  expect(sdkValue(screen).textContent).toBe("Python");
  expect(rowImages(screen)).toEqual([]);

  answer();
  await shownLogo(screen);
  await expect
    .poll(() => sdkValue(screen).textContent)
    .toBe("Python, temporalio");
});

test("when the catalog cannot be read, the SDK row shows the name alone, with no logo", async () => {
  const failed = failCatalog();
  serveLogo(testLogo(16, 16));
  const screen = await renderSidebar();
  await failed;

  expect(sdkValue(screen).textContent).toBe("Python");
  expect(rowImages(screen)).toEqual([]);
});

test("a profile with no logo URL, such as Java's, shows the name and package with no image or gap", async () => {
  const logoReads: string[] = [];
  worker.use(
    http.get(logoPath, ({ request }) => {
      logoReads.push(request.url);
    }),
  );
  serveCatalog([javaProfile]);
  const screen = await renderSidebar({ sdk: "Java" });

  await expect
    .poll(() => sdkValue(screen).textContent)
    .toBe("Java, io.temporal:temporal-sdk");
  expect(rowImages(screen)).toEqual([]);
  // Nothing sits before the name: it starts the row, as it always has.
  expect(firstInRow(screen)).toBe(nameText(screen, "Java"));
  expect(logoReads).toEqual([]);
});
