import {
  listingDescriptionEmptyMessage,
  listingDescriptionTooLongMessage,
} from "@durables/schemas";
import { env, exports } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { readAllRows, seedAccount, seedVersion } from "../storage/seed";
import {
  Storage,
  type Address,
  type VersionDocument,
} from "../storage/storage";
import { versionDocumentKey } from "../storage/version-document";
import type { ListingResponse, VersionResponse } from "./responses";

// Saving one version's description over HTTP, against the real Worker with real local D1 and
// R2 (api/CONVENTIONS.md). Each test seeds its own account and signs in as it through the local
// fake provider, so addresses never collide.

const problemContentType = "application/problem+json";

const storage = () => new Storage(env.DB, env.DOCUMENTS);

const published = "Charges a card through Stripe and returns the charge.";
const saved = "Charges a card and records the receipt.";

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
  description: published,
};

const newName = () => `charge-card-${crypto.randomUUID().slice(0, 8)}`;

/** Publishes a listing's first version the way publishing does: the document, then the rows. */
const publish = async (handle: string, name = newName()): Promise<Address> => {
  const address = { handle, name, version: "1.0.0" };
  await storage().writeVersionDocument(address, document);
  await storage().createListing({
    ...address,
    title: document.title,
    description: published,
    sdk: document.facts.sdk,
  });
  return address;
};

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

/** A signed-in publisher whose account exists, with one published listing. */
const newOwner = async () => {
  const account = await seedAccount(env.DB);
  const address = await publish(account.handle);
  const cookie = await signIn(account.providerAccountId);
  return { ...account, address, cookie };
};

const listingPath = ({ handle, name }: Pick<Address, "handle" | "name">) =>
  `/api/activities/${encodeURIComponent(handle)}/${encodeURIComponent(name)}`;

const versionPath = (address: Address) =>
  `${listingPath(address)}/versions/${encodeURIComponent(address.version)}`;

