import { env, exports } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import type { Sdk } from "../sdks/sdk-list";
import { seedAccount, seedListing, seedVersion } from "../storage/seed";
import { encodeBrowseCursor } from "./browse-cursor";
import {
  BROWSE_BATCH_SIZE,
  cursorMessage,
  sdkFilterMessage,
  wordsMessage,
} from "./browse-request";
import type { ActivityCard, BrowseResponse } from "./responses";

// Browsing published activities over HTTP, against real local D1. Rows written by one test stay
// for the next, so each test narrows to a publisher no other test uses, except the one that reads
// every activity, whose listings are dated after anything else here.

const problemContentType = "application/problem+json";

interface SeededVersion {
  version?: string;
  description?: string;
  title?: string;
  sdk?: Sdk;
  integrations?: string[];
  publishedAt?: Date;
}

/** A handle that exists, which no other test uses. */
const newHandle = async () => (await seedAccount(env.DB)).handle;

/**
 * Writes a listing and its versions, each defaulting to 1.0.0, Python, Stripe and now. Each
 * version takes the listing's description unless it names its own. The published date is
 * stored in whole seconds, so dates here are whole seconds too.
 */
const seedActivity = async (
  handle: string,
  listing: { name?: string; description?: string } = {},
  versionRows: SeededVersion[] = [{}],
): Promise<{ handle: string; name: string }> => {
  const name = listing.name ?? `activity-${crypto.randomUUID().slice(0, 8)}`;
  await seedListing(env.DB, { handle, name });
  for (const row of versionRows) {
    await seedVersion(env.DB, {
      handle,
      name,
      version: row.version ?? "1.0.0",
      description:
        row.description ??
        listing.description ??
        "Charges a card through Stripe.",
      title: row.title ?? "Charge card",
      sdk: row.sdk ?? "Python",
      integrations: row.integrations ?? ["Stripe"],
      ...(row.publishedAt === undefined
        ? {}
        : { publishedAt: row.publishedAt }),
    });
  }
  return { handle, name };
};

const at = (iso: string) => new Date(iso);

type Query = Record<string, string | string[]>;

const browsePath = (query: Query = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const each of Array.isArray(value) ? value : [value]) {
      params.append(key, each);
    }
  }
  const search = params.toString();
  return search === "" ? "/api/activities" : `/api/activities?${search}`;
};

const get = (query?: Query) =>
  exports.default.fetch(`http://localhost${browsePath(query)}`);

const browse = async (query?: Query): Promise<BrowseResponse> => {
  const response = await get(query);
  expect(response.status).toBe(200);
  return response.json<BrowseResponse>();
};

const names = (body: BrowseResponse) =>
  body.activities.map((card) => card.name);

/** Newest first, then by handle and name. */
const inBrowseOrder = (a: ActivityCard, b: ActivityCard) =>
  b.publishedAt.localeCompare(a.publishedAt) ||
  a.handle.localeCompare(b.handle) ||
  a.name.localeCompare(b.name);

const expectInvalid = async (query: Query, field: string, message: string) => {
  const response = await get(query);
  expect(response.status).toBe(400);
  expect(response.headers.get("Content-Type")).toBe(problemContentType);
  expect(await response.json()).toMatchObject({
    status: 400,
    errors: [{ field, message }],
  });
};

describe("browsing with no filters", () => {
  test("answers the first 50 newest first, with the count of every match and the sort newest", async () => {
    const before = await browse();
    const handle = await newHandle();
    const oldest = await seedActivity(handle, {}, [
      { publishedAt: at("2099-01-01T00:00:00Z") },
    ]);
    const newest = await seedActivity(handle, {}, [
      { publishedAt: at("2099-01-03T00:00:00Z") },
    ]);
    const middle = await seedActivity(handle, {}, [
      { publishedAt: at("2099-01-02T00:00:00Z") },
    ]);

    const body = await browse();

    expect(body.sort).toBe("newest");
    expect(body.count).toBe(before.count + 3);
    expect(body.activities.length).toBe(
      Math.min(body.count, BROWSE_BATCH_SIZE),
    );
    expect(names(body).slice(0, 3)).toEqual([
      newest.name,
      middle.name,
      oldest.name,
    ]);
    expect(body.activities).toEqual([...body.activities].sort(inBrowseOrder));
  });

  test("answers no-store", async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("answers every request, however many come from one address in a minute", async () => {
    // More requests than either rate limit allows in its period (wrangler.toml).
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) {
      statuses.push((await get()).status);
    }

    expect(statuses.every((status) => status === 200)).toBe(true);
  });
});

