import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, test } from "vitest";
import { listings } from "../storage/schema";
import { readAllRows, seedAccount, seedRemoval } from "../storage/seed";
import {
  Storage,
  type Address,
  type VersionDocument,
} from "../storage/storage";

// Deleting an account over HTTP, and refusing everything a pending account's old session tries
// (ADR 0015), against the real Worker with real local D1 and R2 (api/CONVENTIONS.md). Each test
// seeds its own account and signs in as it through the local fake provider.

const problemContentType = "application/problem+json";

/** The refusal a pending account's session gets, by its detail. */
const pendingRefusal = {
  detail: expect.stringContaining("waiting to be deleted") as string,
};

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
  description: "Charges a card.",
};

/** Publishes a listing's first version the way publishing does: the document, then the rows. */
const publish = async (handle: string, name: string): Promise<Address> => {
  const address = { handle, name, version: "1.0.0" };
  await storage().writeVersionDocument(address, document);
  await storage().createListing({
    ...address,
    title: document.title,
    description: document.description,
    sdk: document.facts.sdk,
  });
  return address;
};

/** The name=value pair of the cookie with this name, if the response sets one. */
const cookieNamed = (response: Response, name: string): string | undefined =>
  response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0] ?? "")
    .find((pair) => pair.startsWith(`${name}=`));

/** Signs in through the local fake provider, and returns the session cookie. */
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
  return cookieNamed(response, "__Host-session") ?? "";
};

/**
 * A signed-in owner with two listed activities and one they removed themselves. A neighbour's
 * listing sits beside them, to show deletion never reaches it.
 */
const newOwner = async () => {
  const account = await seedAccount(env.DB);
  const listed = [
    await publish(account.handle, "charge-card"),
    await publish(account.handle, "refund-card"),
  ];
  const removed = await publish(account.handle, "old-card");
  await seedRemoval(env.DB, { ...removed, removedBy: "publisher" });
  const neighbour = await seedAccount(env.DB);
  await publish(neighbour.handle, "charge-card");
  const cookie = await signIn(account.providerAccountId);
  return { ...account, listed, removed, neighbour, cookie };
};

