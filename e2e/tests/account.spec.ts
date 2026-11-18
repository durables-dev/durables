import type { Page } from "@playwright/test";
import {
  expect,
  publisherInitials,
  publisherName,
  sample,
  test,
  type PublishDetails,
} from "../fixtures";

// Signing in from the header, the account menu, signing out, and the owner's profile
// (API map D1 to D6, D9, D10, D15). The provider's consent screen is another origin, which
// these tests never reach, so a finished sign-in is the local fake provider's.

const python = sample("python");

/** The Slack activity in python.txt, titled with a word unique to the test. */
function slackListing(word: string): PublishDetails {
  return {
    code: python,
    title: `Post slack message ${word}`,
    name: "post-slack-message",
    description:
      "Posts a message to a Slack channel and returns its reference.",
  };
}

/** The four providers, in the order the Sign in page offers them. */
const providers = [
  { id: "github", name: "GitHub" },
  { id: "gitlab", name: "GitLab" },
  { id: "google", name: "Google" },
  { id: "microsoft", name: "Microsoft" },
] as const;

const failedMessage =
  "Sign-in didn't finish. Try again, or choose another provider.";

function header(page: Page) {
  return page.getByRole("banner");
}

function signInLink(page: Page) {
  return header(page).getByRole("link", { name: "Sign in", exact: true });
}

function accountMenu(page: Page) {
  return header(page).getByRole("button", { name: "Account menu" });
}

/** The Sign in page's address when it was opened from `from`. */
function signInPageFrom(from: string): string {
  return `/sign-in?${new URLSearchParams({ returnTo: from }).toString()}`;
}

/** The API route a provider button starts sign-in with, carrying the starting page. */
function startPath(provider: string, from: string): string {
  return `/api/session/providers/${provider}?${new URLSearchParams({ returnTo: from }).toString()}`;
}

/** Waits for the page's read of the session, which decides what the header shows. */
function sessionRead(page: Page) {
  return page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/session",
  );
}

async function expectProvidersStartFrom(page: Page, from: string) {
  for (const { id, name } of providers) {
    await expect(
      page.getByRole("link", { name: `Continue with ${name}` }),
    ).toHaveAttribute("href", startPath(id, from));
  }
}

async function signOutFromMenu(page: Page) {
  await accountMenu(page).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
}

test.describe("the header Sign in link", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("shows to the left of Contribute on the home page and opens Sign in with the home page to return to", async ({
    page,
    expectAccessible,
  }) => {
    const session = sessionRead(page);
    await page.goto("/");
    await session;

    // The logo link's text is the wordmark.
    await expect(header(page).getByRole("link")).toHaveText([
      "Durables",
      "Sign in",
      "Contribute",
    ]);
    await expectAccessible();

    await signInLink(page).click();

    await expect(page).toHaveURL(signInPageFrom("/"));
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign in" }),
    ).toBeVisible();
    await expectProvidersStartFrom(page, "/");
  });

  test("shows on an activity page", async ({
    page,
    expectAccessible,
    publishListing,
    uniqueWord,
  }) => {
    const listing = await publishListing(slackListing(uniqueWord()));

    const session = sessionRead(page);
    await page.goto(`/${listing.address}`);
    await session;

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(signInLink(page)).toBeVisible();
    await expectAccessible();
  });

  for (const path of ["/contribute", "/contribute/code"]) {
    test(`is absent on the Contribute page at ${path}`, async ({
      page,
      expectAccessible,
    }) => {
      const session = sessionRead(page);
      await page.goto(path);
      await session;

      await expect(
        page.getByRole("heading", { level: 1, name: "New activity" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: "Sign in to contribute" }),
      ).toBeVisible();
      await expect(signInLink(page)).toHaveCount(0);
      await expectAccessible();
    });
  }

  test("is absent on the Sign in page", async ({ page, expectAccessible }) => {
    const session = sessionRead(page);
    await page.goto("/sign-in");
    await session;

    await expect(
      page.getByRole("heading", { level: 1, name: "Sign in" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Continue with GitHub" }),
    ).toBeVisible();
    await expect(signInLink(page)).toHaveCount(0);
    await expectAccessible();
  });
});

