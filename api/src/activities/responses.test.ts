import { describe, expect, test } from "vitest";
import type { Listing, Version, VersionDocument } from "../storage/storage";
import {
  activityCard,
  formatAddress,
  listingResponse,
  publishResponse,
  shownRemoval,
  versionLocation,
  versionResponse,
} from "./responses";

const version: Version = {
  handle: "acme",
  name: "charge-card",
  version: "1.0.0",
  title: "Charge card",
  sdk: "Python",
  integrations: ["Stripe"],
  publishedAt: new Date("2026-10-23T12:00:00Z"),
};

const document: VersionDocument = {
  code: "import stripe\n",
  facts: {
    sdk: "Python",
    activity: { name: "charge_card", line: 7 },
    input: "ChargeRequest",
    output: "ChargeResult",
    runsAs: "async",
    nonRetryableErrors: [{ line: 12 }],
    configurationRead: [{ name: "STRIPE_API_KEY", line: 9 }],
    dependencies: [{ name: "stripe", line: 1 }],
    heartbeats: [{ line: 8 }],
  },
  integrations: ["Stripe"],
  snippets: [{ label: "Register", code: "worker = Worker()\n" }],
  title: "Charge card",
  description: "The description as it was when published.",
};

describe("formatting an address", () => {
  test("joins handle, name and version as handle/name@version", () => {
    expect(
      formatAddress({ handle: "acme", name: "charge-card", version: "1.0.0" }),
    ).toBe("acme/charge-card@1.0.0");
  });
});

describe("the version response", () => {
  test("holds the code, Implement snippets, integrations and published date alongside the existing fields", () => {
    expect(versionResponse(version, document)).toEqual({
      address: "acme/charge-card@1.0.0",
      handle: "acme",
      name: "charge-card",
      version: "1.0.0",
      title: "Charge card",
      sdk: "Python",
      facts: document.facts,
      code: "import stripe\n",
      activityFileName: "activities.py",
      snippets: [{ label: "Register", code: "worker = Worker()\n" }],
      integrations: ["Stripe"],
      publishedAt: "2026-10-23T12:00:00.000Z",
    });
  });

  test("keeps the existing address, title, SDK and facts fields unchanged", () => {
    expect(versionResponse(version, document)).toMatchObject({
      address: "acme/charge-card@1.0.0",
      handle: "acme",
      name: "charge-card",
      version: "1.0.0",
      title: "Charge card",
      sdk: "Python",
      facts: {
        sdk: "Python",
        activity: { name: "charge_card", line: 7 },
        input: "ChargeRequest",
        output: "ChargeResult",
        runsAs: "async",
        nonRetryableErrors: [{ line: 12 }],
        configurationRead: [{ name: "STRIPE_API_KEY", line: 9 }],
        dependencies: [{ name: "stripe", line: 1 }],
        heartbeats: [{ line: 8 }],
      },
    });
  });

  test("leaves out the description, which can change after publishing", () => {
    expect(versionResponse(version, document)).not.toHaveProperty(
      "description",
    );
  });

  test("leaves out the deprecation and the versions list, which can change after publishing", () => {
    const response = versionResponse(version, document);

    expect(response).not.toHaveProperty("deprecation");
    expect(response).not.toHaveProperty("versions");
  });

  test("answers an empty integrations list when the version has none", () => {
    const response = versionResponse(
      { ...version, integrations: [] },
      { ...document, integrations: [] },
    );

    expect(response.integrations).toEqual([]);
  });

  test("answers the published code byte for byte, with tabs, odd indentation and trailing whitespace", () => {
    const code =
      "import stripe\r\n\n\tdef  charge():  \n   \t  return 1\t\n  \n\n\n";

    expect(versionResponse(version, { ...document, code }).code).toBe(code);
  });

  test("passes unreadable input type, output type and run mode through as stored", () => {
    const facts = {
      ...document.facts,
      input: null,
      output: null,
      runsAs: null,
    };

    expect(versionResponse(version, { ...document, facts }).facts).toEqual(
      facts,
    );
  });

  test.each([
    ["Python", "activities.py"],
    ["TypeScript", "activities.ts"],
    [".NET", "Activities.cs"],
  ] as const)(
    "names the activity file for a %s version %s",
    (sdk, fileName) => {
      expect(
        versionResponse({ ...version, sdk }, document).activityFileName,
      ).toBe(fileName);
    },
  );
});

