import {
  deprecationReasonEmptyMessage,
  versionNotHigherMessage,
  versionTakenMessage,
  whatChangedEmptyMessage,
  whatChangedMaxLength,
  whatChangedTooLongMessage,
} from "@durables/schemas";
import { env, exports } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import {
  readAllRows,
  seedAccount,
  seedChips,
  seedRemoval,
} from "../storage/seed";
import { Storage, type Address, type RemovalSource } from "../storage/storage";
import { versionDocumentKey } from "../storage/version-document";
import { publishProblemTypes } from "./publish-problems";
import type {
  BrowseResponse,
  ListingResponse,
  PublishResponse,
  VersionResponse,
} from "./responses";

// Publishing a later version of an existing listing over HTTP, against the real Worker with real
// local D1 and R2 (api/CONVENTIONS.md). Each test seeds its own account, signs in as it through
// the local fake provider and publishes its own first version, so addresses never collide.

const problemContentType = "application/problem+json";

const storage = () => new Storage(env.DB, env.DOCUMENTS);

const lines = (...code: string[]) => code.join("\n");

/** A Python activity importing slack_sdk, which implies the Slack integration. */
const postSlackMessage = lines(
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
);

/** The same activity with a retry, as a fix would be published. */
const postSlackMessageWithRetry = lines(
  "import os",
  "",
  "from slack_sdk import WebClient",
  "from temporalio import activity",
  "",
  "",
  "@activity.defn",
  "async def post_slack_message(channel: str) -> str:",
  "    activity.heartbeat()",
  '    client = WebClient(token=os.environ["SLACK_TOKEN"])',
  "    return client.chat_postMessage(channel=channel).data['ts']",
  "",
);

const confirmations = {
  rights: true,
  mitZero: true,
  noSecrets: true,
  notMalicious: true,
  noResponsibility: true,
  terms: true,
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

const post = (
  path: string,
  cookie: string | undefined,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  exports.default.fetch(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
      ...(cookie === undefined ? {} : { Cookie: cookie }),
      ...headers,
    },
    body: JSON.stringify(body),
  });

const get = (path: string) => exports.default.fetch(`http://localhost${path}`);

const listingPath = ({ handle, name }: Pick<Address, "handle" | "name">) =>
  `/api/activities/${encodeURIComponent(handle)}/${encodeURIComponent(name)}`;

const versionsPath = (listing: Pick<Address, "handle" | "name">) =>
  `${listingPath(listing)}/versions`;

const versionPath = (address: Address) =>
  `${versionsPath(address)}/${encodeURIComponent(address.version)}`;

/** A signed-in owner whose account exists, with one listing published at 1.0.0 over HTTP. */
const newOwner = async () => {
  const account = await seedAccount(env.DB);
  const cookie = await signIn(account.providerAccountId);
  const name = `post-slack-message-${crypto.randomUUID().slice(0, 8)}`;
  const response = await post("/api/activities", cookie, {
    code: postSlackMessage,
    title: "Post slack message",
    name,
    description: "Posts a message to a Slack channel.",
    confirmations,
  });
  expect(response.status).toBe(201);
  const listing = { handle: account.handle, name };
  return { ...account, cookie, listing };
};

/** A valid new-version body based on 1.0.0. */
const newVersionBody = (overrides: Record<string, unknown> = {}) => ({
  code: postSlackMessageWithRetry,
  title: "Post slack message",
  description: "Posts a message to a Slack channel, with a heartbeat.",
  version: "1.1.0",
  basedOn: "1.0.0",
  whatChanged: "Heartbeats while posting.",
  confirmations,
  ...overrides,
});

const publishNewVersion = (
  owner: {
    cookie: string | undefined;
    listing: Pick<Address, "handle" | "name">;
  },
  body: unknown,
  headers: Record<string, string> = {},
) => post(versionsPath(owner.listing), owner.cookie, body, headers);

const readListing = async (listing: Pick<Address, "handle" | "name">) => {
  const response = await get(listingPath(listing));
  expect(response.status).toBe(200);
  return response.json<ListingResponse>();
};

