import { routes } from "@/app/router";
import { searchAddress } from "@/lib/search-address";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { TestProviders } from "../../../test/test-providers";

// The real route tree, opened at an address as if typed into the browser. The header reads
// the session, which the default MSW handler answers as an anonymous visitor.
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

type Screen = Awaited<ReturnType<typeof openAt>>["screen"];

const labels = [
  "Words",
  "Temporal SDK",
  "Integrates with",
  "Publisher",
] as const;

/** The value the page shows beside one of its labels, which it lists in this order. */
function shown(screen: Screen, label: (typeof labels)[number]) {
  return screen.getByRole("definition").nth(labels.indexOf(label));
}

const chargeSearch = searchAddress({
  words: "charge & refund café",
  sdks: ["Python", ".NET"],
  integrations: ["Stripe", "Amazon S3"],
});

const slackSearch = searchAddress({
  words: "post message",
  sdks: ["TypeScript"],
  integrations: ["Slack"],
});

test("/search is registered inside the page frame", () => {
  const [frame] = routes;
  expect(frame?.children?.map((route) => route.path)).toContain("/search");
});

test("the page lists the labels in order", async () => {
  const { screen } = await openAt("/search");

  await expect.element(screen.getByRole("term").first()).toBeVisible();
  expect(
    screen
      .getByRole("term")
      .elements()
      .map((term) => term.textContent),
  ).toEqual([...labels]);
});

test("/search opens the search page, not a publisher's page", async () => {
  const { screen } = await openAt("/search");

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Search" }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Page not found"))
    .not.toBeInTheDocument();
  await expect.poll(() => document.title).toBe("Search · Durables");
});

test("the page reads the words and filters in its address", async () => {
  const { screen } = await openAt(chargeSearch);

  await expect
    .element(shown(screen, "Words"))
    .toHaveTextContent("charge & refund café");
  await expect
    .element(shown(screen, "Temporal SDK"))
    .toHaveTextContent("Python, .NET");
  await expect
    .element(shown(screen, "Integrates with"))
    .toHaveTextContent("Stripe, Amazon S3");
});

test("a publisher in the address is read", async () => {
  const { screen } = await openAt(searchAddress({ publisher: "ddieruf" }));

  await expect.element(shown(screen, "Publisher")).toHaveTextContent("ddieruf");
});

test("an address with no parameters means every activity with no filters", async () => {
  const { screen } = await openAt("/search");

  await expect.element(shown(screen, "Words")).toHaveTextContent("None");
  await expect.element(shown(screen, "Temporal SDK")).toHaveTextContent("Any");
  await expect
    .element(shown(screen, "Integrates with"))
    .toHaveTextContent("Any");
  await expect.element(shown(screen, "Publisher")).toHaveTextContent("Any");
});

test("unknown SDK and integration values in the address are ignored", async () => {
  const { screen } = await openAt(
    "/search?sdk=Java&integration=Twilio&integration=Slack",
  );

  await expect.element(shown(screen, "Temporal SDK")).toHaveTextContent("Any");
  await expect
    .element(shown(screen, "Integrates with"))
    .toHaveTextContent("Slack");
});

test("opening the same address again, as a refresh does, shows the same search", async () => {
  const first = await openAt(chargeSearch);
  await expect
    .element(shown(first.screen, "Words"))
    .toHaveTextContent("charge & refund café");
  await first.screen.unmount();

  const { screen } = await openAt(chargeSearch);

  await expect
    .element(shown(screen, "Words"))
    .toHaveTextContent("charge & refund café");
  await expect
    .element(shown(screen, "Temporal SDK"))
    .toHaveTextContent("Python, .NET");
  await expect
    .element(shown(screen, "Integrates with"))
    .toHaveTextContent("Stripe, Amazon S3");
});

test("Back returns to the previous search's words and filters", async () => {
  const { router, screen } = await openAt(chargeSearch, slackSearch);
  await expect
    .element(shown(screen, "Words"))
    .toHaveTextContent("post message");

  await router.navigate(-1);

  await expect
    .element(shown(screen, "Words"))
    .toHaveTextContent("charge & refund café");
  await expect
    .element(shown(screen, "Temporal SDK"))
    .toHaveTextContent("Python, .NET");
  await expect
    .element(shown(screen, "Integrates with"))
    .toHaveTextContent("Stripe, Amazon S3");
});