/** Sends a PATCH to the real Worker, from our own origin unless the headers say otherwise. */
const patch = (
  address: Pick<Address, "handle" | "name">,
  cookie: string | undefined,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  exports.default.fetch(`http://localhost${listingPath(address)}`, {
    method: "PATCH",
    headers: {
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
      ...(cookie === undefined ? {} : { Cookie: cookie }),
      ...headers,
    },
    body: JSON.stringify(body),
  });

const get = (path: string) => exports.default.fetch(`http://localhost${path}`);

/** The description stored for a version, read straight from storage. */
const storedDescription = async (address: Address) =>
  (await storage().findListing(address))?.description;

/** Adds a later version under a published listing, with its document and its own description. */
const addVersion = async (
  address: Address,
  version: string,
  description: string,
): Promise<Address> => {
  const later = { ...address, version };
  await storage().writeVersionDocument(later, document);
  await seedVersion(env.DB, {
    ...later,
    title: document.title,
    sdk: document.facts.sdk,
    description,
    whatChanged: `Changes in ${version}.`,
    basedOn: address.version,
  });
  return later;
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

describe("PATCH /api/activities/:handle/:name", () => {
  describe("a save that succeeds", () => {
    test("answers 200 with the listing and the version's new description, and the version stores it", async () => {
      const { address, cookie } = await newOwner();

      const response = await patch(address, cookie, {
        version: "1.0.0",
        description: saved,
      });

      expect(response.status).toBe(200);
      expect(await response.json<ListingResponse>()).toEqual({
        handle: address.handle,
        name: address.name,
        removedBy: null,
        chips: [],
        versions: [
          {
            version: "1.0.0",
            publishedAt: expect.any(String) as string,
            whatChanged: null,
            basedOn: null,
            deprecation: null,
            description: saved,
          },
        ],
      });
      expect(await storedDescription(address)).toBe(saved);
    });

    test("carries no-store", async () => {
      const { address, cookie } = await newOwner();

      const response = await patch(address, cookie, {
        version: "1.0.0",
        description: saved,
      });

      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });

    test("answers the same shape as the listing read", async () => {
      const { address, cookie } = await newOwner();

      const saveBody = await (
        await patch(address, cookie, { version: "1.0.0", description: saved })
      ).json();
      const readBody = await (await get(listingPath(address))).json();

      expect(saveBody).toEqual(readBody);
    });

    test("stores and answers the description trimmed", async () => {
      const { address, cookie } = await newOwner();

      const response = await patch(address, cookie, {
        version: "1.0.0",
        description: `  ${saved}\t `,
      });

      expect(
        (await response.json<ListingResponse>()).versions[0]?.description,
      ).toBe(saved);
      expect(await storedDescription(address)).toBe(saved);
    });

    test("saves a description of exactly 160 characters", async () => {
      const { address, cookie } = await newOwner();
      const longest = "a".repeat(160);

      const response = await patch(address, cookie, {
        version: "1.0.0",
        description: longest,
      });

      expect(response.status).toBe(200);
      expect(await storedDescription(address)).toBe(longest);
    });

    test("ignores any other field in the body", async () => {
      const { address, cookie } = await newOwner();

      const response = await patch(address, cookie, {
        version: "1.0.0",
        description: saved,
        title: "Something else",
        handle: "someone-else",
      });

      expect(response.status).toBe(200);
      expect(await storedDescription(address)).toBe(saved);
      expect(await storage().findListing(address)).toMatchObject({
        handle: address.handle,
        name: address.name,
        title: document.title,
      });
    });

    test("changes no other listing, under the same handle or another", async () => {
      const { address, cookie, handle } = await newOwner();
      const sibling = await publish(handle);
      const elsewhere = await publish(
        (await seedAccount(env.DB)).handle,
        address.name,
      );

      await patch(address, cookie, { version: "1.0.0", description: saved });

      expect(await storedDescription(sibling)).toBe(published);
      expect(await storedDescription(elsewhere)).toBe(published);
    });
  });

  describe("a listing with several versions", () => {
    test("saving 1.1.0 changes only 1.1.0's description, and every version read and document is unchanged", async () => {
      const { address, cookie } = await newOwner();
      const middle = await addVersion(address, "1.1.0", "Version 1.1.0's own.");
      const latest = await addVersion(middle, "1.2.0", "Version 1.2.0's own.");
      const all = [address, middle, latest];
      const versionsBefore = await Promise.all(
        all.map(async (version) =>
          (await get(versionPath(version))).json<VersionResponse>(),
        ),
      );
      const before = await snapshot();

      const response = await patch(address, cookie, {
        version: "1.1.0",
        description: saved,
      });
      expect(response.status).toBe(200);

      expect(await storedDescription(middle)).toBe(saved);
      expect(await storedDescription(address)).toBe(published);
      expect(await storedDescription(latest)).toBe("Version 1.2.0's own.");
      const listing = await (
        await get(listingPath(address))
      ).json<ListingResponse>();
      expect(
        listing.versions.map(({ version, description }) => ({
          version,
          description,
        })),
      ).toEqual([
        { version: "1.2.0", description: "Version 1.2.0's own." },
        { version: "1.1.0", description: saved },
        { version: "1.0.0", description: published },
      ]);
      for (const [index, version] of all.entries()) {
        const read = await get(versionPath(version));
        expect(await read.json<VersionResponse>()).toEqual(
          versionsBefore[index],
        );
        const stored = await env.DOCUMENTS.get(versionDocumentKey(version));
        expect(await stored?.json<VersionDocument>()).toEqual(document);
      }
      const after = await snapshot();
      expect(after.documents).toEqual(before.documents);
      for (const table of Object.keys(before.rows).filter(
        (t) => t !== "versions",
      )) {
        expect(after.rows[table]).toEqual(before.rows[table]);
      }
      // Every version row but the one saved is exactly as it was.
      const isSaved = (row: unknown) => {
        const { name, version } = row as Address;
        return name === middle.name && version === middle.version;
      };
      expect(after.rows["versions"]?.filter((row) => !isSaved(row))).toEqual(
        before.rows["versions"]?.filter((row) => !isSaved(row)),
      );
    });
  });

  describe("a version that is not the listing's", () => {
    test.each([
      ["a version never published", "9.9.9"],
      ["a malformed version", "1.0.0-RC"],
    ])("%s answers 404 and stores nothing", async (_, version) => {
      const { address, cookie } = await newOwner();
      const before = await snapshot();

      const response = await patch(address, cookie, {
        version,
        description: saved,
      });

      await expectProblem(response, 404);
      expect(await snapshot()).toEqual(before);
    });

    test("another listing's version, under the same handle, answers 404 and stores nothing", async () => {
      const { address, cookie, handle } = await newOwner();
      const sibling = await publish(handle);
      await addVersion(sibling, "2.0.0", "The sibling's own.");
      const before = await snapshot();

      const response = await patch(address, cookie, {
        version: "2.0.0",
        description: saved,
      });

      await expectProblem(response, 404);
      expect(await snapshot()).toEqual(before);
    });

    test("a body with no version answers 400 and stores nothing", async () => {
      const { address, cookie } = await newOwner();
      const before = await snapshot();

      const response = await patch(address, cookie, { description: saved });

      await expectProblem(response, 400, {
        errors: [expect.objectContaining({ field: "version" })],
      });
      expect(await snapshot()).toEqual(before);
    });
  });

  describe("an invalid description", () => {
    test.each([
      ["an empty description", "", listingDescriptionEmptyMessage],
      ["a blank description", " \t\n ", listingDescriptionEmptyMessage],
      [
        "a description over 160 characters",
        "a".repeat(161),
        listingDescriptionTooLongMessage,
      ],
    ])(
      "%s answers 400 with the field error and stores nothing",
      async (_, description, message) => {
        const { address, cookie } = await newOwner();
        const before = await snapshot();

        const response = await patch(address, cookie, {
          version: "1.0.0",
          description,
        });

        await expectProblem(response, 400, {
          errors: [{ field: "description", message }],
        });
        expect(await snapshot()).toEqual(before);
      },
    );

    test("a body with no description answers 400 and stores nothing", async () => {
      const { address, cookie } = await newOwner();
      const before = await snapshot();

      const response = await patch(address, cookie, { version: "1.0.0" });

      await expectProblem(response, 400, {
        errors: [expect.objectContaining({ field: "description" })],
      });
      expect(await snapshot()).toEqual(before);
    });
  });

  describe("who can save", () => {
    test("a signed-out request answers 401 and stores nothing", async () => {
      const { address } = await newOwner();
      const before = await snapshot();

      const response = await patch(address, undefined, {
        version: "1.0.0",
        description: saved,
      });

      await expectProblem(response, 401);
      expect(await snapshot()).toEqual(before);
    });

    test("another account's publisher answers 403 and stores nothing", async () => {
      const { address } = await newOwner();
      const other = await seedAccount(env.DB);
      const cookie = await signIn(other.providerAccountId);
      const before = await snapshot();

      const response = await patch(address, cookie, {
        version: "1.0.0",
        description: saved,
      });

      await expectProblem(response, 403);
      expect(await snapshot()).toEqual(before);
    });

    test("a signed-in session with no account answers 403 and stores nothing", async () => {
      const { address } = await newOwner();
      const signedIn = await signIn(`no-account-${crypto.randomUUID()}`);
      const before = await snapshot();

      const response = await patch(address, signedIn, {
        version: "1.0.0",
        description: saved,
      });

      await expectProblem(response, 403);
      expect(await snapshot()).toEqual(before);
    });

    test("a wrong-case handle answers 403", async () => {
      const { address, cookie } = await newOwner();

      const response = await patch(
        { ...address, handle: address.handle.toUpperCase() },
        cookie,
        { version: "1.0.0", description: saved },
      );

      await expectProblem(response, 403);
      expect(await storedDescription(address)).toBe(published);
    });
  });

  describe("a missing listing", () => {
    test("no listing at that name under the account's handle answers 404", async () => {
      const { address, cookie } = await newOwner();
      const before = await snapshot();

      const response = await patch(
        { handle: address.handle, name: newName() },
        cookie,
        { version: "1.0.0", description: saved },
      );

      await expectProblem(response, 404);
      expect(await snapshot()).toEqual(before);
    });

    test("a wrong-case name answers 404", async () => {
      const { address, cookie } = await newOwner();

      const response = await patch(
        { ...address, name: address.name.toUpperCase() },
        cookie,
        { version: "1.0.0", description: saved },
      );

      await expectProblem(response, 404);
      expect(await storedDescription(address)).toBe(published);
    });
  });

  describe("the order of the checks", () => {
    test("signed out with an invalid description answers 401, not 400", async () => {
      const { address } = await newOwner();

      const response = await patch(address, undefined, {
        version: "1.0.0",
        description: "",
      });

      await expectProblem(response, 401);
    });

    test("not the owner with an invalid description answers 403, not 400", async () => {
      const { address } = await newOwner();
      const other = await seedAccount(env.DB);
      const cookie = await signIn(other.providerAccountId);

      const response = await patch(address, cookie, {
        version: "1.0.0",
        description: "",
      });

      await expectProblem(response, 403);
    });

    test("not the owner of a listing that does not exist answers 403, not 404", async () => {
      const { address } = await newOwner();
      const other = await seedAccount(env.DB);
      const cookie = await signIn(other.providerAccountId);

      const response = await patch(
        { handle: address.handle, name: newName() },
        cookie,
        { version: "1.0.0", description: saved },
      );

      await expectProblem(response, 403);
    });

    test("the owner, a missing listing and an invalid description answers 404, not 400", async () => {
      const { address, cookie } = await newOwner();

      const response = await patch(
        { handle: address.handle, name: newName() },
        cookie,
        { version: "1.0.0", description: "a".repeat(161) },
      );

      await expectProblem(response, 404);
    });
  });

  describe("the same-origin check", () => {
    test.each([
      ["a cross-site request", { "Sec-Fetch-Site": "cross-site" }],
      ["a same-site request", { "Sec-Fetch-Site": "same-site" }],
    ])("%s answers 403 and stores nothing", async (_, headers) => {
      const { address, cookie } = await newOwner();
      const before = await snapshot();

      const response = await patch(
        address,
        cookie,
        { version: "1.0.0", description: saved },
        headers,
      );

      await expectProblem(response, 403);
      expect(await snapshot()).toEqual(before);
    });

    test("a request with no Sec-Fetch-Site header answers 403 and stores nothing", async () => {
      const { address, cookie } = await newOwner();
      const before = await snapshot();

      const response = await exports.default.fetch(
        `http://localhost${listingPath(address)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ version: "1.0.0", description: saved }),
        },
      );

      await expectProblem(response, 403);
      expect(await snapshot()).toEqual(before);
    });
  });
});