describe("each card", () => {
  test("holds the title, address, SDK, current description, integrations, publisher and published date", async () => {
    const handle = await newHandle();
    const { name } = await seedActivity(
      handle,
      { description: "Uploads a file to a bucket." },
      [
        {
          title: "Upload file",
          sdk: "TypeScript",
          integrations: ["Amazon S3", "Postgres"],
          publishedAt: at("2026-10-20T09:30:00Z"),
        },
      ],
    );

    const body = await browse({ publisher: handle });

    expect(body.activities).toEqual([
      {
        address: `${handle}/${name}@1.0.0`,
        handle,
        name,
        version: "1.0.0",
        title: "Upload file",
        sdk: "TypeScript",
        description: "Uploads a file to a bucket.",
        integrations: ["Amazon S3", "Postgres"],
        publishedAt: "2026-10-20T09:30:00.000Z",
      },
    ]);
  });

  test("answers an empty integrations list when the version has none", async () => {
    const handle = await newHandle();
    await seedActivity(handle, {}, [{ integrations: [] }]);

    const body = await browse({ publisher: handle });

    expect(body.activities.map((card) => card.integrations)).toEqual([[]]);
  });
});

describe("a listing with several versions", () => {
  test("appears once, at its highest version number, even when an older line was published later", async () => {
    const handle = await newHandle();
    const { name } = await seedActivity(handle, {}, [
      {
        version: "1.0.0",
        title: "Old",
        publishedAt: at("2026-01-01T00:00:00Z"),
      },
      {
        version: "2.0.0",
        title: "Newest number",
        publishedAt: at("2026-02-01T00:00:00Z"),
      },
      {
        version: "1.1.0",
        title: "Older line",
        publishedAt: at("2026-03-01T00:00:00Z"),
      },
    ]);

    const body = await browse({ publisher: handle });

    expect(body.count).toBe(1);
    expect(body.activities).toMatchObject([
      {
        name,
        version: "2.0.0",
        address: `${handle}/${name}@2.0.0`,
        title: "Newest number",
      },
    ]);
  });

  test("shows the published date of the version on the card", async () => {
    const handle = await newHandle();
    await seedActivity(handle, {}, [
      { version: "1.0.0", publishedAt: at("2026-01-01T00:00:00Z") },
      { version: "1.1.0", publishedAt: at("2026-02-01T00:00:00Z") },
    ]);

    const body = await browse({ publisher: handle });

    expect(body.activities).toMatchObject([
      { version: "1.1.0", publishedAt: "2026-02-01T00:00:00.000Z" },
    ]);
  });

  test("compares each part of the version as a number", async () => {
    const handle = await newHandle();
    await seedActivity(handle, {}, [
      { version: "1.9.0" },
      { version: "1.10.0" },
      { version: "1.2.10" },
    ]);

    const body = await browse({ publisher: handle });

    expect(body.activities.map((card) => card.version)).toEqual(["1.10.0"]);
  });

  test("is filtered by the version on the card, not by older versions", async () => {
    const handle = await newHandle();
    await seedActivity(handle, {}, [
      { version: "1.0.0", sdk: "Python", integrations: ["Stripe"] },
      { version: "2.0.0", sdk: "TypeScript", integrations: ["Slack"] },
    ]);

    const stripe = await browse({ publisher: handle, integration: "Stripe" });
    const python = await browse({ publisher: handle, sdk: "Python" });
    const slack = await browse({ publisher: handle, integration: "Slack" });

    expect(stripe.count).toBe(0);
    expect(python.count).toBe(0);
    expect(slack.activities.map((card) => card.version)).toEqual(["2.0.0"]);
  });

  test("shows the description of the version on the card, not an older version's", async () => {
    const handle = await newHandle();
    await seedActivity(handle, {}, [
      { version: "1.0.0", description: "Charges a card through Stripe." },
      { version: "1.2.0", description: "Charges a card or a saved wallet." },
      { version: "1.1.0", description: "Charges a card and keeps a receipt." },
    ]);

    const body = await browse({ publisher: handle });

    expect(body.activities).toMatchObject([
      { version: "1.2.0", description: "Charges a card or a saved wallet." },
    ]);
  });

  test("is found by a word only in the latest version's description, and not by one only in an older version's", async () => {
    const [latestWord, olderWord] = [newWord(), newWord()];
    const handle = await newHandle();
    const { name } = await seedActivity(handle, {}, [
      { version: "1.0.0", description: `Charges a card, then ${olderWord}.` },
      { version: "2.0.0", description: `Charges a card, then ${latestWord}.` },
    ]);

    const latest = await browse({ q: latestWord });
    const older = await browse({ q: olderWord });

    expect(latest.activities).toMatchObject([
      {
        name,
        version: "2.0.0",
        description: `Charges a card, then ${latestWord}.`,
      },
    ]);
    expect(older.activities).toEqual([]);
    expect(older.count).toBe(0);
  });

  test("is ranked by the latest version's description, not an older version's", async () => {
    const word = newWord();
    const handle = await newHandle();
    // Both titles score 3. Only the first listing's latest description adds 1. The second
    // listing's older description holds the word, scores nothing, and the listing is newer.
    const latestHasIt = await seedActivity(handle, {}, [
      {
        title: `Charge ${word}`,
        description: `Charges a card for ${word}.`,
        publishedAt: at("2026-06-01T00:00:00Z"),
      },
    ]);
    const olderHasIt = await seedActivity(handle, {}, [
      {
        version: "1.0.0",
        title: `Charge ${word}`,
        description: `Charges a card for ${word}.`,
        publishedAt: at("2026-06-02T00:00:00Z"),
      },
      {
        version: "1.1.0",
        title: `Charge ${word}`,
        description: "Charges a card.",
        publishedAt: at("2026-06-03T00:00:00Z"),
      },
    ]);

    const body = await browse({ q: word });

    expect(names(body)).toEqual([latestHasIt.name, olderHasIt.name]);
  });

  test("is ordered by the published date of the version on the card", async () => {
    const handle = await newHandle();
    const refreshed = await seedActivity(handle, {}, [
      { version: "1.0.0", publishedAt: at("2026-01-01T00:00:00Z") },
      { version: "2.0.0", publishedAt: at("2026-03-01T00:00:00Z") },
    ]);
    const between = await seedActivity(handle, {}, [
      { publishedAt: at("2026-02-01T00:00:00Z") },
    ]);

    const body = await browse({ publisher: handle });

    expect(names(body)).toEqual([refreshed.name, between.name]);
  });
});

