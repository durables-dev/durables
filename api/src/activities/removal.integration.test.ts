import { env, exports } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import {
  readAllRows,
  seedAccount,
  seedRemoval,
  seedVersion,
} from "../storage/seed";
import {
  Storage,
  type Address,
  type RemovalSource,
  type VersionDocument,
} from "../storage/storage";
import type {
  BrowseResponse,
  ListingResponse,
  VersionResponse,
} from "./responses";

// Taking an activity out of search and returning it, over HTTP, against the real Worker with
// real local D1 and R2 (api/CONVENTIONS.md). Each test seeds its own account and listing, and
// signs in as it through the local fake provider, so addresses never collide. Search tests look
// for a word no other listing holds, and browse tests date their listing after anything else
// here, so it is on the first page of newest first.

const problemContentType = "application/problem+json";

const storage = () => new Storage(env.DB, env.DOCUMENTS);

const document: VersionDocument = {
  code: "import stripe\n",
  facts: {
    sdk: "Python",
    activity: { name: "charge_card", line: 7 },
    input: "ChargeRequest",
    output: "ChargeResult",
    runsAs: "async",
    nonRetryableErrors: [],
    configurationRead: [],
    dependencies: [{ name: "stripe", line: 1 }],
    heartbeats: [],
  },
  integrations: ["Stripe"],
  snippets: [{ label: "Install", code: "pip install temporalio\n" }],
  title: "Charge card",
  description: "Charges a card through Stripe.",
};

/** A word no other listing holds, so a search for it finds only this test's listing. */
const newWord = () =>
  `zq${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;

/** Later than anything else in this file, so each new listing is newest. */
let newest = Date.parse("2099-01-01T00:00:00Z");
const nextDate = () => new Date((newest += 1000));

/**
 * Publishes a listing's first version the way publishing does, the document then the rows, and
 * dates it after every other listing here. Its title holds a word no other listing holds.
 */
const publish = async (handle: string) => {
  const word = newWord();
  const name = `charge-card-${crypto.randomUUID().slice(0, 8)}`;
  const address = { handle, name, version: "1.0.0" };
  const title = `Charge card ${word}`;
  await storage().writeVersionDocument(address, document);
  await storage().createListing({
    ...address,
    title,
    description: document.description,
    sdk: document.facts.sdk,
    integrations: document.integrations,
  });
  await addVersion(address, "1.1.0", title);
  return { address, word };
};

/** Adds a later version under a listing, with its document and title, dated after everything else. */
async function addVersion(address: Address, version: string, title: string) {
  const later = { ...address, version };
  await storage().writeVersionDocument(later, document);
  await seedVersion(env.DB, {
    ...later,
    title,
    sdk: document.facts.sdk,
    integrations: [...document.integrations],
    description: document.description,
    publishedAt: nextDate(),
  });
  return later;
}

const cookieFrom = (response: Response) =>
  (response.headers.get("Set-Cookie") ?? "").split(";")[0] ?? "";

/** Signs in through the local fake provider as a provider identity, and returns the cookie. */
const signIn = async (providerAccountId: string): Promise<string> => {
  const response = await exports.default.fetch(
    "http://localhost/api/session/providers/fake",
    {
      method: "POST",
      headers: {
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Ada Lovelace", providerAccountId }),
    },
  );
  expect(response.status).toBe(204);
  return cookieFrom(response);
};

/** A signed-in publisher whose account exists, with one listing of two versions. */
const newOwner = async () => {
  const account = await seedAccount(env.DB);
  const { address, word } = await publish(account.handle);
  const cookie = await signIn(account.providerAccountId);
  return { ...account, address, word, cookie };
};

type ListingKey = Pick<Address, "handle" | "name">;

const listingPath = ({ handle, name }: ListingKey) =>
  `/api/activities/${encodeURIComponent(handle)}/${encodeURIComponent(name)}`;

const removalPath = (listing: ListingKey) => `${listingPath(listing)}/removal`;

const versionPath = (address: Address) =>
  `${listingPath(address)}/versions/${encodeURIComponent(address.version)}`;

/** Sends a change to the removal, from our own origin unless the headers say otherwise. */
const send = (
  method: "PUT" | "DELETE",
  listing: ListingKey,
  cookie: string | undefined,
  headers: Record<string, string> = {},
) =>
  exports.default.fetch(`http://localhost${removalPath(listing)}`, {
    method,
    headers: {
      "Sec-Fetch-Site": "same-origin",
      ...(cookie === undefined ? {} : { Cookie: cookie }),
      ...headers,
    },
  });