test.describe("the account menu", () => {
  test("offers Your profile then Sign out, and Your profile opens the owner's profile", async ({
    page,
    expectAccessible,
    publishOwnListing,
    uniqueWord,
  }) => {
    const listing = await publishOwnListing(slackListing(uniqueWord()));
    await page.goto(`/${listing.address}`);

    await accountMenu(page).click();
    const menu = page.getByRole("menu", { name: "Account" });
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Your profile",
      "Sign out",
    ]);
    await expectAccessible();

    await menu.getByRole("menuitem", { name: "Your profile" }).click();

    await expect(page).toHaveURL("/profile");
    await expect(
      page.getByRole("heading", { level: 1, name: listing.handle }),
    ).toBeVisible();
    await expect(menu).toBeHidden();
    await expectAccessible();
  });
});

test.describe("signing out", () => {
  test("on an activity page stays on that page, signed out", async ({
    page,
    expectAccessible,
    publishOwnListing,
    uniqueWord,
  }) => {
    const details = slackListing(uniqueWord());
    const listing = await publishOwnListing(details);
    await page.goto(`/${listing.address}`);
    await expect(accountMenu(page)).toHaveText(publisherInitials);

    await signOutFromMenu(page);

    await expect(accountMenu(page)).toHaveCount(0);
    await expect(signInLink(page)).toBeVisible();
    await expect(page).toHaveURL(`/${listing.address}`);
    await expect(
      page.getByRole("heading", { level: 1, name: details.title }),
    ).toBeVisible();
    await expectAccessible();
  });

  test("on the profile goes to the home page, signed out", async ({
    page,
    expectAccessible,
    publishOwnListing,
    uniqueWord,
  }) => {
    const listing = await publishOwnListing(slackListing(uniqueWord()));
    await page.goto("/profile");
    await expect(
      page.getByRole("heading", { level: 1, name: listing.handle }),
    ).toBeVisible();

    await signOutFromMenu(page);

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Temporal activities, ready to use.",
      }),
    ).toBeVisible();
    await expect(accountMenu(page)).toHaveCount(0);
    await expect(signInLink(page)).toBeVisible();
    await expect(page.getByText(listing.handle)).toHaveCount(0);
    await expectAccessible();
  });
});

