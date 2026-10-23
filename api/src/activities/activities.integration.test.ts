import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, test, vi } from "vitest";
import { seedAccount, seedDescription } from "../storage/seed";
import {
  Storage,
  type Address,
  type VersionDocument,
} from "../storage/storage";
import type { ListingResponse, VersionResponse } from "./responses";

// Reading a published activity over HTTP, against real local D1 and R2. Tests assert the
// cache headers each response carries, not that the edge honours them (api/CONVENTIONS.md).

const problemContentType = "application/problem+json";
const longCache = "public, max-age=31536000, immutable";
const shortCache = "public, max-age=0, s-maxage=60";

const storage = () => new Storage(env.DB, env.DOCUMENTS);

const facts: VersionDocument["facts"] = {
  sdk: "Python",
  activity: { name: "charge_card", line: 7 },
  input: "ChargeRequest",
  output: "ChargeResult",
  runsAs: "async",
  nonRetryableErrors: [{ line: 12 }],
  configurationRead: [{ name: "STRIPE_API_KEY", line: 9 }],
  dependencies: [{ name: "stripe", line: 2 }],
  heartbeats: [{ line: 8 }],
};

const description = "Charges a card through Stripe and returns the charge.";

/** A new address under a handle that exists, with a name no other test uses. */
const newAddress = async (): Promise<Address> => ({
  handle: (await seedAccount(env.DB)).handle,
  name: `charge-card-${crypto.randomUUID().slice(0, 8)}`,
  version: "1.0.0",
});

/** Publishes the way publishing does: the document first, then the rows (ADR 0005). */
const publish = async (address: Address): Promise<void> => {
  await storage().writeVersionDocument(address, {
    code: "import stripe\n",
    facts,
    integrations: ["Stripe"],
    snippets: [],
    title: "Charge card",
    description,
  });
  await storage().createListing({
    ...address,
    title: "Charge card",
    description,
    sdk: "Python",
    integrations: ["Stripe"],
  });
};

const versionPath = ({ handle, name, version }: Address) =>
  `/api/activities/${encodeURIComponent(handle)}/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`;

const listingPath = ({ handle, name }: Address) =>
  `/api/activities/${encodeURIComponent(handle)}/${encodeURIComponent(name)}`;

const get = (path: string) => exports.default.fetch(`http://localhost${path}`);

/** A 404 Problem Details response that nothing may keep for good. */
const expectNotFound = async (response: Response) => {
  expect(response.status).toBe(404);
  expect(response.headers.get("Content-Type")).toBe(problemContentType);
  expect(await response.json()).toMatchObject({ status: 404 });
  const cacheControl = response.headers.get("Cache-Control") ?? "";
  expect(cacheControl).not.toContain("immutable");
  expect(cacheControl).not.toContain("max-age=31536000");
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reading a published activity", () => {
  test("answers the version's address, title, SDK and detected facts", async () => {
    const address = await newAddress();
    await publish(address);

    const response = await get(versionPath(address));

    expect(response.status).toBe(200);
    expect(await response.json<VersionResponse>()).toEqual({
      address: `${address.handle}/${address.name}@1.0.0`,
      handle: address.handle,
      name: address.name,
      version: "1.0.0",
      title: "Charge card",
      sdk: "Python",
      facts,
    });
  });

  test("answers the listing's description", async () => {
    const address = await newAddress();
    await publish(address);

    const response = await get(listingPath(address));

    expect(response.status).toBe(200);
    expect(await response.json<ListingResponse>()).toEqual({
      handle: address.handle,
      name: address.name,
      description,
    });
  });

  test("never puts the description in the version response", async () => {
    const address = await newAddress();
    await publish(address);

    const body = await (await get(versionPath(address))).json<object>();

    expect(body).not.toHaveProperty("description");
  });
});

describe("cache rules", () => {
  test("the version's fields carry the long-cache header", async () => {
    const address = await newAddress();
    await publish(address);

    const response = await get(versionPath(address));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(longCache);
  });

  test("a repeated version read carries the long-cache header", async () => {
    const address = await newAddress();
    await publish(address);
    await get(versionPath(address));

    const response = await get(versionPath(address));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(longCache);
  });

  test("the description carries the short-cache header", async () => {
    const address = await newAddress();
    await publish(address);

    const response = await get(listingPath(address));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(shortCache);
  });
});