/** Asserts a refusal: its status, Problem Details content type, and body members. */
const expectProblem = async (
  response: Response,
  status: number,
  members: Record<string, unknown> = {},
) => {
  expect(response.status).toBe(status);
  expect(response.headers.get("Content-Type")).toBe(problemContentType);
  const body = await response.json<Record<string, unknown>>();
  expect(body).toMatchObject({ status, ...members });
  return body;
};

/** Every database row and every version document, so a test can show nothing was written. */
const snapshot = async () => {
  const documents = await env.DOCUMENTS.list({ prefix: "versions/" });
  return {
    rows: await readAllRows(env.DB),
    documents: documents.objects.map(({ key, etag }) => ({ key, etag })),
  };
};

describe("POST /api/activities/:handle/:name/versions", () => {
  describe("a new version that publishes", () => {
    test("answers 201 with its location, and the listing reads it back as the latest with its base, note and description", async () => {
      const owner = await newOwner();
      const address = { ...owner.listing, version: "1.1.0" };

      const response = await publishNewVersion(owner, newVersionBody());

      expect(response.status).toBe(201);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Location")).toBe(versionPath(address));
      expect(await response.json<PublishResponse>()).toEqual({
        ...address,
        address: `${address.handle}/${address.name}@1.1.0`,
        location: versionPath(address),
        accountCreated: false,
      });
      const listing = await readListing(owner.listing);
      expect(listing.versions.map(({ version }) => version)).toEqual([
        "1.1.0",
        "1.0.0",
      ]);
      expect(listing.versions[0]).toMatchObject({
        version: "1.1.0",
        basedOn: "1.0.0",
        whatChanged: "Heartbeats while posting.",
        description: "Posts a message to a Slack channel, with a heartbeat.",
        deprecation: null,
      });
      expect(listing.versions[1]).toMatchObject({
        description: "Posts a message to a Slack channel.",
        deprecation: null,
      });
    });

    test("stores the new code and the checks' own results in the version's document and read", async () => {
      const owner = await newOwner();
      const address = { ...owner.listing, version: "1.1.0" };

      await publishNewVersion(
        owner,
        newVersionBody({
          title: "Post slack message, with heartbeats",
          // Detection results from the client are dropped.
          facts: { sdk: "Go" },
        }),
      );

      const response = await get(versionPath(address));
      expect(response.status).toBe(200);
      const version = await response.json<VersionResponse>();
      expect(version).toMatchObject({
        ...address,
        title: "Post slack message, with heartbeats",
        sdk: "Python",
        code: postSlackMessageWithRetry,
        integrations: ["Slack"],
      });
      expect(version.facts.heartbeats).not.toEqual([]);
      expect(
        await env.DOCUMENTS.head(versionDocumentKey(address)),
      ).not.toBeNull();
    });

    test("trims the note, and accepts one of exactly 160 characters", async () => {
      const owner = await newOwner();
      const whatChanged = "a".repeat(whatChangedMaxLength);

      const response = await publishNewVersion(
        owner,
        newVersionBody({ whatChanged: `  ${whatChanged}  ` }),
      );

      expect(response.status).toBe(201);
      expect((await readListing(owner.listing)).versions[0]?.whatChanged).toBe(
        whatChanged,
      );
    });

    test("can start from an older version, and records that version as its base", async () => {
      const owner = await newOwner();
      expect(
        (await publishNewVersion(owner, newVersionBody({ version: "1.1.0" })))
          .status,
      ).toBe(201);

      const response = await publishNewVersion(
        owner,
        newVersionBody({ version: "2.0.0", basedOn: "1.0.0" }),
      );

      expect(response.status).toBe(201);
      const listing = await readListing(owner.listing);
      expect(listing.versions[0]).toMatchObject({
        version: "2.0.0",
        basedOn: "1.0.0",
      });
    });

    test("leaves every earlier version's row, document and version read unchanged", async () => {
      const owner = await newOwner();
      const first = { ...owner.listing, version: "1.0.0" };
      const versionBefore = await (await get(versionPath(first))).text();
      const documentBefore = await env.DOCUMENTS.head(
        versionDocumentKey(first),
      );
      const rowsBefore = (await readAllRows(env.DB))["versions"] ?? [];

      const response = await publishNewVersion(
        owner,
        newVersionBody({
          deprecateBase: { reason: "Replaced by 1.1.0" },
        }),
      );

      expect(response.status).toBe(201);
      expect(await (await get(versionPath(first))).text()).toBe(versionBefore);
      expect((await env.DOCUMENTS.head(versionDocumentKey(first)))?.etag).toBe(
        documentBefore?.etag,
      );
      const rowsAfter = (await readAllRows(env.DB))["versions"] ?? [];
      for (const row of rowsBefore) {
        expect(rowsAfter).toContainEqual(row);
      }
    });

    test("leaves a first publish writing 1.0.0 and creating the listing, with no base or note", async () => {
      const owner = await newOwner();

      const listing = await readListing(owner.listing);

      expect(listing.versions).toEqual([
        expect.objectContaining({
          version: "1.0.0",
          basedOn: null,
          whatChanged: null,
        }) as unknown,
      ]);
    });
  });

  describe("the version number", () => {
    test.each([
      {
        case: "the latest version's number",
        version: "1.0.0",
        status: 409,
        type: publishProblemTypes.versionTaken,
        message: versionTakenMessage("1.0.0"),
      },
      {
        case: "a lower number",
        version: "0.9.0",
        status: 422,
        type: publishProblemTypes.versionNotHigher,
        message: versionNotHigherMessage("1.0.0"),
      },
      {
        case: "a malformed number",
        version: "1.1",
        status: 422,
        type: publishProblemTypes.invalidListing,
        message: undefined,
      },
    ])(
      "refuses $case with $status, and writes nothing",
      async ({ version, status, type, message }) => {
        const owner = await newOwner();
        const before = await snapshot();

        const response = await publishNewVersion(
          owner,
          newVersionBody({ version }),
        );

        const problem = await expectProblem(response, status, { type });
        expect(problem["errors"]).toEqual([
          {
            field: "version",
            message: message ?? (expect.any(String) as string),
          },
        ]);
        expect(await snapshot()).toEqual(before);
      },
    );

    test("refuses a number already used by an earlier version that isn't the latest with 409", async () => {
      const owner = await newOwner();
      expect(
        (await publishNewVersion(owner, newVersionBody({ version: "1.2.0" })))
          .status,
      ).toBe(201);
      const before = await snapshot();

      const response = await publishNewVersion(
        owner,
        newVersionBody({ version: "1.0.0", basedOn: "1.2.0" }),
      );

      await expectProblem(response, 409, {
        type: publishProblemTypes.versionTaken,
      });
      expect(await snapshot()).toEqual(before);
    });

    test("refuses a number between earlier versions but below the latest with 422", async () => {
      const owner = await newOwner();
      expect(
        (await publishNewVersion(owner, newVersionBody({ version: "1.10.0" })))
          .status,
      ).toBe(201);
      const before = await snapshot();

      const response = await publishNewVersion(
        owner,
        newVersionBody({ version: "1.9.0" }),
      );

      await expectProblem(response, 422, {
        type: publishProblemTypes.versionNotHigher,
        errors: [
          { field: "version", message: versionNotHigherMessage("1.10.0") },
        ],
      });
      expect(await snapshot()).toEqual(before);
    });
  });

  describe("the What changed note", () => {
    test("answers 400 for a missing note, and writes nothing", async () => {
      const owner = await newOwner();
      const before = await snapshot();

      const response = await publishNewVersion(
        owner,
        newVersionBody({ whatChanged: undefined }),
      );

      await expectProblem(response, 400, {
        errors: [
          { field: "whatChanged", message: expect.any(String) as string },
        ],
      });
      expect(await snapshot()).toEqual(before);
    });

    test.each([
      {
        case: "an empty note",
        whatChanged: "",
        message: whatChangedEmptyMessage,
      },
      {
        case: "a whitespace-only note",
        whatChanged: "  ",
        message: whatChangedEmptyMessage,
      },
      {
        case: "a 161-character note",
        whatChanged: "a".repeat(whatChangedMaxLength + 1),
        message: whatChangedTooLongMessage,
      },
    ])(
      "answers 422 for $case, and writes nothing",
      async ({ whatChanged, message }) => {
        const owner = await newOwner();
        const before = await snapshot();

        const response = await publishNewVersion(
          owner,
          newVersionBody({ whatChanged }),
        );

        await expectProblem(response, 422, {
          type: publishProblemTypes.invalidListing,
          errors: [{ field: "whatChanged", message }],
        });
        expect(await snapshot()).toEqual(before);
      },
    );
  });

  describe("deprecating the base version", () => {
    test("deprecates the base with the reason and the new version as its replacement", async () => {
      const owner = await newOwner();

      const response = await publishNewVersion(
        owner,
        newVersionBody({ deprecateBase: { reason: " Replaced by 1.1.0 " } }),
      );

      expect(response.status).toBe(201);
      const listing = await readListing(owner.listing);
      expect(listing.versions[1]).toMatchObject({
        version: "1.0.0",
        deprecation: { reason: "Replaced by 1.1.0", replacement: "1.1.0" },
      });
      expect(listing.versions[0]?.deprecation).toBeNull();
    });

    test("deprecates the version started from, not the previous latest", async () => {
      const owner = await newOwner();
      await publishNewVersion(owner, newVersionBody({ version: "1.1.0" }));

      await publishNewVersion(
        owner,
        newVersionBody({
          version: "1.2.0",
          basedOn: "1.0.0",
          deprecateBase: { reason: "Replaced by 1.2.0" },
        }),
      );

      const listing = await readListing(owner.listing);
      expect(
        listing.versions.map(({ version, deprecation }) => ({
          version,
          replacement: deprecation?.replacement ?? null,
        })),
      ).toEqual([
        { version: "1.2.0", replacement: null },
        { version: "1.1.0", replacement: null },
        { version: "1.0.0", replacement: "1.2.0" },
      ]);
    });

    test.each(["", "   "])(
      "publishes and deprecates nothing for the reason %j",
      async (reason) => {
        const owner = await newOwner();
        const before = await snapshot();

        const response = await publishNewVersion(
          owner,
          newVersionBody({ deprecateBase: { reason } }),
        );

        await expectProblem(response, 422, {
          errors: [
            {
              field: "deprecateBase.reason",
              message: deprecationReasonEmptyMessage,
            },
          ],
        });
        expect(await snapshot()).toEqual(before);
      },
    );
  });

  describe("a listing's chips", () => {
    test("stay as they were when a new version publishes", async () => {
      const owner = await newOwner();
      await seedChips(env.DB, { ...owner.listing, chips: ["Stripe", "Saga"] });

      const response = await publishNewVersion(owner, newVersionBody());

      expect(response.status).toBe(201);
      const browse = await get(
        `/api/activities?publisher=${encodeURIComponent(owner.handle)}`,
      );
      expect((await browse.json<BrowseResponse>()).activities).toMatchObject([
        { version: "1.1.0", integrations: ["Stripe", "Saga"] },
      ]);
    });

    test("stay empty when a new version of a listing with none publishes", async () => {
      const owner = await newOwner();

      const response = await publishNewVersion(owner, newVersionBody());

      expect(response.status).toBe(201);
      const browse = await get(
        `/api/activities?publisher=${encodeURIComponent(owner.handle)}`,
      );
      expect((await browse.json<BrowseResponse>()).activities).toMatchObject([
        { version: "1.1.0", integrations: [] },
      ]);
    });
  });

  describe("a removed activity", () => {
    test("returns an activity the publisher removed to search", async () => {
      const owner = await newOwner();
      await seedRemoval(env.DB, { ...owner.listing, removedBy: "publisher" });

      const response = await publishNewVersion(owner, newVersionBody());

      expect(response.status).toBe(201);
      expect((await readListing(owner.listing)).removedBy).toBeNull();
      const browse = await get(
        `/api/activities?publisher=${encodeURIComponent(owner.handle)}`,
      );
      const { activities } = await browse.json<BrowseResponse>();
      expect(activities).toEqual([
        expect.objectContaining({
          ...owner.listing,
          version: "1.1.0",
        }) as unknown,
      ]);
    });

    test.each<RemovalSource>(["account-deletion", "durables"])(
      "publishes but leaves a removal by %s in place",
      async (removedBy) => {
        const owner = await newOwner();
        await seedRemoval(env.DB, { ...owner.listing, removedBy });

        const response = await publishNewVersion(owner, newVersionBody());

        expect(response.status).toBe(201);
        expect(
          (await storage().findListingVersions(owner.listing))?.removedBy,
        ).toBe(removedBy);
      },
    );
  });

  describe("who can publish", () => {
    test("refuses a signed-in publisher who doesn't own the listing with 403, and writes nothing", async () => {
      const owner = await newOwner();
      const other = await seedAccount(env.DB);
      const cookie = await signIn(other.providerAccountId);
      const before = await snapshot();

      const response = await publishNewVersion(
        { cookie, listing: owner.listing },
        newVersionBody(),
      );

      await expectProblem(response, 403);
      expect(await snapshot()).toEqual(before);
    });

    test("refuses a signed-in person with no account with 403", async () => {
      const owner = await newOwner();
      const cookie = await signIn(`nobody-${crypto.randomUUID()}`);

      const response = await publishNewVersion(
        { cookie, listing: owner.listing },
        newVersionBody(),
      );

      await expectProblem(response, 403);
    });

    test("refuses the owner's account while it is pending deletion with 403, and writes nothing", async () => {
      const owner = await newOwner();
      await storage().requestAccountDeletion(owner.accountId);
      const before = await snapshot();

      const response = await publishNewVersion(owner, newVersionBody());

      await expectProblem(response, 403);
      expect(await snapshot()).toEqual(before);
    });

    test("answers 401 with no session", async () => {
      const owner = await newOwner();

      const response = await publishNewVersion(
        { cookie: undefined, listing: owner.listing },
        newVersionBody(),
      );

      await expectProblem(response, 401);
    });

    test("answers 404 for a listing the owner doesn't have", async () => {
      const owner = await newOwner();

      const response = await publishNewVersion(
        {
          cookie: owner.cookie,
          listing: { ...owner.listing, name: "no-such-activity" },
        },
        newVersionBody(),
      );

      await expectProblem(response, 404);
    });

    test("refuses a publish from another site with 403", async () => {
      const owner = await newOwner();

      const response = await publishNewVersion(owner, newVersionBody(), {
        "Sec-Fetch-Site": "cross-site",
      });

      await expectProblem(response, 403);
    });
  });

  describe("the base version", () => {
    test("refuses a base that is a version of another of the owner's listings with 422, and writes nothing", async () => {
      const owner = await newOwner();
      const otherName = `send-email-${crypto.randomUUID().slice(0, 8)}`;
      expect(
        (
          await post("/api/activities", owner.cookie, {
            code: postSlackMessage,
            title: "Send email",
            name: otherName,
            description: "Sends an email.",
            confirmations,
          })
        ).status,
      ).toBe(201);
      await publishNewVersion(
        {
          cookie: owner.cookie,
          listing: { ...owner.listing, name: otherName },
        },
        newVersionBody({ version: "2.0.0" }),
      );
      const before = await snapshot();

      const response = await publishNewVersion(
        owner,
        newVersionBody({ version: "3.0.0", basedOn: "2.0.0" }),
      );

      await expectProblem(response, 422, {
        type: publishProblemTypes.baseNotFound,
        errors: [{ field: "basedOn", message: expect.any(String) as string }],
      });
      expect(await snapshot()).toEqual(before);
    });
  });
});