const send = (
  method: string,
  path: string,
  cookie: string | undefined,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  exports.default.fetch(`http://localhost${path}`, {
    method,
    headers: {
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
      ...(cookie === undefined ? {} : { Cookie: cookie }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const deleteAccount = (
  cookie: string | undefined,
  body: unknown,
  headers: Record<string, string> = {},
) => send("DELETE", "/api/account", cookie, body, headers);

/** Who removed each of a handle's listings, by name. */
const removalsOf = async (handle: string) =>
  Object.fromEntries(
    (
      await drizzle(env.DB)
        .select({ name: listings.name, removedBy: listings.removedBy })
        .from(listings)
        .where(eq(listings.handle, handle))
    ).map(({ name, removedBy }) => [name, removedBy]),
  );

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

describe("DELETE /api/account", () => {
  describe("with the exact handle", () => {
    test("answers 204, marks the account pending and removes its listed activities by account deletion", async () => {
      const owner = await newOwner();

      const response = await deleteAccount(owner.cookie, {
        handle: owner.handle,
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(
        (await storage().findAccountState(owner))?.deletionRequestedAt,
      ).toBeInstanceOf(Date);
      expect(await removalsOf(owner.handle)).toEqual({
        "charge-card": "account-deletion",
        "refund-card": "account-deletion",
        "old-card": "publisher",
      });
      expect(await removalsOf(owner.neighbour.handle)).toEqual({
        "charge-card": null,
      });
    });

    test("ends the session", async () => {
      const owner = await newOwner();

      const response = await deleteAccount(owner.cookie, {
        handle: owner.handle,
      });

      const cleared = response.headers
        .getSetCookie()
        .find((header) => header.startsWith("__Host-session="));
      expect(cleared).toMatch(/^__Host-session=;/);
      expect(cleared).toContain("Max-Age=0");
    });

    test("deletes nothing published: every version's page and the listing still answer", async () => {
      const owner = await newOwner();
      const rowsBefore = await readAllRows(env.DB);

      await deleteAccount(owner.cookie, { handle: owner.handle });

      const rowsAfter = await readAllRows(env.DB);
      for (const table of [
        "providerAccounts",
        "handles",
        "retiredHandles",
        "versions",
        "versionDeprecations",
      ]) {
        expect(rowsAfter[table]).toEqual(rowsBefore[table]);
      }
      for (const address of [...owner.listed, owner.removed]) {
        const base = `http://localhost/api/activities/${address.handle}/${address.name}`;
        expect(
          (await exports.default.fetch(`${base}/versions/1.0.0`)).status,
        ).toBe(200);
        expect((await exports.default.fetch(base)).status).toBe(200);
      }
    });
  });

  describe("refusals that change nothing", () => {
    test.each([
      ["a different case", (handle: string) => handle.toUpperCase()],
      ["a trailing space", (handle: string) => `${handle} `],
      ["a leading space", (handle: string) => ` ${handle}`],
      ["an extra character", (handle: string) => `${handle}x`],
      ["a missing character", (handle: string) => handle.slice(0, -1)],
      ["an empty field", () => ""],
    ])("answers 422 for a handle typed with %s", async (_case, typed) => {
      const owner = await newOwner();
      const before = await snapshot();

      const response = await deleteAccount(owner.cookie, {
        handle: typed(owner.handle),
      });

      await expectProblem(response, 422, {
        errors: [{ field: "handle", message: expect.any(String) as string }],
      });
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(await snapshot()).toEqual(before);
    });

    test("answers 400 when the body names no handle", async () => {
      const owner = await newOwner();
      const before = await snapshot();

      const response = await deleteAccount(owner.cookie, {});

      await expectProblem(response, 400, {
        errors: [{ field: "handle", message: "Type your handle to confirm." }],
      });
      expect(await snapshot()).toEqual(before);
    });

    test("answers 401 when signed out", async () => {
      const owner = await newOwner();
      const before = await snapshot();

      const response = await deleteAccount(undefined, { handle: owner.handle });

      await expectProblem(response, 401);
      expect(await snapshot()).toEqual(before);
    });

    test("answers 404 for a session with no account yet", async () => {
      const cookie = await signIn(`no-account-${crypto.randomUUID()}`);
      const before = await snapshot();

      const response = await deleteAccount(cookie, { handle: "anything" });

      await expectProblem(response, 404);
      expect(await snapshot()).toEqual(before);
    });

    test("refuses a second delete from a session that is still valid, and changes nothing", async () => {
      const owner = await newOwner();
      await deleteAccount(owner.cookie, { handle: owner.handle });
      const before = await snapshot();

      // The cookie is a signed session, so it still verifies after the first delete ended it.
      const response = await deleteAccount(owner.cookie, {
        handle: owner.handle,
      });

      await expectProblem(response, 403, pendingRefusal);
      expect(await snapshot()).toEqual(before);
    });

    test("answers 403 to a request from another site", async () => {
      const owner = await newOwner();
      const before = await snapshot();

      const response = await deleteAccount(
        owner.cookie,
        { handle: owner.handle },
        { "Sec-Fetch-Site": "cross-site" },
      );

      expect(response.status).toBe(403);
      expect(await snapshot()).toEqual(before);
    });
  });
});

describe("a pending account's old session", () => {
  /**
   * An owner whose account was deleted from another device. This device's session is a signed
   * cookie, so it still verifies until it expires.
   */
  const pendingOwner = async () => {
    const owner = await newOwner();
    await storage().requestAccountDeletion(owner.accountId);
    return owner;
  };

  const publishBody = {
    code: "from temporalio import activity\n\n\n@activity.defn\nasync def charge_card(amount: int) -> str:\n    return 'ok'\n",
    title: "Charge card again",
    name: "charge-card-again",
    description: "Charges a card again.",
    confirmations: {
      rights: true,
      mitZero: true,
      noSecrets: true,
      notMalicious: true,
      noResponsibility: true,
      terms: true,
    },
  };

  test("is refused when it publishes", async () => {
    const owner = await pendingOwner();
    const before = await snapshot();

    const response = await send(
      "POST",
      "/api/activities",
      owner.cookie,
      publishBody,
    );

    await expectProblem(response, 403, pendingRefusal);
    expect(await snapshot()).toEqual(before);
  });

  test("is refused when it saves a description", async () => {
    const owner = await pendingOwner();
    const [address] = owner.listed;
    const before = await snapshot();

    const response = await send(
      "PATCH",
      `/api/activities/${address?.handle}/${address?.name}`,
      owner.cookie,
      { version: "1.0.0", description: "Changed while pending." },
    );

    await expectProblem(response, 403, pendingRefusal);
    expect(await snapshot()).toEqual(before);
  });

  test("is refused when it checks code for publishing", async () => {
    const owner = await pendingOwner();

    const response = await send("POST", "/api/checks", owner.cookie, {
      code: publishBody.code,
    });

    await expectProblem(response, 403, pendingRefusal);
  });

  test("cannot choose a handle", async () => {
    const owner = await pendingOwner();
    const before = await snapshot();

    const response = await send("PUT", "/api/session/handle", owner.cookie, {
      handle: `other-${crypto.randomUUID().slice(0, 8)}`,
    });

    await expectProblem(response, 409);
    expect(await snapshot()).toEqual(before);
  });

  test("is allowed again once the account is restored", async () => {
    const owner = await pendingOwner();
    await storage().restoreAccount(owner.accountId);
    const [address] = owner.listed;

    const response = await send(
      "PATCH",
      `/api/activities/${address?.handle}/${address?.name}`,
      owner.cookie,
      { version: "1.0.0", description: "Changed after restoring." },
    );

    expect(response.status).toBe(200);
  });
});