describe("the SDK filter", () => {
  test("with several SDKs, matches a listing in any one of them", async () => {
    const handle = await newHandle();
    const python = await seedActivity(handle, {}, [
      { sdk: "Python", publishedAt: at("2026-01-03T00:00:00Z") },
    ]);
    const dotnet = await seedActivity(handle, {}, [
      { sdk: ".NET", publishedAt: at("2026-01-02T00:00:00Z") },
    ]);
    await seedActivity(handle, {}, [{ sdk: "TypeScript" }]);

    const body = await browse({ publisher: handle, sdk: ["Python", ".NET"] });

    expect(names(body)).toEqual([python.name, dotnet.name]);
    expect(body.count).toBe(2);
  });

  test("combines with the integration filter, so only listings matching both return", async () => {
    const handle = await newHandle();
    const both = await seedActivity(handle, {}, [
      { sdk: "Python", integrations: ["Stripe", "Postgres"] },
    ]);
    await seedActivity(handle, {}, [
      { sdk: "Python", integrations: ["Slack"] },
    ]);
    await seedActivity(handle, {}, [
      { sdk: "TypeScript", integrations: ["Stripe"] },
    ]);
    await seedActivity(handle, {}, [{ sdk: "Python", integrations: [] }]);

    const body = await browse({
      publisher: handle,
      sdk: "Python",
      integration: "Stripe",
    });

    expect(names(body)).toEqual([both.name]);
    expect(body.count).toBe(1);
  });

  test.each(["Cobol", "java", "python", ""])(
    "answers 400 for the unsupported SDK %j",
    async (sdk) => {
      await expectInvalid({ sdk }, "sdk", sdkFilterMessage);
    },
  );

  test("answers 400 when one of several SDKs is unsupported", async () => {
    await expectInvalid({ sdk: ["Python", "Cobol"] }, "sdk", sdkFilterMessage);
  });

  test("answers 200 for an SDK repeated 150 times", async () => {
    // D1 binds at most 100 parameters, so the SDKs go to it as one JSON array.
    const handle = await newHandle();
    const python = await seedActivity(handle, {}, [{ sdk: "Python" }]);
    await seedActivity(handle, {}, [{ sdk: "TypeScript" }]);

    const body = await browse({
      publisher: handle,
      sdk: Array.from({ length: 150 }, () => "Python"),
    });

    expect(names(body)).toEqual([python.name]);
    expect(body.count).toBe(1);
  });
});

