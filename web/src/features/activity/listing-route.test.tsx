import "@/styles/global.css";
import { routes } from "@/app/router";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";

const versionPath = "/api/activities/:handle/:name/versions/:version";
const listingPath = "/api/activities/:handle/:name";

const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

// The version response's full shape, as the API answers it.
const chargeCard = {
  address: "ddieruf/charge-card@1.0.0",
  handle: "ddieruf",
  name: "charge-card",
  version: "1.0.0",
  title: "Charge card",
  sdk: "Python",
  facts: {
    activity: { name: "charge_card", line: 26 },
    input: "ChargeRequest",
    output: "ChargeResult",
    runsAs: "sync",
    nonRetryableErrors: [],
    configurationRead: [{ name: "STRIPE_API_KEY", line: 8 }],
    dependencies: [{ name: "stripe", line: 4 }],
    heartbeats: [],
  },
  code: "from temporalio import activity\n",
  activityFileName: "activities.py",
  snippets: [],
  integrations: [],
  publishedAt: twoDaysAgo.toISOString(),
};

const chargeCardDescription =
  "Charges a card with Stripe and returns the charge ID.";

const problemHeaders = { "Content-Type": "application/problem+json" };

function notFound(detail: string) {
  return HttpResponse.json(
    { type: "about:blank", title: "Not Found", status: 404, detail },
    { status: 404, headers: problemHeaders },
  );
}

function serverError() {
  return HttpResponse.json(
    { type: "about:blank", title: "Internal Server Error", status: 500 },
    { status: 500, headers: problemHeaders },
  );
}

/** Answers the version and listing reads for ddieruf/charge-card@1.0.0 only. */
function publishChargeCard() {
  worker.use(
    http.get(versionPath, ({ params }) =>
      params["handle"] === "ddieruf" &&
      params["name"] === "charge-card" &&
      params["version"] === "1.0.0"
        ? HttpResponse.json(chargeCard)
        : notFound("No activity is published at that address."),
    ),
    http.get(listingPath, ({ params }) =>
      params["handle"] === "ddieruf" && params["name"] === "charge-card"
        ? HttpResponse.json({
            handle: "ddieruf",
            name: "charge-card",
            description: chargeCardDescription,
          })
        : notFound("No activity is listed at that address."),
    ),
  );
}

const stopCounting: (() => void)[] = [];

afterEach(async () => {
  for (const stop of stopCounting.splice(0)) stop();
  vi.restoreAllMocks();
  await page.viewport(414, 896);
});

/** Counts every read of a listing or a version, so a test can say none was sent. */
function countActivityReads() {
  const reads: string[] = [];
  const count = ({ request }: { request: Request }) => {
    if (new URL(request.url).pathname.startsWith("/api/activities")) {
      reads.push(request.url);
    }
  };
  worker.events.on("request:start", count);
  stopCounting.push(() => {
    worker.events.removeListener("request:start", count);
  });
  return reads;
}

/**
 * The address copy's status region, in the top of the page. The code blocks lower down
 * each have their own status region.
 */
async function addressStatus(
  screen: Awaited<ReturnType<typeof openAt>>["screen"],
) {
  const title = screen.getByRole("heading", { level: 1 });
  await expect.element(title).toBeVisible();
  const top = title.element().closest("header");
  if (top === null) throw new Error("The title is not in the top of the page.");
  return page.elementLocator(top).getByRole("status");
}

// The real route tree, opened at an address as if typed into the browser.
async function openAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  return { screen, router };
}

// The top of the page, once the title shows. The sidebar repeats the handle, the published
// time and MIT-0, so assertions about the top look only inside it.
async function topOfPage(screen: Awaited<ReturnType<typeof openAt>>["screen"]) {
  const title = screen.getByRole("heading", { level: 1 });
  await expect.element(title).toBeVisible();
  const header = title.element().closest("header");
  if (header === null) throw new Error("The title is not inside a header.");
  return page.elementLocator(header);
}