describe("the listing response", () => {
  test("holds the handle, the name, the removal and every version in the order given, with its current state", () => {
    expect(
      listingResponse({
        handle: "acme",
        name: "charge-card",
        removedBy: null,
        versions: [
          {
            version: "1.1.0",
            publishedAt: new Date("2026-11-02T08:30:00Z"),
            whatChanged: "Records the receipt.",
            basedOn: "1.0.0",
            deprecation: null,
            description: "Charges a card and records the receipt.",
          },
          {
            version: "1.0.0",
            publishedAt: new Date("2026-10-23T12:00:00Z"),
            whatChanged: null,
            basedOn: null,
            deprecation: {
              reason: "Double-charges on retry.",
              replacement: "1.1.0",
            },
            description: "Charges a card through Stripe.",
          },
        ],
      }),
    ).toEqual({
      handle: "acme",
      name: "charge-card",
      removedBy: null,
      versions: [
        {
          version: "1.1.0",
          publishedAt: "2026-11-02T08:30:00.000Z",
          whatChanged: "Records the receipt.",
          basedOn: "1.0.0",
          deprecation: null,
          description: "Charges a card and records the receipt.",
        },
        {
          version: "1.0.0",
          publishedAt: "2026-10-23T12:00:00.000Z",
          whatChanged: null,
          basedOn: null,
          deprecation: {
            reason: "Double-charges on retry.",
            replacement: "1.1.0",
          },
          description: "Charges a card through Stripe.",
        },
      ],
    });
  });

  test("answers a deprecation with no replacement as a null replacement", () => {
    expect(
      listingResponse({
        handle: "acme",
        name: "charge-card",
        removedBy: null,
        versions: [
          {
            version: "1.0.0",
            publishedAt: new Date("2026-10-23T12:00:00Z"),
            whatChanged: null,
            basedOn: null,
            deprecation: { reason: "Uses a retired API.", replacement: null },
            description: "Charges a card through Stripe.",
          },
        ],
      }).versions[0]?.deprecation,
    ).toEqual({ reason: "Uses a retired API.", replacement: null });
  });

  test.each([
    ["the publisher", "publisher", "publisher"],
    ["account deletion", "account-deletion", "publisher"],
    ["Durables", "durables", "durables"],
    ["nobody", null, null],
  ] as const)(
    "shows a removal by %s as removed by %j",
    (_, removedBy, shown) => {
      expect(
        listingResponse({
          handle: "acme",
          name: "charge-card",
          removedBy,
          versions: [],
        }).removedBy,
      ).toBe(shown);
      expect(shownRemoval(removedBy)).toBe(shown);
    },
  );
});

describe("the publish response", () => {
  test("carries the address, its parts, the version's location and whether the account was created", () => {
    expect(
      publishResponse(
        { handle: "ada", name: "post-slack-message", version: "1.0.0" },
        true,
      ),
    ).toEqual({
      address: "ada/post-slack-message@1.0.0",
      handle: "ada",
      name: "post-slack-message",
      version: "1.0.0",
      location: "/api/activities/ada/post-slack-message/versions/1.0.0",
      accountCreated: true,
    });
  });

  test("points the location at the version endpoint, percent-encoding each part", () => {
    expect(
      versionLocation({ handle: "a b", name: "c/d", version: "1.0.0" }),
    ).toBe("/api/activities/a%20b/c%2Fd/versions/1.0.0");
  });
});

describe("a browse card", () => {
  const listing: Listing = {
    handle: "acme",
    name: "charge-card",
    version: "2.1.0",
    title: "Charge card",
    description: "The listing's current description.",
    sdk: ".NET",
    integrations: ["Stripe", "Postgres"],
    publishedAt: new Date("2026-10-23T12:00:00Z"),
  };

  test("holds the version's address, title, SDK, integrations and published date, and the current description", () => {
    expect(activityCard(listing)).toEqual({
      address: "acme/charge-card@2.1.0",
      handle: "acme",
      name: "charge-card",
      version: "2.1.0",
      title: "Charge card",
      sdk: ".NET",
      description: "The listing's current description.",
      integrations: ["Stripe", "Postgres"],
      publishedAt: "2026-10-23T12:00:00.000Z",
    });
  });

  test("holds an empty integrations list when there are none", () => {
    expect(activityCard({ ...listing, integrations: [] }).integrations).toEqual(
      [],
    );
  });
});