describe("the integration filter", () => {
  test("with several integrations, matches a listing with any one of them", async () => {
    const handle = await newHandle();
    const stripe = await seedActivity(handle, {}, [
      { integrations: ["Stripe"], publishedAt: at("2026-01-03T00:00:00Z") },
    ]);
    const slack = await seedActivity(handle, {}, [
      {
        integrations: ["Postgres", "Slack"],
        publishedAt: at("2026-01-02T00:00:00Z"),
      },
    ]);
    await seedActivity(handle, {}, [{ integrations: ["Amazon S3"] }]);

    const body = await browse({
      publisher: handle,
      integration: ["Stripe", "Slack"],
    });

    expect(names(body)).toEqual([stripe.name, slack.name]);
    expect(body.count).toBe(2);
  });

  test("excludes a listing with no integrations, which shows without the filter", async () => {
    const handle = await newHandle();
    const none = await seedActivity(handle, {}, [{ integrations: [] }]);

    const filtered = await browse({ publisher: handle, integration: "Stripe" });
    const unfiltered = await browse({ publisher: handle });

    expect(filtered.count).toBe(0);
    expect(names(unfiltered)).toEqual([none.name]);
  });

  test("matches whole integration names inside the stored list, not part of one", async () => {
    const handle = await newHandle();
    await seedActivity(handle, {}, [{ integrations: ["Amazon S3"] }]);

    const body = await browse({ publisher: handle, integration: "S3" });

    expect(body.count).toBe(0);
  });

  test("answers 200 for 150 integration values", async () => {
    // D1 binds at most 100 parameters, so the integrations go to it as one JSON array.
    const handle = await newHandle();
    const stripe = await seedActivity(handle, {}, [
      { integrations: ["Stripe"] },
    ]);
    await seedActivity(handle, {}, [{ integrations: ["Slack"] }]);

    const body = await browse({
      publisher: handle,
      integration: [
        ...Array.from({ length: 149 }, (_, i) => `Integration ${i}`),
        "Stripe",
      ],
    });

    expect(names(body)).toEqual([stripe.name]);
    expect(body.count).toBe(1);
  });
});

describe("the publisher filter", () => {
  test("answers only that publisher's listings, not text that mentions the handle", async () => {
    const handle = await newHandle();
    const other = await newHandle();
    const own = await seedActivity(handle);
    await seedActivity(
      other,
      {
        name: `${handle}-tools`,
        description: `Ported from ${handle}'s activity.`,
      },
      [{ title: `Charge card like ${handle}` }],
    );

    const body = await browse({ publisher: handle });

    expect(body.activities.map((card) => [card.handle, card.name])).toEqual([
      [handle, own.name],
    ]);
    expect(body.count).toBe(1);
  });

  test("answers 400 for an empty publisher", async () => {
    const response = await get({ publisher: "" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      errors: [{ field: "publisher" }],
    });
  });
});