describe("an unknown address", () => {
  test("an unknown handle answers 404 for the version and the listing", async () => {
    const address = await newAddress();
    await publish(address);
    const unknown = { ...address, handle: `nobody-${address.handle}` };

    await expectNotFound(await get(versionPath(unknown)));
    await expectNotFound(await get(listingPath(unknown)));
  });

  test("an unknown name answers 404 for the version and the listing", async () => {
    const address = await newAddress();
    await publish(address);
    const unknown = { ...address, name: `${address.name}-other` };

    await expectNotFound(await get(versionPath(unknown)));
    await expectNotFound(await get(listingPath(unknown)));
  });

  test("an unknown version answers 404", async () => {
    const address = await newAddress();
    await publish(address);

    await expectNotFound(
      await get(versionPath({ ...address, version: "2.0.0" })),
    );
  });

  test("a 404 is not kept, so the address answers once it is published", async () => {
    const address = await newAddress();
    await expectNotFound(await get(versionPath(address)));

    await publish(address);

    const response = await get(versionPath(address));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(longCache);
  });

  test("a document with no row is never served", async () => {
    const address = await newAddress();
    await storage().writeVersionDocument(address, {
      code: "import stripe\n",
      facts,
      integrations: ["Stripe"],
      snippets: [],
      title: "Charge card",
      description,
    });

    await expectNotFound(await get(versionPath(address)));
  });

  test("a row with no document answers 500, not the row alone", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const address = await newAddress();
    await storage().createListing({
      ...address,
      title: "Charge card",
      description,
      sdk: "Python",
      integrations: ["Stripe"],
    });

    const response = await get(versionPath(address));

    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).toBe(problemContentType);
    expect(response.headers.get("Cache-Control") ?? "").not.toContain(
      "immutable",
    );
  });
});

describe("a wrong-case address", () => {
  // Handles and names are lowercase and never lowercased for the caller (@durables/schemas),
  // so a wrong-case address is a different, unknown address.
  test("a wrong-case handle answers 404 for the version and the listing", async () => {
    const address = await newAddress();
    await publish(address);
    const upper = { ...address, handle: address.handle.toUpperCase() };

    await expectNotFound(await get(versionPath(upper)));
    await expectNotFound(await get(listingPath(upper)));
  });

  test("a wrong-case name answers 404 for the version and the listing", async () => {
    const address = await newAddress();
    await publish(address);
    const upper = { ...address, name: address.name.toUpperCase() };

    await expectNotFound(await get(versionPath(upper)));
    await expectNotFound(await get(listingPath(upper)));
  });
});

describe("a description changed after publishing", () => {
  test("the listing answers the new description and the version is unchanged", async () => {
    const address = await newAddress();
    await publish(address);
    const before = await (
      await get(versionPath(address))
    ).json<VersionResponse>();

    await seedDescription(env.DB, {
      ...address,
      description: "Charges a card and records the receipt.",
    });

    const listing = await get(listingPath(address));
    expect(await listing.json<ListingResponse>()).toMatchObject({
      description: "Charges a card and records the receipt.",
    });
    const version = await get(versionPath(address));
    expect(version.status).toBe(200);
    expect(await version.json<VersionResponse>()).toEqual(before);
  });

  test("the version still matches what is stored once the description changes", async () => {
    const address = await newAddress();
    await publish(address);
    await seedDescription(env.DB, {
      ...address,
      description: "Charges a card and records the receipt.",
    });

    // Read for the first time after the change, so the answer comes from storage, not a
    // kept response.
    const response = await get(versionPath(address));

    expect(await response.json<VersionResponse>()).toEqual({
      address: `${address.handle}/${address.name}@1.0.0`,
      handle: address.handle,
      name: address.name,
      version: "1.0.0",
      title: "Charge card",
      sdk: "Python",
      facts,
    });
  });
});

describe("read-only", () => {
  test.each(["POST", "PUT", "PATCH", "DELETE"])(
    "a %s to a version answers 404",
    async (method) => {
      const address = await newAddress();
      await publish(address);

      const response = await exports.default.fetch(
        `http://localhost${versionPath(address)}`,
        { method, headers: { "Sec-Fetch-Site": "same-origin" } },
      );

      expect(response.status).toBe(404);
    },
  );
});