const remove = (
  listing: ListingKey,
  cookie: string | undefined,
  headers?: Record<string, string>,
) => send("PUT", listing, cookie, headers);

const returnToSearch = (
  listing: ListingKey,
  cookie: string | undefined,
  headers?: Record<string, string>,
) => send("DELETE", listing, cookie, headers);

const get = (path: string) => exports.default.fetch(`http://localhost${path}`);

/** The removal source stored on the listing row. */
const storedRemoval = async ({
  handle,
  name,
}: ListingKey): Promise<RemovalSource | null | undefined> =>
  (await storage().findListingVersions({ handle, name }))?.removedBy;

const browse = async (query: Record<string, string> = {}) => {
  const params = new URLSearchParams(query).toString();
  const response = await get(
    params === "" ? "/api/activities" : `/api/activities?${params}`,
  );
  expect(response.status).toBe(200);
  return response.json<BrowseResponse>();
};

const hasCard = (body: BrowseResponse, { handle, name }: ListingKey) =>
  body.activities.some((card) => card.handle === handle && card.name === name);

const sitemap = async () =>
  (await exports.default.fetch("https://durables.dev/sitemap.xml")).text();

const inSitemap = (body: string, { handle, name }: ListingKey) =>
  body.includes(`https://durables.dev/${handle}/${name}@`);

/** Where the listing shows: search by its word, browse, search by publisher, the sitemap. */
const visibility = async (listing: ListingKey, word: string) => ({
  search: hasCard(await browse({ q: word }), listing),
  browse: hasCard(await browse(), listing),
  publisher: hasCard(await browse({ publisher: listing.handle }), listing),
  sitemap: inSitemap(await sitemap(), listing),
});

const everywhere = {
  search: true,
  browse: true,
  publisher: true,
  sitemap: true,
};
const nowhere = {
  search: false,
  browse: false,
  publisher: false,
  sitemap: false,
};

/** Every database row and every version document, so a test can show nothing was written. */
const snapshot = async () => {
  const documents = await env.DOCUMENTS.list({ prefix: "versions/" });
  return {
    rows: await readAllRows(env.DB),
    documents: documents.objects.map(({ key, etag }) => ({ key, etag })),
  };
};

/** Asserts a refusal: its status, Problem Details content type, and body members. */
const expectProblem = async (
  response: Response,
  status: number,
  members: Record<string, unknown> = {},
) => {
  expect(response.status).toBe(status);
  expect(response.headers.get("Content-Type")).toBe(problemContentType);
  expect(await response.json()).toMatchObject({ status, ...members });
};

describe("removing an activity from search", () => {
  test("answers 200 no-store with the listing removed by the publisher, and records the publisher as the source", async () => {
    const { address, cookie } = await newOwner();

    const response = await remove(address, cookie);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json<ListingResponse>();
    expect(body).toMatchObject({
      handle: address.handle,
      name: address.name,
      removedBy: "publisher",
    });
    expect(body.versions.map(({ version }) => version)).toEqual([
      "1.1.0",
      "1.0.0",
    ]);
    expect(await storedRemoval(address)).toBe("publisher");
  });

  test("answers the same shape as the listing read", async () => {
    const { address, cookie } = await newOwner();

    const removeBody = await (await remove(address, cookie)).json();
    const readBody = await (await get(listingPath(address))).json();

    expect(removeBody).toEqual(readBody);
  });

  test("takes it out of search, browse, search by publisher and the sitemap", async () => {
    const { address, word, cookie } = await newOwner();
    expect(await visibility(address, word)).toEqual(everywhere);

    await remove(address, cookie);

    expect(await visibility(address, word)).toEqual(nowhere);
  });

  test("leaves the publisher's other listings in search", async () => {
    const { address, handle, cookie } = await newOwner();
    const { address: sibling, word } = await publish(handle);

    await remove(address, cookie);

    expect(await visibility(sibling, word)).toEqual(everywhere);
  });

  test("lowers the browse count by one", async () => {
    const { address, cookie } = await newOwner();
    const before = (await browse({ publisher: address.handle })).count;

    await remove(address, cookie);

    expect((await browse({ publisher: address.handle })).count).toBe(
      before - 1,
    );
  });

  test("changes no version row, deprecation or document, and no other listing", async () => {
    const { address, handle, cookie } = await newOwner();
    await publish(handle);
    const before = await snapshot();

    await remove(address, cookie);

    const after = await snapshot();
    expect(after.documents).toEqual(before.documents);
    for (const table of Object.keys(before.rows).filter(
      (t) => t !== "listings",
    )) {
      expect(after.rows[table]).toEqual(before.rows[table]);
    }
    const isRemoved = (row: unknown) => {
      const { handle: h, name } = row as ListingKey;
      return h === address.handle && name === address.name;
    };
    expect(after.rows["listings"]?.filter((row) => !isRemoved(row))).toEqual(
      before.rows["listings"]?.filter((row) => !isRemoved(row)),
    );
  });
});