test("a published listing shows its title, address and description", async () => {
  publishChargeCard();

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  const main = screen.getByRole("main");
  await expect
    .element(main.getByRole("heading", { level: 1, name: "Charge card" }))
    .toBeVisible();
  await expect
    .element(main.getByText("ddieruf/charge-card@1.0.0", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      main.getByText("Charges a card with Stripe and returns the charge ID."),
    )
    .toBeVisible();
  await expect.poll(() => document.title).toBe("Charge card · Durables");
});

test("the listing page sits inside the frame, with the header and footer", async () => {
  publishChargeCard();

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Charge card" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Durables home" }))
    .toBeVisible();
  await expect.element(screen.getByRole("contentinfo")).toBeInTheDocument();
});

test("the listing page shows a loading state until the listing arrives", async () => {
  let answer: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  publishChargeCard();
  worker.use(
    http.get(versionPath, async () => {
      await answered;
      return HttpResponse.json(chargeCard);
    }),
  );

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Loading the listing…");
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Charge card" }))
    .not.toBeInTheDocument();

  answer();

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Charge card" }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Loading the listing…"))
    .not.toBeInTheDocument();
});

test("an address with no published version shows the not-found page", async () => {
  publishChargeCard();

  const { screen } = await openAt("/ddieruf/charge-card@2.0.0");

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Page not found" }))
    .toBeVisible();
  await expect.poll(() => document.title).toBe("Page not found · Durables");
});

test("an address with no listing shows the not-found page", async () => {
  publishChargeCard();

  const { screen } = await openAt("/someone/no-such-activity@1.0.0");

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Page not found" }))
    .toBeVisible();
});

test("a 404 for the listing alone shows the not-found page", async () => {
  publishChargeCard();
  worker.use(http.get(listingPath, () => notFound("Not listed.")));

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Page not found" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Charge card" }))
    .not.toBeInTheDocument();
});

test("a path that cannot be an address shows the not-found page without asking the API", async () => {
  const reads = countActivityReads();

  for (const path of [
    "/ddieruf/charge-card",
    "/ddieruf/charge-card@1.0",
    "/DDieruf/charge-card@1.0.0",
  ]) {
    const { screen } = await openAt(path);

    await expect
      .element(
        screen.getByRole("heading", { level: 1, name: "Page not found" }),
      )
      .toBeVisible();
    await screen.unmount();
  }
  expect(reads).toEqual([]);
});

test.each([
  { path: "/terms", heading: "Terms" },
  { path: "/privacy", heading: "Privacy" },
  { path: "/security", heading: "Security" },
])(
  "$path still opens its site page and not the listing route",
  async ({ path, heading }) => {
    const reads = countActivityReads();

    const { screen } = await openAt(path);

    await expect
      .element(screen.getByRole("heading", { level: 1, name: heading }))
      .toBeVisible();
    expect(reads).toEqual([]);
  },
);

test("the home page still opens at /", async () => {
  const { screen } = await openAt("/");

  await expect
    .element(
      screen.getByRole("heading", {
        level: 1,
        name: "Temporal activities, ready to copy.",
      }),
    )
    .toBeVisible();
});

test("a Contribute step still opens the Contribute flow and not a listing", async () => {
  const reads = countActivityReads();

  const { screen, router } = await openAt("/contribute/profile");

  await expect
    .element(screen.getByRole("region", { name: "Profile & Handle" }))
    .toBeInTheDocument();
  expect(router.state.matches.at(-1)?.route.path).toBe("/contribute/:step?");
  expect(reads).toEqual([]);
});

test.each(["terms", "privacy", "security", "contribute", "search", "api"])(
  "a listing-shaped path under the reserved word %s is not found, not a listing",
  async (reserved) => {
    const reads = countActivityReads();

    const { screen } = await openAt(`/${reserved}/charge-card@1.0.0`);

    // /contribute/<anything> belongs to the Contribute flow, which handles unknown steps.
    if (reserved === "contribute") {
      await expect
        .element(screen.getByRole("heading", { name: "Charge card" }))
        .not.toBeInTheDocument();
    } else {
      await expect
        .element(
          screen.getByRole("heading", { level: 1, name: "Page not found" }),
        )
        .toBeVisible();
    }
    expect(reads).toEqual([]);
  },
);

test("a server error shows an error state with a way to try again", async () => {
  publishChargeCard();
  worker.use(http.get(versionPath, () => serverError()));

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  await expect
    .element(
      screen.getByRole("heading", { level: 1, name: "Something went wrong" }),
    )
    .toBeVisible();
  await expect
    .element(screen.getByText("This listing could not be loaded."))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Try again" }))
    .toBeVisible();
});

