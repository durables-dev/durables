import { describe, expect, test } from "vitest";
import type { Session } from "../auth/auth";
import type { OwnedListing, Provider } from "../storage/storage";
import { ownedActivity, profileResponse, providerDetails } from "./responses";

const session = (overrides: Partial<Session> = {}): Session => ({
  provider: "github",
  providerAccountId: "1234",
  name: "Ada Lovelace",
  email: "ada@example.com",
  avatarUrl: "https://example.com/ada.png",
  username: "ada",
  handle: null,
  expiresAt: 2_000_000_000,
  ...overrides,
});

const account = {
  handle: "ada",
  joinedAt: new Date("2026-10-01T09:30:00Z"),
  listedCount: 2,
};

const listing = (overrides: Partial<OwnedListing> = {}): OwnedListing => ({
  handle: "ada",
  name: "charge-card",
  version: "2.1.0",
  title: "Charge card",
  sdk: "Python",
  versionCount: 3,
  publishedAt: new Date("2026-11-02T12:00:00Z"),
  removed: false,
  ...overrides,
});

describe("the profile response", () => {
  test("returns handle, provider, joined date, listed count and every provider detail, email included", () => {
    expect(profileResponse(session(), account)).toEqual({
      accountExists: true,
      handle: "ada",
      provider: "github",
      joinedAt: "2026-10-01T09:30:00.000Z",
      listedCount: 2,
      providerDetails: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        username: "ada",
        avatarUrl: "https://example.com/ada.png",
        providerAccountId: "1234",
      },
    });
  });

  test("takes the handle from the account, not the cookie", () => {
    expect(
      profileResponse(session({ handle: "someone-else" }), account),
    ).toMatchObject({ handle: "ada" });
  });

  test("answers as the session read does for a signed-in person with no account", () => {
    expect(profileResponse(session({ handle: "chosen" }), undefined)).toEqual({
      accountExists: false,
      handle: "chosen",
    });
    expect(profileResponse(session(), undefined)).toEqual({
      accountExists: false,
      handle: null,
    });
  });

  test("never carries provider details or the email for a person with no account", () => {
    expect(JSON.stringify(profileResponse(session(), undefined))).not.toContain(
      "ada@example.com",
    );
  });
});

describe("the provider details", () => {
  test.each<Provider>(["github", "gitlab"])(
    "keep the username for %s",
    (provider) => {
      expect(providerDetails(session({ provider }))).toMatchObject({
        username: "ada",
      });
    },
  );

  test.each<Provider>(["google", "microsoft"])(
    "return no username for %s, even when the session holds one",
    (provider) => {
      expect(providerDetails(session({ provider }))).toMatchObject({
        username: null,
      });
    },
  );

  test("answer null for a missing email, username or avatar", () => {
    const bare: Session = {
      provider: "github",
      providerAccountId: "1234",
      name: "Ada Lovelace",
      handle: null,
      expiresAt: 2_000_000_000,
    };

    expect(providerDetails(bare)).toEqual({
      name: "Ada Lovelace",
      email: null,
      username: null,
      avatarUrl: null,
      providerAccountId: "1234",
    });
  });
});

describe("an owned activity", () => {
  test("returns title, SDK, latest address, version count, latest published date and listed status", () => {
    expect(ownedActivity(listing())).toEqual({
      handle: "ada",
      name: "charge-card",
      version: "2.1.0",
      address: "ada/charge-card@2.1.0",
      title: "Charge card",
      sdk: "Python",
      versionCount: 3,
      latestPublishedAt: "2026-11-02T12:00:00.000Z",
      status: "listed",
    });
  });

  test("reports a removed activity as removed", () => {
    expect(ownedActivity(listing({ removed: true }))).toMatchObject({
      status: "removed",
    });
  });
});