describe("a removed activity's pages and addresses", () => {
  test("the listing read answers 200 with every version and the removal", async () => {
    const { address, cookie } = await newOwner();
    await remove(address, cookie);

    const response = await get(listingPath(address));

    expect(response.status).toBe(200);
    const body = await response.json<ListingResponse>();
    expect(body.removedBy).toBe("publisher");
    expect(body.versions.map(({ version }) => version)).toEqual([
      "1.1.0",
      "1.0.0",
    ]);
  });

  test("every version's read answers 200, exactly as before the removal", async () => {
    const { address, cookie } = await newOwner();
    const all = [address, { ...address, version: "1.1.0" }];
    const before = await Promise.all(
      all.map(async (version) =>
        (await get(versionPath(version))).json<VersionResponse>(),
      ),
    );

    await remove(address, cookie);

    for (const [index, version] of all.entries()) {
      const response = await get(versionPath(version));
      expect(response.status).toBe(200);
      expect(await response.json<VersionResponse>()).toEqual(before[index]);
    }
  });

  test("the version read carries no removal", async () => {
    const { address, cookie } = await newOwner();
    await remove(address, cookie);

    const body = await (await get(versionPath(address))).json<object>();

    expect(body).not.toHaveProperty("removedBy");
  });

  test("the owner can still save a version's description", async () => {
    const { address, cookie } = await newOwner();
    await remove(address, cookie);

    const response = await exports.default.fetch(
      `http://localhost${listingPath(address)}`,
      {
        method: "PATCH",
        headers: {
          "Sec-Fetch-Site": "same-origin",
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify({ version: "1.0.0", description: "Changed." }),
      },
    );

    expect(response.status).toBe(200);
    expect((await response.json<ListingResponse>()).removedBy).toBe(
      "publisher",
    );
  });
});

describe("the listing read's removal", () => {
  test("is null for a listed activity", async () => {
    const { address } = await newOwner();

    const body = await (
      await get(listingPath(address))
    ).json<ListingResponse>();

    expect(body.removedBy).toBeNull();
  });

  test.each([
    ["the publisher", "publisher", "publisher"],
    ["account deletion", "account-deletion", "publisher"],
    ["Durables", "durables", "durables"],
  ] as const)("shows a removal by %s as %j", async (_, removedBy, shown) => {
    const { address } = await newOwner();
    await seedRemoval(env.DB, { ...address, removedBy });

    const body = await (
      await get(listingPath(address))
    ).json<ListingResponse>();

    expect(body.removedBy).toBe(shown);
  });

  test.each(["account-deletion", "durables"] as const)(
    "a removal by %s also leaves search, browse, search by publisher and the sitemap",
    async (removedBy) => {
      const { address, word } = await newOwner();

      await seedRemoval(env.DB, { ...address, removedBy });

      expect(await visibility(address, word)).toEqual(nowhere);
    },
  );
});

describe("returning an activity to search", () => {
  test("answers 200 no-store with the listing listed, and clears the removal", async () => {
    const { address, cookie } = await newOwner();
    await remove(address, cookie);

    const response = await returnToSearch(address, cookie);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json<ListingResponse>()).removedBy).toBeNull();
    expect(await storedRemoval(address)).toBeNull();
  });

  test("puts it back in search, browse, search by publisher and the sitemap", async () => {
    const { address, word, cookie } = await newOwner();
    await remove(address, cookie);
    expect(await visibility(address, word)).toEqual(nowhere);

    await returnToSearch(address, cookie);

    expect(await visibility(address, word)).toEqual(everywhere);
  });

  test("answers the same shape as the listing read", async () => {
    const { address, cookie } = await newOwner();
    await remove(address, cookie);

    const returnBody = await (await returnToSearch(address, cookie)).json();
    const readBody = await (await get(listingPath(address))).json();

    expect(returnBody).toEqual(readBody);
  });
});