test("a failed listing read shows the error state too", async () => {
  publishChargeCard();
  worker.use(http.get(listingPath, () => serverError()));

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  await expect
    .element(
      screen.getByRole("heading", { level: 1, name: "Something went wrong" }),
    )
    .toBeVisible();
});

test("a network failure shows the error state and not a blank page", async () => {
  publishChargeCard();
  worker.use(http.get(versionPath, () => HttpResponse.error()));

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  await expect
    .element(
      screen.getByRole("heading", { level: 1, name: "Something went wrong" }),
    )
    .toBeVisible();
});

test("trying again after a server error shows the listing once it answers", async () => {
  publishChargeCard();
  worker.use(http.get(versionPath, () => serverError(), { once: true }));

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  await screen.getByRole("button", { name: "Try again" }).click();

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Charge card" }))
    .toBeVisible();
  await expect
    .element(screen.getByText("ddieruf/charge-card@1.0.0", { exact: true }))
    .toBeVisible();
});

test("the top of the page shows the icon, title, SDK, address, description, publisher line and MIT-0", async () => {
  publishChargeCard();

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  const main = screen.getByRole("main");
  const title = main.getByRole("heading", { level: 1, name: "Charge card" });
  await expect.element(title).toBeVisible();
  await expect.element(main.getByText("Python", { exact: true })).toBeVisible();
  await expect
    .element(main.getByText("ddieruf/charge-card@1.0.0", { exact: true }))
    .toBeVisible();
  await expect
    .element(main.getByRole("button", { name: "Copy address" }))
    .toBeVisible();
  await expect.element(main.getByText(chargeCardDescription)).toBeVisible();
  const top = await topOfPage(screen);
  await expect.element(top.getByText("ddieruf", { exact: true })).toBeVisible();
  await expect
    .element(top.getByText("Published 2 days ago", { exact: true }))
    .toBeVisible();
  await expect.element(top.getByText("MIT-0", { exact: true })).toBeVisible();

  // The square icon sits to the left of the title.
  const icon = title.element().closest("header")?.querySelector("svg");
  expect(icon).toBeInstanceOf(SVGElement);
  const iconBox = icon?.parentElement?.getBoundingClientRect();
  expect(iconBox?.width).toBe(iconBox?.height);
  expect(iconBox?.right ?? Infinity).toBeLessThanOrEqual(
    title.element().getBoundingClientRect().left,
  );
});

test("the publisher line shows the initial in a circle and the handle as plain text", async () => {
  publishChargeCard();

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  const top = await topOfPage(screen);
  const handle = top.getByText("ddieruf", { exact: true });
  await expect.element(handle).toBeVisible();
  expect(handle.element().closest("a")).toBeNull();
  const initial = handle.element().previousElementSibling;
  expect(initial).toBeInstanceOf(HTMLElement);
  if (!(initial instanceof HTMLElement)) return;
  expect(initial.getAttribute("aria-hidden")).toBe("true");
  expect(initial.textContent).toBe("D");
  expect(getComputedStyle(initial).borderRadius).not.toBe("0px");
  await expect
    .element(screen.getByRole("main").getByRole("link", { name: "ddieruf" }))
    .not.toBeInTheDocument();
});

test("the published time is the version's own timestamp", async () => {
  publishChargeCard();

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  const top = await topOfPage(screen);
  const time = top.getByText("2 days ago", { exact: true });
  await expect.element(time).toBeVisible();
  expect(time.element().getAttribute("datetime")).toBe(chargeCard.publishedAt);
});

test("a listing with no description shows no description line", async () => {
  publishChargeCard();
  worker.use(
    http.get(listingPath, () =>
      HttpResponse.json({
        handle: "ddieruf",
        name: "charge-card",
        description: "",
      }),
    ),
  );

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  const title = screen.getByRole("heading", { level: 1, name: "Charge card" });
  await expect.element(title).toBeVisible();
  const header = title.element().closest("header");
  const lines = [
    ...(header?.querySelectorAll("p:not([role=status])") ?? []),
  ].map((line) => line.textContent);
  expect(lines).not.toContain("");
  expect(lines).not.toContain(chargeCardDescription);
});