describe("batches", () => {
  test("pages 120 matches as 50, 50 and 20, each with the full count, and the last with no next position", async () => {
    const handle = await newHandle();
    const seeded: string[] = [];
    for (let i = 0; i < 120; i++) {
      // Pairs share a published second, so the order within a second is exercised too.
      const { name } = await seedActivity(
        handle,
        { name: `activity-${String(i).padStart(3, "0")}` },
        [
          {
            publishedAt: new Date(
              Date.UTC(2026, 0, 1) + Math.floor(i / 2) * 1000,
            ),
          },
        ],
      );
      seeded.push(name);
    }
    const expected = [...seeded].sort((a, b) => {
      const second = (n: string) => Math.floor(Number(n.slice(-3)) / 2);
      return second(b) - second(a) || a.localeCompare(b);
    });

    const first = await browse({ publisher: handle });
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await browse({
      publisher: handle,
      cursor: first.nextCursor ?? "",
    });
    expect(second.nextCursor).toEqual(expect.any(String));
    const third = await browse({
      publisher: handle,
      cursor: second.nextCursor ?? "",
    });

    expect([first, second, third].map((b) => b.activities.length)).toEqual([
      50, 50, 20,
    ]);
    expect([first, second, third].map((b) => b.count)).toEqual([120, 120, 120]);
    expect(third.nextCursor).toBeNull();
    expect([...names(first), ...names(second), ...names(third)]).toEqual(
      expected,
    );
  });

  test("answers exactly 50 matches in one batch with no next position", async () => {
    const handle = await newHandle();
    for (let i = 0; i < 50; i++) {
      await seedActivity(handle);
    }

    const body = await browse({ publisher: handle });

    expect(body.activities.length).toBe(50);
    expect(body.count).toBe(50);
    expect(body.nextCursor).toBeNull();
  });

  test.each([
    ["not base64url", "not a cursor!"],
    ["base64url that is not JSON", "bm90IGpzb24"],
    [
      "JSON of the wrong shape",
      btoa(JSON.stringify({ offset: 50 })).replace(/=+$/, ""),
    ],
    ["empty", ""],
  ])("answers 400 for a page position that is %s", async (_, cursor) => {
    await expectInvalid({ cursor }, "cursor", cursorMessage);
  });
});

describe("no matches", () => {
  test("answers an empty batch, a count of 0 and no next position", async () => {
    const handle = await newHandle();

    const body = await browse({ publisher: handle });

    expect(body).toEqual({
      activities: [],
      count: 0,
      sort: "newest",
      nextCursor: null,
    });
  });
});

/** A word no other test uses, so a search for it finds only this test's listings. */
const newWord = () => `zq${crypto.randomUUID().slice(0, 8)}`;