describe("a removal the publisher did not make", () => {
  test("returning an activity removed by account deletion answers 409, and the removal stays", async () => {
    const { address, word, cookie } = await newOwner();
    await seedRemoval(env.DB, { ...address, removedBy: "account-deletion" });
    const before = await snapshot();

    const response = await returnToSearch(address, cookie);

    await expectProblem(response, 409);
    expect(await storedRemoval(address)).toBe("account-deletion");
    expect(await snapshot()).toEqual(before);
    expect(await visibility(address, word)).toEqual(nowhere);
  });

  test("returning an activity removed by Durables answers 409, and the removal stays", async () => {
    const { address, cookie } = await newOwner();
    await seedRemoval(env.DB, { ...address, removedBy: "durables" });
    const before = await snapshot();

    const response = await returnToSearch(address, cookie);

    await expectProblem(response, 409);
    expect(await storedRemoval(address)).toBe("durables");
    expect(await snapshot()).toEqual(before);
  });

  test.each(["account-deletion", "durables"] as const)(
    "removing an activity already removed by %s answers 200 and keeps that source",
    async (removedBy) => {
      const { address, cookie } = await newOwner();
      await seedRemoval(env.DB, { ...address, removedBy });
      const before = await snapshot();

      const response = await remove(address, cookie);

      expect(response.status).toBe(200);
      expect(await storedRemoval(address)).toBe(removedBy);
      expect(await snapshot()).toEqual(before);
    },
  );
});

describe("repeating a change", () => {
  test("removing a removed activity answers 200 and changes nothing", async () => {
    const { address, cookie } = await newOwner();
    await remove(address, cookie);
    const before = await snapshot();

    const response = await remove(address, cookie);

    expect(response.status).toBe(200);
    expect((await response.json<ListingResponse>()).removedBy).toBe(
      "publisher",
    );
    expect(await snapshot()).toEqual(before);
  });

  test("returning a listed activity answers 200 and changes nothing", async () => {
    const { address, cookie } = await newOwner();
    const before = await snapshot();

    const response = await returnToSearch(address, cookie);

    expect(response.status).toBe(200);
    expect((await response.json<ListingResponse>()).removedBy).toBeNull();
    expect(await snapshot()).toEqual(before);
  });
});

describe.each([
  ["removing a listed activity", remove, false],
  ["returning a removed activity", returnToSearch, true],
] as const)("who can change the removal: %s", (_, change, startRemoved) => {
  /** A listing in the state the change would alter, so a change that slipped through shows. */
  const removedListing = async () => {
    const owner = await newOwner();
    if (startRemoved) {
      await remove(owner.address, owner.cookie);
    }
    return owner;
  };

  test("a signed-out request answers 401 and stores nothing", async () => {
    const { address } = await removedListing();
    const before = await snapshot();

    await expectProblem(await change(address, undefined), 401);
    expect(await snapshot()).toEqual(before);
  });

  test("another account's publisher answers 403 and stores nothing", async () => {
    const { address } = await removedListing();
    const other = await seedAccount(env.DB);
    const cookie = await signIn(other.providerAccountId);
    const before = await snapshot();

    await expectProblem(await change(address, cookie), 403);
    expect(await snapshot()).toEqual(before);
  });

  test("a signed-in session with no account answers 403 and stores nothing", async () => {
    const { address } = await removedListing();
    const cookie = await signIn(`no-account-${crypto.randomUUID()}`);
    const before = await snapshot();

    await expectProblem(await change(address, cookie), 403);
    expect(await snapshot()).toEqual(before);
  });

  test("a wrong-case handle answers 403 and stores nothing", async () => {
    const { address, cookie } = await removedListing();
    const before = await snapshot();

    await expectProblem(
      await change(
        { ...address, handle: address.handle.toUpperCase() },
        cookie,
      ),
      403,
    );
    expect(await snapshot()).toEqual(before);
  });

  test("no listing at that name answers 404 and stores nothing", async () => {
    const { address, cookie } = await removedListing();
    const before = await snapshot();

    await expectProblem(
      await change(
        { handle: address.handle, name: "no-such-activity" },
        cookie,
      ),
      404,
    );
    expect(await snapshot()).toEqual(before);
  });

  test.each([
    ["a cross-site request", { "Sec-Fetch-Site": "cross-site" }],
    ["a same-site request", { "Sec-Fetch-Site": "same-site" }],
  ])("%s answers 403 and stores nothing", async (_, headers) => {
    const { address, cookie } = await removedListing();
    const before = await snapshot();

    await expectProblem(await change(address, cookie, headers), 403);
    expect(await snapshot()).toEqual(before);
  });
});