test('copying the address puts it on the clipboard and shows "Copied" beside it', async () => {
  const writeText = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined);
  publishChargeCard();

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  const copy = screen.getByRole("button", { name: "Copy address" });
  const status = await addressStatus(screen);
  await expect.element(status).toHaveTextContent("");

  await copy.click();

  await expect.element(status).toHaveTextContent("Copied");
  expect(writeText).toHaveBeenCalledWith("ddieruf/charge-card@1.0.0");
  const button = copy.element().getBoundingClientRect();
  const copied = status.element().getBoundingClientRect();
  expect(
    Math.abs(copied.top + copied.height / 2 - (button.top + button.height / 2)),
  ).toBeLessThan(8);
  expect(copied.left).toBeGreaterThanOrEqual(button.right);
});

test('a copy the clipboard refuses does not show "Copied" and says it failed', async () => {
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
    new DOMException("Denied", "NotAllowedError"),
  );
  publishChargeCard();

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  await screen.getByRole("button", { name: "Copy address" }).click();

  const status = await addressStatus(screen);
  await expect.element(status).toHaveTextContent("Couldn't copy the address.");
  await expect.element(status).not.toHaveTextContent("Copied");
});

test("Quickstart and the section bar link to the Implement, Configure and Source anchors", async () => {
  publishChargeCard();

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  const main = screen.getByRole("main");
  const quickstart = main.getByRole("link", { name: "Quickstart" });
  await expect.element(quickstart).toHaveAttribute("href", "#implement");
  const bar = main.getByRole("navigation", { name: "Page sections" });
  const links = bar.getByRole("link").elements();
  expect(links.map((link) => link.textContent)).toEqual([
    "Implement",
    "Configure",
    "Source",
  ]);
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "#implement",
    "#configure",
    "#source",
  ]);
  for (const id of ["implement", "configure", "source"]) {
    expect(document.getElementById(id)?.tagName).toBe("SECTION");
  }
});

test("Quickstart sits at the top right, beside the title, on a wide window", async () => {
  await page.viewport(1280, 900);
  publishChargeCard();

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  const title = screen.getByRole("heading", { level: 1, name: "Charge card" });
  const quickstart = screen.getByRole("link", { name: "Quickstart" });
  await expect.element(quickstart).toBeVisible();
  const titleBox = title.element().getBoundingClientRect();
  const quickstartBox = quickstart.element().getBoundingClientRect();
  expect(quickstartBox.left).toBeGreaterThan(titleBox.right);
  expect(quickstartBox.top).toBeLessThan(titleBox.bottom);
});

test("on a wide window the sidebar sits beside the main column", async () => {
  await page.viewport(1280, 900);
  publishChargeCard();

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Charge card" }))
    .toBeVisible();
  const implement = document.getElementById("implement");
  const sidebar = document.querySelector("main aside");
  const sectionsBox = implement?.parentElement?.getBoundingClientRect();
  const sidebarBox = sidebar?.getBoundingClientRect();
  expect(sidebarBox?.left).toBeGreaterThanOrEqual(
    sectionsBox?.right ?? Infinity,
  );
  expect(sidebarBox?.top).toBe(sectionsBox?.top);
});

test("below about 960px the sidebar moves under the main column and the top stacks", async () => {
  await page.viewport(900, 900);
  publishChargeCard();

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  const title = screen.getByRole("heading", { level: 1, name: "Charge card" });
  await expect.element(title).toBeVisible();
  const implement = document.getElementById("implement");
  const sidebar = document.querySelector("main aside");
  const sectionsBox = implement?.parentElement?.getBoundingClientRect();
  const sidebarBox = sidebar?.getBoundingClientRect();
  expect(sidebarBox?.top).toBeGreaterThanOrEqual(
    sectionsBox?.bottom ?? Infinity,
  );
  expect(sidebarBox?.left).toBe(sectionsBox?.left);

  const publisher = (await topOfPage(screen)).getByText("MIT-0", {
    exact: true,
  });
  const quickstart = screen.getByRole("link", { name: "Quickstart" });
  expect(
    quickstart.element().getBoundingClientRect().top,
  ).toBeGreaterThanOrEqual(publisher.element().getBoundingClientRect().bottom);
});