test.describe("the profile", () => {
  test("shows the owner's handle, provider details and activities, and nobody else's", async ({
    page,
    expectAccessible,
    publishListing,
    publishOwnListing,
    signIn,
    uniqueWord,
  }) => {
    const theirs = slackListing(uniqueWord());
    const other = await publishListing(theirs);
    const mine = slackListing(uniqueWord());
    const listing = await publishOwnListing(mine);
    // Signing in again refreshes what the provider said, now with an email address.
    const email = `${listing.handle}@example.com`;
    await signIn({ ...listing.identity, email });

    await page.goto("/profile");

    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: listing.handle }),
    ).toBeVisible();
    await expect(main.getByText("Signed in with GitHub")).toBeVisible();

    const handleCard = main.getByRole("region", { name: "Handle" });
    await expect(handleCard).toContainText(
      `Every address you publish starts with it, like ${listing.handle}/charge-card@2.0.0.`,
    );

    const providerCard = main.getByRole("region", { name: "From GitHub" });
    const rows = providerCard.getByRole("definition");
    await expect(providerCard.getByRole("term")).toHaveText([
      "Name",
      "Email",
      "GitHub username",
      "Avatar",
      "Account ID",
    ]);
    await expect(rows.nth(0)).toHaveText(publisherName);
    await expect(rows.nth(1)).toHaveText(email);
    await expect(rows.nth(2)).toHaveText(listing.handle);
    await expect(rows.nth(4)).toHaveText(listing.identity.providerAccountId);

    const activities = main.getByRole("region", { name: "Your activities" });
    const items = activities.getByRole("listitem");
    await expect(items).toHaveCount(1);
    await expect(items.getByRole("link", { name: mine.title })).toHaveAttribute(
      "href",
      `/${listing.address}`,
    );
    await expect(items).toContainText(listing.address);
    await expect(items).toContainText("Listed");
    await expect(main.getByText(theirs.title)).toHaveCount(0);
    await expect(main.getByText(other.handle)).toHaveCount(0);
    await expectAccessible();
  });

  test("shows another signed-in publisher only their own handle and none of the first owner's activities", async ({
    page,
    expectAccessible,
    publishListing,
    signInWithAccount,
    uniqueWord,
  }) => {
    const details = slackListing(uniqueWord());
    const someoneElse = await publishListing(details);
    const account = await signInWithAccount();

    await page.goto("/profile");

    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: account.handle }),
    ).toBeVisible();
    await expect(
      main
        .getByRole("region", { name: "Your activities" })
        .getByText("You haven't published an activity yet."),
    ).toBeVisible();
    await expect(main.getByText(details.title)).toHaveCount(0);
    await expect(main.getByText(someoneElse.handle)).toHaveCount(0);
    await expectAccessible();
  });

  test("sends a signed-in person with no account to Contribute", async ({
    page,
    expectAccessible,
    signIn,
  }) => {
    // A new identity of its own, which has never chosen a handle.
    await signIn({ name: publisherName });

    await page.goto("/profile");

    await expect(page).toHaveURL(/\/contribute\//);
    await expect(
      page.getByRole("heading", { level: 1, name: "New activity" }),
    ).toBeVisible();
    await expectAccessible();
  });

  test.describe("as an anonymous visitor", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("sends the visitor to Sign in with the profile to return to", async ({
      page,
      expectAccessible,
    }) => {
      await page.goto("/profile");

      await expect(page).toHaveURL(signInPageFrom("/profile"));
      await expect(
        page.getByRole("heading", { level: 1, name: "Sign in" }),
      ).toBeVisible();
      await expectProvidersStartFrom(page, "/profile");
      await expectAccessible();
    });
  });
});

test.describe("a sign-in that does not finish", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("keeps the page it started from through the provider round trip", async ({
    page,
    expectAccessible,
    publishListing,
    uniqueWord,
  }) => {
    const listing = await publishListing(slackListing(uniqueWord()));
    const from = `/${listing.address}`;
    await page.goto(signInPageFrom(from));
    const start = await page
      .getByRole("link", { name: "Continue with GitHub" })
      .getAttribute("href");
    if (start === null) throw new Error("The GitHub button has no address.");

    // The start route sends the browser to GitHub's consent screen, which these tests never
    // reach. Starting it on the page's own context keeps the cookies the callback reads, and
    // the redirect is not followed.
    const started = await page.request.get(start, { maxRedirects: 0 });
    expect(started.status()).toBe(302);
    const consent = new URL(started.headers()["location"] ?? "");
    expect(consent.origin).toBe("https://github.com");
    const state = consent.searchParams.get("state");
    if (state === null) throw new Error("The consent address has no state.");

    // What GitHub sends back when the visitor cancels on its consent screen: the error, with
    // the state it was given.
    await page.goto(
      `/api/session/providers/github/callback?${new URLSearchParams({ error: "access_denied", state }).toString()}`,
    );

    await expect(page).toHaveURL(
      `/sign-in?${new URLSearchParams({ "sign-in": "failed", returnTo: from }).toString()}`,
    );
    await expect(page.getByRole("alert")).toHaveText(failedMessage);
    await expectProvidersStartFrom(page, from);
    await expect(accountMenu(page)).toHaveCount(0);
    await expectAccessible();
  });
});
