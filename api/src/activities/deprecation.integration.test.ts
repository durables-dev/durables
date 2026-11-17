import {
  deprecationReasonEmptyMessage,
  deprecationReasonTooLongMessage,
} from "@durables/schemas";
import { env, exports } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import {
  readAllRows,
  seedAccount,
  seedDeprecation,
  seedVersion,
} from "../storage/seed";
import {
  Storage,
  type Address,
  type VersionDocument,
} from "../storage/storage";
import { versionDocumentKey } from "../storage/version-document";
import type { ListingResponse, VersionResponse } from "./responses";

// Deprecating a version and undoing it over HTTP, against the real Worker with real local D1
// and R2 (api/CONVENTIONS.md). Each test seeds its own account and signs in as it through the
// local fake provider, so addresses never collide.

const problemContentType = "application/problem+json";

const storage = () => new Storage(env.DB, env.DOCUMENTS);

const reason = "Declined cards are retried until the retry policy gives up.";

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
  description: "Charges a card through Stripe and returns the charge.",
};

const newName = () => `charge-card-${crypto.randomUUID().slice(0, 8)}`;

/** Publishes a listing's first version the way publishing does: the document, then the rows. */
const publish = async (handle: string, name = newName()): Promise<Address> => {
  const address = { handle, name, version: "1.0.0" };
  await storage().writeVersionDocument(address, document);
  await storage().createListing({
    ...address,
    title: document.title,
    description: document.description,
    sdk: document.facts.sdk,
    integrations: document.integrations,
  });
  return address;
};