describe("searching with words", () => {
  test.each<
    [
      string,
      (word: string) => {
        listing: { name?: string; description?: string };
        version: SeededVersion;
      },
    ]
  >([
    [
      "title",
      (word) => ({ listing: {}, version: { title: `Charge ${word}` } }),
    ],
    [
      "description",
      (word) => ({
        listing: { description: `Charges a card, then ${word} it.` },
        version: {},
      }),
    ],
    [
      "address",
      (word) => ({ listing: { name: `${word}-charge-card` }, version: {} }),
    ],
  ])(
    "returns a listing with the word in its %s, sorted by relevance",
    async (_, seed) => {
      const word = newWord();
      const { listing, version } = seed(word);
      const handle = await newHandle();
      const matching = await seedActivity(handle, listing, [version]);
      await seedActivity(handle);

      const body = await browse({ q: word });

      expect(body.sort).toBe("relevance");
      expect(names(body)).toEqual([matching.name]);
      expect(body.count).toBe(1);
      expect(body.nextCursor).toBeNull();
    },
  );

  test("returns a listing with the word as its SDK", async () => {
    const handle = await newHandle();
    const typescript = await seedActivity(handle, {}, [{ sdk: "TypeScript" }]);
    await seedActivity(handle, {}, [{ sdk: "Python" }]);

    const body = await browse({ q: "typescript", publisher: handle });

    expect(names(body)).toEqual([typescript.name]);
    expect(body.sort).toBe("relevance");
  });

  test("returns a listing with the word in one of its integrations", async () => {
    const handle = await newHandle();
    const postgres = await seedActivity(handle, {}, [
      { integrations: ["Stripe", "Postgres"] },
    ]);
    await seedActivity(handle, {}, [{ integrations: ["Stripe"] }]);
    await seedActivity(handle, {}, [{ integrations: [] }]);

    const body = await browse({ q: "postgres", publisher: handle });

    expect(names(body)).toEqual([postgres.name]);
  });

  test("returns only listings where every word appears in some field", async () => {
    const [first, second] = [newWord(), newWord()];
    const handle = await newHandle();
    const both = await seedActivity(
      handle,
      { description: `Then ${second}.` },
      [{ title: `Charge ${first}` }],
    );
    await seedActivity(handle, {}, [{ title: `Charge ${first}` }]);
    await seedActivity(handle, {}, [{ title: `Charge ${second}` }]);

    const body = await browse({ q: `${first} ${second}` });

    expect(names(body)).toEqual([both.name]);
    expect(body.count).toBe(1);
  });

  test("ranks a title match above a description match, even when the description match is newer", async () => {
    const word = newWord();
    const handle = await newHandle();
    const inDescription = await seedActivity(
      handle,
      { description: `Charges a card with ${word}.` },
      [{ publishedAt: at("2026-06-02T00:00:00Z") }],
    );
    const inTitle = await seedActivity(handle, {}, [
      { title: `Charge ${word}`, publishedAt: at("2026-06-01T00:00:00Z") },
    ]);

    const body = await browse({ q: word });

    expect(names(body)).toEqual([inTitle.name, inDescription.name]);
  });

  test("scores 3 for each word in the title and 1 for each word in the description", async () => {
    const [first, second] = [newWord(), newWord()];
    const handle = await newHandle();
    const date = at("2026-06-01T00:00:00Z");
    // Scores: 6, 4, 3 and 2. The address and SDK match but score nothing.
    const bothInTitle = await seedActivity(handle, {}, [
      { title: `${first} ${second}`, publishedAt: date },
    ]);
    const titleAndDescription = await seedActivity(
      handle,
      { description: `About ${second}.` },
      [{ title: first, publishedAt: date }],
    );
    const titleAndAddress = await seedActivity(
      handle,
      { name: `${second}-tool` },
      [{ title: first, publishedAt: date }],
    );
    const bothInDescription = await seedActivity(
      handle,
      { description: `${first} and ${second}.` },
      [{ publishedAt: date }],
    );

    const body = await browse({ q: `${second} ${first}` });

    expect(names(body)).toEqual([
      bothInTitle.name,
      titleAndDescription.name,
      titleAndAddress.name,
      bothInDescription.name,
    ]);
  });

  test("orders listings with equal scores newest first, then by handle and name", async () => {
    const word = newWord();
    const handle = await newHandle();
    const older = await seedActivity(handle, { name: "a-older" }, [
      { title: `Charge ${word}`, publishedAt: at("2026-06-01T00:00:00Z") },
    ]);
    const newerB = await seedActivity(handle, { name: "c-newer" }, [
      { title: `Charge ${word}`, publishedAt: at("2026-06-03T00:00:00Z") },
    ]);
    const newerA = await seedActivity(handle, { name: "b-newer" }, [
      { title: `Charge ${word}`, publishedAt: at("2026-06-03T00:00:00Z") },
    ]);

    const body = await browse({ q: word });

    expect(names(body)).toEqual([newerA.name, newerB.name, older.name]);
  });

  test("matches the version on the card, not older versions", async () => {
    const word = newWord();
    const handle = await newHandle();
    await seedActivity(handle, {}, [
      { version: "1.0.0", title: `Charge ${word}` },
      { version: "2.0.0", title: "Charge card" },
    ]);

    const body = await browse({ q: word });

    expect(body.activities).toEqual([]);
    expect(body.count).toBe(0);
  });

  test("ignores letter case in the words and in the listing", async () => {
    const word = newWord();
    const handle = await newHandle();
    const upper = await seedActivity(handle, {}, [
      { title: `Charge ${word.toUpperCase()}` },
    ]);
    const lower = await seedActivity(handle, { name: `${word}-tool` });

    const lowerSearch = await browse({ q: word });
    const upperSearch = await browse({ q: word.toUpperCase() });

    expect(names(lowerSearch).sort()).toEqual([upper.name, lower.name].sort());
    expect(names(upperSearch).sort()).toEqual([upper.name, lower.name].sort());
  });

  test("combines with the SDK, integration and publisher filters, so results match all of them", async () => {
    const word = newWord();
    const handle = await newHandle();
    const other = await newHandle();
    const title = `Charge ${word}`;
    const matching = await seedActivity(handle, {}, [
      { title, sdk: "Python", integrations: ["Stripe"] },
    ]);
    await seedActivity(handle, {}, [
      { title, sdk: "TypeScript", integrations: ["Stripe"] },
    ]);
    await seedActivity(handle, {}, [
      { title, sdk: "Python", integrations: ["Slack"] },
    ]);
    await seedActivity(other, {}, [
      { title, sdk: "Python", integrations: ["Stripe"] },
    ]);
    await seedActivity(handle, {}, [
      { sdk: "Python", integrations: ["Stripe"] },
    ]);

    const body = await browse({
      q: word,
      sdk: "Python",
      integration: "Stripe",
      publisher: handle,
    });

    expect(names(body)).toEqual([matching.name]);
    expect(body.count).toBe(1);
    expect(body.sort).toBe("relevance");
  });

  test.each(["", "   ", " \t "])(
    "treats the words %j as no words: newest first, sorted by newest",
    async (q) => {
      const handle = await newHandle();
      const older = await seedActivity(handle, {}, [
        { publishedAt: at("2026-06-01T00:00:00Z") },
      ]);
      const newer = await seedActivity(handle, {}, [
        { publishedAt: at("2026-06-02T00:00:00Z") },
      ]);

      const body = await browse({ q, publisher: handle });

      expect(names(body)).toEqual([newer.name, older.name]);
      expect(body.sort).toBe("newest");
      expect(body.count).toBe(2);
    },
  );

  test.each([
    ["%", "Save 100% today", "Save 100 today"],
    ["_", "Read a_b file", "Read axb file"],
    ["\\", "Split a\\b path", "Split ab path"],
  ])(
    "matches %s in the words literally",
    async (character, withCharacter, without) => {
      const handle = await newHandle();
      const literal = await seedActivity(handle, {}, [
        { title: withCharacter },
      ]);
      await seedActivity(handle, {}, [{ title: without }]);

      const alone = await browse({ q: character, publisher: handle });
      const inWord = await browse({
        q: withCharacter.split(" ")[1] ?? "",
        publisher: handle,
      });

      expect(names(alone)).toEqual([literal.name]);
      expect(names(inWord)).toEqual([literal.name]);
    },
  );

  test("answers an empty batch, a count of 0 and no next position when nothing matches", async () => {
    const body = await browse({ q: newWord() });

    expect(body).toEqual({
      activities: [],
      count: 0,
      sort: "relevance",
      nextCursor: null,
    });
  });

  test("pages matches in batches of 50 in relevance order, each with the full count", async () => {
    const word = newWord();
    const handle = await newHandle();
    const seeded: { name: string; score: number; second: number }[] = [];
    for (let i = 0; i < 60; i++) {
      // Thirds score 3, 1 and 4, and pairs share a published second.
      const score = [3, 1, 4][i % 3] ?? 0;
      const second = Math.floor(i / 2);
      const name = `activity-${String(i).padStart(3, "0")}`;
      await seedActivity(
        handle,
        {
          name,
          description:
            score === 3 ? "Charges a card." : `Charges a card with ${word}.`,
        },
        [
          {
            title: score === 1 ? "Charge card" : `Charge ${word}`,
            publishedAt: new Date(Date.UTC(2026, 0, 1) + second * 1000),
          },
        ],
      );
      seeded.push({ name, score, second });
    }
    await seedActivity(handle);
    const expected = [...seeded]
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.second - a.second ||
          a.name.localeCompare(b.name),
      )
      .map(({ name }) => name);

    const first = await browse({ q: word });
    const second = await browse({ q: word, cursor: first.nextCursor ?? "" });

    expect([first, second].map((b) => b.activities.length)).toEqual([50, 10]);
    expect([first, second].map((b) => b.count)).toEqual([60, 60]);
    expect([first, second].map((b) => b.sort)).toEqual([
      "relevance",
      "relevance",
    ]);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(second.nextCursor).toBeNull();
    expect([...names(first), ...names(second)]).toEqual(expected);
  });

  test("answers 400 for a newest-first page position sent with words", async () => {
    const cursor = encodeBrowseCursor({
      sort: "newest",
      score: 0,
      publishedAt: at("2026-06-01T00:00:00Z"),
      handle: "acme",
      name: "charge-card",
    });

    await expectInvalid({ q: "charge", cursor }, "cursor", cursorMessage);
  });

  test("answers 400 for a relevance page position sent without words", async () => {
    const cursor = encodeBrowseCursor({
      sort: "relevance",
      score: 3,
      publishedAt: at("2026-06-01T00:00:00Z"),
      handle: "acme",
      name: "charge-card",
    });

    await expectInvalid({ cursor }, "cursor", cursorMessage);
  });

  test("answers 400 for words over 500 characters", async () => {
    await expectInvalid({ q: "a".repeat(501) }, "q", wordsMessage);
  });

  test("answers no-store", async () => {
    const response = await get({ q: "charge" });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

/** A Python activity importing slack_sdk, which implies the Slack integration. */
const postSlackMessage = [
  "import os",
  "",
  "from slack_sdk import WebClient",
  "from temporalio import activity",
  "",
  "",
  "@activity.defn",
  "async def post_slack_message(channel: str) -> str:",
  '    client = WebClient(token=os.environ["SLACK_TOKEN"])',
  "    return client.chat_postMessage(channel=channel).data['ts']",
  "",
].join("\n");

const cookieFrom = (response: Response) =>
  (response.headers.get("Set-Cookie") ?? "").split(";")[0] ?? "";

/** Signs in through the local fake provider as a new publisher with a handle chosen. */
const newSignedInPublisher = async () => {
  const signedIn = await exports.default.fetch(
    "http://localhost/api/session/providers/fake",
    {
      method: "POST",
      headers: {
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Ada Lovelace",
        providerAccountId: `publisher-${crypto.randomUUID()}`,
      }),
    },
  );
  expect(signedIn.status).toBe(204);
  const handle = `ada-${crypto.randomUUID().slice(0, 8)}`;
  const chosen = await exports.default.fetch(
    "http://localhost/api/session/handle",
    {
      method: "PUT",
      headers: {
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
        Cookie: cookieFrom(signedIn),
      },
      body: JSON.stringify({ handle }),
    },
  );
  expect(chosen.status).toBe(200);
  return { cookie: cookieFrom(chosen), handle };
};

describe("an activity just published", () => {
  test("is found by searching its title, with nothing else written", async () => {
    const word = newWord();
    const { cookie, handle } = await newSignedInPublisher();
    const name = `post-slack-message-${crypto.randomUUID().slice(0, 8)}`;
    const published = await exports.default.fetch(
      "http://localhost/api/activities",
      {
        method: "POST",
        headers: {
          "Sec-Fetch-Site": "same-origin",
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify({
          code: postSlackMessage,
          title: `Post slack message ${word}`,
          name,
          description: "Posts a message to a Slack channel.",
          confirmations: {
            rights: true,
            mitZero: true,
            noSecrets: true,
            notMalicious: true,
            noResponsibility: true,
            terms: true,
          },
        }),
      },
    );
    expect(published.status).toBe(201);

    const body = await browse({ q: `post ${word.toUpperCase()}` });

    expect(body.activities.map((card) => card.address)).toEqual([
      `${handle}/${name}@1.0.0`,
    ]);
    expect(body.sort).toBe("relevance");
  });
});