test("the page shows no popularity signal, no Start a workflow and no version picker", async () => {
  publishChargeCard();

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  const main = screen.getByRole("main");
  await expect
    .element(main.getByRole("heading", { level: 1, name: "Charge card" }))
    .toBeVisible();
  await expect
    .element(main.getByText(/start a workflow/i))
    .not.toBeInTheDocument();
  await expect
    .element(main.getByRole("button", { name: /1\.0\.0|version/i }))
    .not.toBeInTheDocument();
  await expect.element(main.getByRole("combobox")).not.toBeInTheDocument();
  await expect.element(main.getByRole("listbox")).not.toBeInTheDocument();
  await expect
    .element(main.getByText(/stars?\b|downloads?|installs|popular|rating|★/i))
    .not.toBeInTheDocument();
  expect(
    main
      .getByRole("button")
      .elements()
      .map((button) => button.getAttribute("aria-label") ?? button.textContent),
  ).toEqual(["Copy address", "Copy published code"]);
});

test("Configure shows the version's detected variables, type names and worker requirements", async () => {
  publishChargeCard();

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  const configure = screen.getByRole("main");
  const heading = configure.getByRole("heading", {
    level: 2,
    name: "Configure",
  });
  await expect.element(heading).toBeVisible();
  expect(heading.element().closest("section")?.id).toBe("configure");
  await expect
    .element(
      configure
        .getByRole("list", { name: "Environment variables" })
        .getByRole("listitem"),
    )
    .toHaveTextContent("STRIPE_API_KEY");
  const types = configure.getByRole("list", { name: "Input and output types" });
  await expect.element(types.getByText("ChargeRequest")).toBeVisible();
  await expect.element(types.getByText("ChargeResult")).toBeVisible();
  await expect
    .element(configure.getByRole("heading", { name: "Worker requirements" }))
    .toBeVisible();
  await expect.element(configure.getByText(/thread pool/)).toBeVisible();
});

test("Source shows the published code, headed with the activity file name and line count", async () => {
  const writeText = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined);
  publishChargeCard();

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  const main = screen.getByRole("main");
  const heading = main.getByRole("heading", { level: 2, name: "Source" });
  await expect.element(heading).toBeVisible();
  const section = heading.element().closest("section");
  expect(section?.id).toBe("source");
  const source = page.elementLocator(section ?? document.body);
  await expect
    .element(source.getByText("activities.py · 2 lines"))
    .toBeVisible();
  const code = source.getByRole("region", { name: "published code" });
  expect(code.element().querySelector("code")?.textContent).toBe(
    chargeCard.code,
  );

  await source.getByRole("button", { name: "Copy published code" }).click();

  await expect.element(source.getByRole("status")).toHaveTextContent("Copied");
  expect(writeText).toHaveBeenCalledWith(chargeCard.code);
});

test("the sidebar shows the version's About and Publisher cards and the no-review note", async () => {
  publishChargeCard();
  worker.use(
    http.get(versionPath, () =>
      HttpResponse.json({ ...chargeCard, integrations: ["Stripe"] }),
    ),
  );

  const { screen } = await openAt("/ddieruf/charge-card@1.0.0");

  const sidebar = screen.getByRole("complementary");
  const about = sidebar.getByRole("region", { name: "About" });
  await expect.element(about).toBeVisible();
  expect(
    [...about.element().querySelectorAll("dt")].map((term) => [
      term.textContent,
      term.nextElementSibling?.textContent,
    ]),
  ).toEqual([
    ["SDK", "Python, temporalio"],
    ["Integrates with", "Stripe"],
    ["Dependencies", "stripe"],
    ["Published", "2 days ago"],
    ["License", "MIT-0"],
  ]);
  const publisher = sidebar.getByRole("region", { name: "Publisher" });
  await expect
    .element(publisher.getByText("ddieruf", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      sidebar.getByText(
        "Durables doesn't review published code. You are responsible for what you run.",
      ),
    )
    .toBeVisible();
  await expect.element(sidebar.getByRole("link")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("main").getByText(/report this activity/i))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("main").getByText(/provenance/i))
    .not.toBeInTheDocument();
});