/** Adds a later version under a published listing, with its document. */
const addVersion = async (base: Address, version: string): Promise<Address> => {
  const later = { ...base, version };
  await storage().writeVersionDocument(later, document);
  await seedVersion(env.DB, {
    ...later,
    title: document.title,
    sdk: document.facts.sdk,
    integrations: [...document.integrations],
    description: document.description,
    whatChanged: `Changes in ${version}.`,
    basedOn: base.version,
  });
  return later;
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

/** A signed-in publisher whose account exists, with one listing at 1.0.0 and 1.1.0. */
const newOwner = async () => {
  const account = await seedAccount(env.DB);
  const first = await publish(account.handle);
  const second = await addVersion(first, "1.1.0");
  const cookie = await signIn(account.providerAccountId);
  return { ...account, first, second, cookie };
};

const listingPath = ({ handle, name }: Pick<Address, "handle" | "name">) =>
  `/api/activities/${encodeURIComponent(handle)}/${encodeURIComponent(name)}`;

const versionPath = (address: Address) =>
  `${listingPath(address)}/versions/${encodeURIComponent(address.version)}`;

const deprecationPath = (address: Address) =>
  `${versionPath(address)}/deprecation`;

/** Sends a request to the real Worker, from our own origin unless the headers say otherwise. */
const send = (
  method: "PUT" | "DELETE",
  address: Address,
  cookie: string | undefined,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  exports.default.fetch(`http://localhost${deprecationPath(address)}`, {
    method,
    headers: {
      "Sec-Fetch-Site": "same-origin",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie === undefined ? {} : { Cookie: cookie }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const deprecate = (
  address: Address,
  cookie: string | undefined,
  body: unknown,
  headers: Record<string, string> = {},
) => send("PUT", address, cookie, body, headers);

const undo = (
  address: Address,
  cookie: string | undefined,
  headers: Record<string, string> = {},
) => send("DELETE", address, cookie, undefined, headers);

const get = (path: string) => exports.default.fetch(`http://localhost${path}`);

/** Each version's deprecation, as the listing read answers it, newest first. */
const deprecations = async (address: Address) => {
  const listing = await (
    await get(listingPath(address))
  ).json<ListingResponse>();
  return listing.versions.map(({ version, deprecation }) => ({
    version,
    deprecation,
  }));
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

/** The version read and document of each version, so a test can show neither changed. */
const versionReads = async (addresses: Address[]) =>
  Promise.all(
    addresses.map(async (address) => {
      const read = await get(versionPath(address));
      const stored = await env.DOCUMENTS.get(versionDocumentKey(address));
      return {
        status: read.status,
        cacheControl: read.headers.get("Cache-Control"),
        body: await read.json<VersionResponse>(),
        document: await stored?.json<VersionDocument>(),
      };
    }),
  );

describe("PUT /api/activities/:handle/:name/versions/:version/deprecation", () => {
  describe("a deprecation that succeeds", () => {
    test("with a reason and replacement 1.1.0, the listing read shows both on 1.0.0 only", async () => {
      const { first, cookie } = await newOwner();

      const response = await deprecate(first, cookie, {
        reason,
        replacement: "1.1.0",
      });

      expect(response.status).toBe(200);
      const answered = await response.json<ListingResponse>();
      expect(answered.versions.map(({ deprecation }) => deprecation)).toEqual([
        null,
        { reason, replacement: "1.1.0" },
      ]);
      expect(await deprecations(first)).toEqual([
        { version: "1.1.0", deprecation: null },
        { version: "1.0.0", deprecation: { reason, replacement: "1.1.0" } },
      ]);
    });

    test("answers the same shape as the listing read, with no-store", async () => {
      const { first, cookie } = await newOwner();

      const response = await deprecate(first, cookie, {
        reason,
        replacement: "1.1.0",
      });

      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual(
        await (await get(listingPath(first))).json(),
      );
    });

    test.each([
      ["an omitted replacement", {}],
      ["a null replacement", { replacement: null }],
    ])("with %s stores no replacement", async (_, replacement) => {
      const { first, cookie } = await newOwner();

      const response = await deprecate(first, cookie, {
        reason,
        ...replacement,
      });

      expect(response.status).toBe(200);
      expect(await deprecations(first)).toEqual([
        { version: "1.1.0", deprecation: null },
        { version: "1.0.0", deprecation: { reason, replacement: null } },
      ]);
    });

    test("stores the reason trimmed", async () => {
      const { first, cookie } = await newOwner();

      await deprecate(first, cookie, { reason: ` \t${reason}\n` });

      expect((await deprecations(first))[1]?.deprecation?.reason).toBe(reason);
    });

    test("can name an older version as the replacement of a newer one", async () => {
      const { first, second, cookie } = await newOwner();

      const response = await deprecate(second, cookie, {
        reason,
        replacement: "1.0.0",
      });

      expect(response.status).toBe(200);
      expect(await deprecations(first)).toEqual([
        { version: "1.1.0", deprecation: { reason, replacement: "1.0.0" } },
        { version: "1.0.0", deprecation: null },
      ]);
    });

    test("deprecating an already deprecated version replaces its reason and replacement", async () => {
      const { first, cookie } = await newOwner();
      await addVersion(first, "2.0.0");
      await deprecate(first, cookie, { reason, replacement: "1.1.0" });

      const response = await deprecate(first, cookie, {
        reason: "Use the new major version.",
        replacement: "2.0.0",
      });

      expect(response.status).toBe(200);
      expect((await deprecations(first))[2]).toEqual({
        version: "1.0.0",
        deprecation: {
          reason: "Use the new major version.",
          replacement: "2.0.0",
        },
      });
      const rows = (await readAllRows(env.DB))["versionDeprecations"]?.filter(
        (row) => (row as Address).name === first.name,
      );
      expect(rows).toHaveLength(1);
    });

    test("re-deprecating with no replacement clears the replacement", async () => {
      const { first, cookie } = await newOwner();
      await deprecate(first, cookie, { reason, replacement: "1.1.0" });

      await deprecate(first, cookie, { reason });

      expect((await deprecations(first))[1]?.deprecation).toEqual({
        reason,
        replacement: null,
      });
    });

    test("changes no version row, version read or version document", async () => {
      const { first, second, cookie } = await newOwner();
      const readsBefore = await versionReads([first, second]);
      const before = await snapshot();

      await deprecate(first, cookie, { reason, replacement: "1.1.0" });

      expect(await versionReads([first, second])).toEqual(readsBefore);
      const after = await snapshot();
      expect(after.documents).toEqual(before.documents);
      for (const table of Object.keys(before.rows).filter(
        (t) => t !== "versionDeprecations",
      )) {
        expect(after.rows[table]).toEqual(before.rows[table]);
      }
      expect(readsBefore[0]?.body).not.toHaveProperty("deprecation");
    });

    test("deprecates no other listing's version under the same handle", async () => {
      const { first, cookie, handle } = await newOwner();
      const sibling = await publish(handle);
      await addVersion(sibling, "1.1.0");

      await deprecate(first, cookie, { reason, replacement: "1.1.0" });

      expect(await deprecations(sibling)).toEqual([
        { version: "1.1.0", deprecation: null },
        { version: "1.0.0", deprecation: null },
      ]);
    });
  });

  describe("an invalid reason", () => {
    test.each([
      ["an empty reason", "", deprecationReasonEmptyMessage],
      ["a whitespace-only reason", " \t\n ", deprecationReasonEmptyMessage],
      [
        "a reason over 160 characters",
        "a".repeat(161),
        deprecationReasonTooLongMessage,
      ],
    ])(
      "%s answers 400 with the field error and stores nothing",
      async (_, empty, message) => {
        const { first, cookie } = await newOwner();
        const before = await snapshot();

        const response = await deprecate(first, cookie, {
          reason: empty,
          replacement: "1.1.0",
        });

        await expectProblem(response, 400, {
          errors: [{ field: "reason", message }],
        });
        expect(await snapshot()).toEqual(before);
      },
    );

    test("a body with no reason answers 400 and stores nothing", async () => {
      const { first, cookie } = await newOwner();
      const before = await snapshot();

      const response = await deprecate(first, cookie, {
        replacement: "1.1.0",
      });

      await expectProblem(response, 400, {
        errors: [expect.objectContaining({ field: "reason" })],
      });
      expect(await snapshot()).toEqual(before);
    });

    test("an empty reason on an already deprecated version leaves its deprecation as it was", async () => {
      const { first, cookie } = await newOwner();
      await deprecate(first, cookie, { reason, replacement: "1.1.0" });

      const response = await deprecate(first, cookie, { reason: "  " });

      await expectProblem(response, 400);
      expect((await deprecations(first))[1]?.deprecation).toEqual({
        reason,
        replacement: "1.1.0",
      });
    });
  });

  describe("an unacceptable replacement", () => {
    test("a version of another listing under the same handle answers 422 and stores nothing", async () => {
      const { first, cookie, handle } = await newOwner();
      const sibling = await publish(handle);
      await addVersion(sibling, "2.0.0");
      const before = await snapshot();

      const response = await deprecate(first, cookie, {
        reason,
        replacement: "2.0.0",
      });

      await expectProblem(response, 422, {
        errors: [expect.objectContaining({ field: "replacement" })],
      });
      expect(await snapshot()).toEqual(before);
    });

    test("another listing's address answers 422 and stores nothing", async () => {
      const { first, cookie, handle } = await newOwner();
      const sibling = await publish(handle);
      const before = await snapshot();

      const response = await deprecate(first, cookie, {
        reason,
        replacement: `${sibling.handle}/${sibling.name}@1.0.0`,
      });

      await expectProblem(response, 422, {
        errors: [expect.objectContaining({ field: "replacement" })],
      });
      expect(await snapshot()).toEqual(before);
    });

    test("the version itself answers 422 and stores nothing", async () => {
      const { first, cookie } = await newOwner();
      const before = await snapshot();

      const response = await deprecate(first, cookie, {
        reason,
        replacement: "1.0.0",
      });

      await expectProblem(response, 422, {
        errors: [expect.objectContaining({ field: "replacement" })],
      });
      expect(await snapshot()).toEqual(before);
    });

    test("a version never published answers 422 and stores nothing", async () => {
      const { first, cookie } = await newOwner();
      const before = await snapshot();

      const response = await deprecate(first, cookie, {
        reason,
        replacement: "9.9.9",
      });

      await expectProblem(response, 422, {
        errors: [expect.objectContaining({ field: "replacement" })],
      });
      expect(await snapshot()).toEqual(before);
    });

    test("an empty replacement answers 400 and stores nothing", async () => {
      const { first, cookie } = await newOwner();
      const before = await snapshot();

      const response = await deprecate(first, cookie, {
        reason,
        replacement: "",
      });

      await expectProblem(response, 400, {
        errors: [expect.objectContaining({ field: "replacement" })],
      });
      expect(await snapshot()).toEqual(before);
    });

    test("the version itself on an already deprecated version leaves its deprecation as it was", async () => {
      const { first, cookie } = await newOwner();
      await deprecate(first, cookie, { reason, replacement: "1.1.0" });

      const response = await deprecate(first, cookie, {
        reason: "Something else.",
        replacement: "1.0.0",
      });

      await expectProblem(response, 422);
      expect((await deprecations(first))[1]?.deprecation).toEqual({
        reason,
        replacement: "1.1.0",
      });
    });
  });

  describe("a version that is not the listing's", () => {
    test("a version never published answers 404 and stores nothing", async () => {
      const { first, cookie } = await newOwner();
      const before = await snapshot();

      const response = await deprecate({ ...first, version: "9.9.9" }, cookie, {
        reason,
        replacement: "1.1.0",
      });

      await expectProblem(response, 404);
      expect(await snapshot()).toEqual(before);
    });

    test("another listing's version under the same handle answers 404 and stores nothing", async () => {
      const { first, cookie, handle } = await newOwner();
      const sibling = await publish(handle);
      await addVersion(sibling, "2.0.0");
      const before = await snapshot();

      const response = await deprecate({ ...first, version: "2.0.0" }, cookie, {
        reason,
      });

      await expectProblem(response, 404);
      expect(await snapshot()).toEqual(before);
    });

    test("a listing that does not exist answers 404 and stores nothing", async () => {
      const { first, cookie } = await newOwner();
      const before = await snapshot();

      const response = await deprecate({ ...first, name: newName() }, cookie, {
        reason,
      });

      await expectProblem(response, 404);
      expect(await snapshot()).toEqual(before);
    });
  });

  describe("who can deprecate", () => {
    test("a signed-out request answers 401 and stores nothing", async () => {
      const { first } = await newOwner();
      const before = await snapshot();

      const response = await deprecate(first, undefined, {
        reason,
        replacement: "1.1.0",
      });

      await expectProblem(response, 401);
      expect(await snapshot()).toEqual(before);
    });

    test("another account's publisher answers 403 and stores nothing", async () => {
      const { first } = await newOwner();
      const other = await seedAccount(env.DB);
      const cookie = await signIn(other.providerAccountId);
      const before = await snapshot();

      const response = await deprecate(first, cookie, {
        reason,
        replacement: "1.1.0",
      });

      await expectProblem(response, 403);
      expect(await snapshot()).toEqual(before);
    });

    test("a signed-in session with no account answers 403 and stores nothing", async () => {
      const { first } = await newOwner();
      const cookie = await signIn(`no-account-${crypto.randomUUID()}`);
      const before = await snapshot();

      const response = await deprecate(first, cookie, {
        reason,
        replacement: "1.1.0",
      });

      await expectProblem(response, 403);
      expect(await snapshot()).toEqual(before);
    });

    test("not the owner with an empty reason answers 403, not 400", async () => {
      const { first } = await newOwner();
      const other = await seedAccount(env.DB);
      const cookie = await signIn(other.providerAccountId);

      const response = await deprecate(first, cookie, { reason: "" });

      await expectProblem(response, 403);
    });

    test.each([
      ["a cross-site request", { "Sec-Fetch-Site": "cross-site" }],
      ["a same-site request", { "Sec-Fetch-Site": "same-site" }],
    ])("%s answers 403 and stores nothing", async (_, headers) => {
      const { first, cookie } = await newOwner();
      const before = await snapshot();

      const response = await deprecate(
        first,
        cookie,
        { reason, replacement: "1.1.0" },
        headers,
      );

      await expectProblem(response, 403);
      expect(await snapshot()).toEqual(before);
    });
  });
});

describe("DELETE /api/activities/:handle/:name/versions/:version/deprecation", () => {
  describe("an undo that succeeds", () => {
    test("deletes the record, and the listing read shows no deprecation", async () => {
      const { first, cookie } = await newOwner();
      await deprecate(first, cookie, { reason, replacement: "1.1.0" });

      const response = await undo(first, cookie);

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(
        (await response.json<ListingResponse>()).versions.map(
          ({ deprecation }) => deprecation,
        ),
      ).toEqual([null, null]);
      expect(await deprecations(first)).toEqual([
        { version: "1.1.0", deprecation: null },
        { version: "1.0.0", deprecation: null },
      ]);
      const rows = (await readAllRows(env.DB))["versionDeprecations"]?.filter(
        (row) => (row as Address).name === first.name,
      );
      expect(rows).toEqual([]);
    });

    test("leaves the listing's other deprecations as they were", async () => {
      const { first, second, cookie } = await newOwner();
      const latest = await addVersion(second, "2.0.0");
      await seedDeprecation(env.DB, { ...first, reason, replacement: "2.0.0" });
      await seedDeprecation(env.DB, {
        ...second,
        reason: "Also broken.",
        replacement: "2.0.0",
      });

      await undo(first, cookie);

      expect(await deprecations(latest)).toEqual([
        { version: "2.0.0", deprecation: null },
        {
          version: "1.1.0",
          deprecation: { reason: "Also broken.", replacement: "2.0.0" },
        },
        { version: "1.0.0", deprecation: null },
      ]);
    });

    test("on a version that is not deprecated answers 200 and changes nothing", async () => {
      const { first, cookie } = await newOwner();
      const before = await snapshot();

      const response = await undo(first, cookie);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(
        await (await get(listingPath(first))).json(),
      );
      expect(await snapshot()).toEqual(before);
    });

    test("changes no version row, version read or version document", async () => {
      const { first, second, cookie } = await newOwner();
      await deprecate(first, cookie, { reason, replacement: "1.1.0" });
      const readsBefore = await versionReads([first, second]);
      const before = await snapshot();

      await undo(first, cookie);

      expect(await versionReads([first, second])).toEqual(readsBefore);
      const after = await snapshot();
      expect(after.documents).toEqual(before.documents);
      for (const table of Object.keys(before.rows).filter(
        (t) => t !== "versionDeprecations",
      )) {
        expect(after.rows[table]).toEqual(before.rows[table]);
      }
    });
  });

  describe("a version that is not the listing's", () => {
    test("a version never published answers 404", async () => {
      const { first, cookie } = await newOwner();
      const before = await snapshot();

      const response = await undo({ ...first, version: "9.9.9" }, cookie);

      await expectProblem(response, 404);
      expect(await snapshot()).toEqual(before);
    });

    test("a listing that does not exist answers 404", async () => {
      const { first, cookie } = await newOwner();

      const response = await undo({ ...first, name: newName() }, cookie);

      await expectProblem(response, 404);
    });
  });

  describe("who can undo", () => {
    test("a signed-out request answers 401 and keeps the deprecation", async () => {
      const { first } = await newOwner();
      await seedDeprecation(env.DB, { ...first, reason, replacement: "1.1.0" });
      const before = await snapshot();

      const response = await undo(first, undefined);

      await expectProblem(response, 401);
      expect(await snapshot()).toEqual(before);
    });

    test("another account's publisher answers 403 and keeps the deprecation", async () => {
      const { first } = await newOwner();
      await seedDeprecation(env.DB, { ...first, reason, replacement: "1.1.0" });
      const other = await seedAccount(env.DB);
      const cookie = await signIn(other.providerAccountId);
      const before = await snapshot();

      const response = await undo(first, cookie);

      await expectProblem(response, 403);
      expect(await snapshot()).toEqual(before);
    });

    test("a signed-in session with no account answers 403 and keeps the deprecation", async () => {
      const { first } = await newOwner();
      await seedDeprecation(env.DB, { ...first, reason, replacement: "1.1.0" });
      const cookie = await signIn(`no-account-${crypto.randomUUID()}`);
      const before = await snapshot();

      const response = await undo(first, cookie);

      await expectProblem(response, 403);
      expect(await snapshot()).toEqual(before);
    });

    test("a cross-site request answers 403 and keeps the deprecation", async () => {
      const { first, cookie } = await newOwner();
      await seedDeprecation(env.DB, { ...first, reason, replacement: "1.1.0" });
      const before = await snapshot();

      const response = await undo(first, cookie, {
        "Sec-Fetch-Site": "cross-site",
      });

      await expectProblem(response, 403);
      expect(await snapshot()).toEqual(before);
    });
  });
});
