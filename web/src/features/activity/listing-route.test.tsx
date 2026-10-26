import { routes } from "@/app/router";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";
import { worker } from "../../../test/worker";

const versionPath = "/api/activities/:handle/:name/versions/:version";
const listingPath = "/api/activities/:handle/:name";

const chargeCard = {
  address: "ddieruf/charge-card@1.0.0",
  handle: "ddieruf",
  name: "charge-card",
  version: "1.0.0",
  title: "Charge card",
  sdk: "python",
};

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
        ? HttpResponse.json({ ...chargeCard, facts: {} })
        : notFound("No activity is published at that address."),
    ),
    http.get(listingPath, ({ params }) =>
      params["handle"] === "ddieruf" && params["name"] === "charge-card"
        ? HttpResponse.json({
            handle: "ddieruf",
            name: "charge-card",
            description:
              "Charges a card with Stripe and returns the charge ID.",
          })
        : notFound("No activity is listed at that address."),
    ),
  );
}

const stopCounting: (() => void)[] = [];

afterEach(() => {
  for (const stop of stopCounting.splice(0)) stop();
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

// The real route tree, opened at an address as if typed into the browser.
async function openAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const screen = await render(<RouterProvider router={router} />, {
    wrapper: TestProviders,
  });
  return { screen, router };
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
      return HttpResponse.json({ ...chargeCard, facts: {} });
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
