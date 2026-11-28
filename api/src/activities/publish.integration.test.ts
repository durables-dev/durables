import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, test, vi } from "vitest";
import { integrationsFor } from "../checks/integrations";
import { checkCode } from "../checks/pipeline";
import { refusalTypes } from "../checks/refusals";
import { MAX_CODE_BYTES } from "../checks/size-limit";
import { registeredSdks } from "../sdks/registry";
import { generateSnippets } from "../snippets/snippets";
import {
  readAllRows,
  seedAccount,
  seedListing,
  seedRetiredHandle,
  seedVersion,
} from "../storage/seed";
import {
  Storage,
  type Address,
  type Sdk,
  type VersionDocument,
} from "../storage/storage";
import { versionDocumentKey } from "../storage/version-document";
import { publishProblemTypes } from "./publish-problems";
import type {
  ListingResponse,
  PublishResponse,
  VersionResponse,
} from "./responses";

// Publishing over HTTP against the real Worker, with real local D1 and R2 (api/CONVENTIONS.md).
// Each test signs in as a new publisher, so rate limits and addresses never collide.

const problemContentType = "application/problem+json";

const storage = () => new Storage(env.DB, env.DOCUMENTS);

const lines = (...code: string[]) => code.join("\n");

/** A Python activity importing slack_sdk, which implies the Slack integration. */
const postSlackMessage = lines(
  "import os",
  "",
  "from slack_sdk import WebClient",
  "from temporalio import activity",
  "from temporalio.exceptions import ApplicationError",
  "",
  "",
  "@activity.defn",
  "async def post_slack_message(channel: str) -> str:",
  "    activity.heartbeat()",
  "    if not channel:",
  '        raise ApplicationError("No channel", non_retryable=True)',
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

type Confirmations = typeof confirmations;

/** A valid publish body with a name no other test uses. */
const publishBody = (overrides: Record<string, unknown> = {}) => ({
  code: postSlackMessage,
  title: "Post slack message",
  name: `post-slack-message-${crypto.randomUUID().slice(0, 8)}`,
  description: "Posts a message to a Slack channel.",
  confirmations,
  ...overrides,
});

const cookieFrom = (response: Response) =>
  (response.headers.get("Set-Cookie") ?? "").split(";")[0] ?? "";

/** Signs in through the local fake provider, and returns the cookie. */
const signIn = async (
  providerAccountId = `publisher-${crypto.randomUUID()}`,
): Promise<string> => {
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

/** A handle no other test uses. */
const newHandle = () => `ada-${crypto.randomUUID().slice(0, 8)}`;

/** Saves a chosen handle to the session, and returns the reissued cookie. */
const chooseHandle = async (cookie: string, handle: string) => {
  const response = await exports.default.fetch(
    "http://localhost/api/session/handle",
    {
      method: "PUT",
      headers: {
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ handle }),
    },
  );
  expect(response.status).toBe(200);
  return cookieFrom(response);
};

/** A new publisher, signed in with a handle chosen. */
const newPublisher = async (
  providerAccountId = `publisher-${crypto.randomUUID()}`,
) => {
  const handle = newHandle();
  const cookie = await chooseHandle(await signIn(providerAccountId), handle);
  return { cookie, handle, providerAccountId };
};

/** Posts a publish to the real Worker, as e2e does with Playwright's request fixture. */
const publish = (
  cookie: string | undefined,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  exports.default.fetch("http://localhost/api/activities", {
    method: "POST",
    headers: {
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
      ...(cookie === undefined ? {} : { Cookie: cookie }),
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const get = (path: string) => exports.default.fetch(`http://localhost${path}`);

const addressOf = (handle: string, name: string): Address => ({
  handle,
  name,
  version: "1.0.0",
});

/** The facts, integrations and snippets an independent run of the same steps gives. */
const expectedDocument = (
  code: string,
  address: Address,
  declared?: Sdk,
): Pick<VersionDocument, "facts" | "integrations" | "snippets"> => {
  const facts = checkCode(code, registeredSdks, declared);
  return {
    facts,
    integrations: integrationsFor(facts.sdk, facts.dependencies),
    snippets: generateSnippets(facts, address),
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/activities", () => {
  describe("a publish that succeeds", () => {
    test("answers 201 with the version's location and the account created, and the listing reads back", async () => {
      const { cookie, handle } = await newPublisher();
      const body = publishBody();

      const response = await publish(cookie, body);

      expect(response.status).toBe(201);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      const location = `/api/activities/${handle}/${body.name}/versions/1.0.0`;
      expect(response.headers.get("Location")).toBe(location);
      expect(await response.json<PublishResponse>()).toEqual({
        address: `${handle}/${body.name}@1.0.0`,
        handle,
        name: body.name,
        version: "1.0.0",
        location,
        accountCreated: true,
      });

      const version = await get(location);
      expect(version.status).toBe(200);
      const address = { handle, name: body.name, version: "1.0.0" };
      const facts = checkCode(postSlackMessage, registeredSdks);
      const row = await storage().findVersion(address);
      expect(await version.json<VersionResponse>()).toEqual({
        address: `${handle}/${body.name}@1.0.0`,
        handle,
        name: body.name,
        version: "1.0.0",
        title: "Post slack message",
        sdk: "Python",
        facts,
        code: postSlackMessage,
        activityFileName: "activities.py",
        snippets: generateSnippets(facts, address),
        integrations: integrationsFor(facts.sdk, facts.dependencies),
        publishedAt: row?.publishedAt.toISOString(),
      });
      const listing = await get(`/api/activities/${handle}/${body.name}`);
      expect(listing.status).toBe(200);
      expect(await listing.json<ListingResponse>()).toEqual({
        handle,
        name: body.name,
        removedBy: null,
        versions: [
          {
            version: "1.0.0",
            publishedAt: row?.publishedAt.toISOString(),
            whatChanged: null,
            basedOn: null,
            deprecation: null,
            description: "Posts a message to a Slack channel.",
          },
        ],
      });
    });

    test("creates the account, provider link and handle on the first publish only", async () => {
      const { cookie, handle, providerAccountId } = await newPublisher();
      const identity = { provider: "github" as const, providerAccountId };
      expect(
        await storage().findAccountByProviderIdentity(identity),
      ).toBeUndefined();

      const first = await publish(cookie, publishBody());

      expect(first.status).toBe(201);
      expect(await first.json<PublishResponse>()).toMatchObject({
        accountCreated: true,
      });
      expect(await storage().findAccountByProviderIdentity(identity)).toEqual({
        id: expect.any(String) as string,
        handle,
      });
      expect(await storage().isHandleAvailable(handle)).toBe(false);
      const session = await exports.default.fetch(
        "http://localhost/api/session",
        { headers: { Cookie: cookie } },
      );
      expect(await session.json()).toMatchObject({
        user: { handle, accountExists: true },
      });

      const second = await publish(cookie, publishBody());

      expect(second.status).toBe(201);
      expect(await second.json<PublishResponse>()).toMatchObject({
        handle,
        accountCreated: false,
      });
    });

    test("publishes under the account's handle in a later session that has none chosen", async () => {
      const { cookie, handle, providerAccountId } = await newPublisher();
      expect((await publish(cookie, publishBody())).status).toBe(201);
      const later = await signIn(providerAccountId);

      const response = await publish(later, publishBody());

      expect(response.status).toBe(201);
      expect(await response.json<PublishResponse>()).toMatchObject({
        handle,
        accountCreated: false,
      });
    });

    test("stores a Go activity with its facts, its Stripe integration and Go snippets", async () => {
      const { cookie, handle } = await newPublisher();
      const code = [
        "package payments",
        "",
        "import (",
        '    "context"',
        '    "fmt"',
        "",
        '    "github.com/stripe/stripe-go/v87"',
        ")",
        "",
        "func ChargeCard(ctx context.Context, input ChargeRequest) (*ChargeResult, error) {",
        '    return nil, fmt.Errorf("not yet: %v", stripe.Key)',
        "}",
        "",
      ].join("\n");
      const body = publishBody({ code });

      const response = await publish(cookie, body);

      expect(response.status).toBe(201);
      const address = addressOf(handle, body.name);
      const stored = await storage().readVersionDocument(address);
      expect(stored?.facts).toMatchObject({
        sdk: "Go",
        activity: { name: "ChargeCard", line: 10 },
        dependencies: [{ name: "github.com/stripe/stripe-go/v87", line: 7 }],
        provenance: { sdk: "inferred" },
      });
      expect(stored?.integrations).toEqual(["Stripe"]);
      expect(stored?.snippets.map(({ label }) => label)).toEqual([
        "Install",
        "workflow.go",
        "worker/main.go",
        "start/main.go",
        "Run",
      ]);
      expect(await storage().findListing(address)).toMatchObject({
        sdk: "Go",
      });
    });

    test("stores the code exactly as pasted, with the trimmed details and the re-run's facts, integrations and snippets", async () => {
      const { cookie, handle } = await newPublisher();
      const code = `${postSlackMessage.replaceAll("\n", "\r\n")}  \r\n`;
      const body = publishBody({
        code,
        title: "  Post slack message  ",
        description: "  Posts a message to a Slack channel.  ",
      });

      const response = await publish(cookie, body);

      expect(response.status).toBe(201);
      const address = addressOf(handle, body.name);
      const stored = await storage().readVersionDocument(address);
      expect(stored).toEqual({
        code,
        ...expectedDocument(code, address),
        title: "Post slack message",
        description: "Posts a message to a Slack channel.",
      });
      expect(stored?.integrations).toEqual(["Slack"]);
      expect(stored?.snippets.length).toBeGreaterThan(0);
      expect(await storage().findListing(address)).toMatchObject({
        title: "Post slack message",
        description: "Posts a message to a Slack channel.",
        sdk: "Python",
      });
    });

    test("stores a PHP version with its facts, its Stripe integration and its six snippets", async () => {
      const { cookie, handle } = await newPublisher();
      const code = [
        "<?php",
        "use Stripe\\StripeClient;",
        "use Temporal\\Activity\\ActivityInterface;",
        "",
        "#[ActivityInterface]",
        "class Payments",
        "{",
        "    public function chargeCard(ChargeRequest $request): ChargeResult",
        "    {",
        "        return (new StripeClient(getenv('STRIPE_API_KEY')))->charge($request);",
        "    }",
        "}",
      ].join("\n");
      const body = publishBody({ code, title: "Charge card" });

      const response = await publish(cookie, body);

      expect(response.status).toBe(201);
      const address = addressOf(handle, body.name);
      const stored = await storage().readVersionDocument(address);
      expect(stored).toMatchObject(expectedDocument(code, address));
      expect(stored?.facts.sdk).toBe("PHP");
      expect(stored?.integrations).toEqual(["Stripe"]);
      expect(stored?.snippets.map(({ label }) => label)).toEqual([
        "Install",
        "ChargeCardWorkflow.php",
        "worker.php",
        "starter.php",
        "Run",
        ".rr.yaml",
      ]);
      expect(await storage().findListing(address)).toMatchObject({
        sdk: "PHP",
      });
    });

    test("publishes a Java activity with its facts, integrations and Java snippets", async () => {
      const { cookie, handle } = await newPublisher();
      const code = lines(
        "import com.stripe.Stripe;",
        "import io.temporal.activity.ActivityInterface;",
        "",
        "@ActivityInterface",
        "public interface Payments {",
        "    ChargeResult chargeCard(ChargeRequest request);",
        "}",
        "",
      );
      const body = publishBody({ code });

      const response = await publish(cookie, body);

      expect(response.status).toBe(201);
      const address = addressOf(handle, body.name);
      const stored = await storage().readVersionDocument(address);
      expect(stored).toMatchObject(expectedDocument(code, address));
      expect(stored?.facts.sdk).toBe("Java");
      expect(stored?.integrations).toEqual(["Stripe"]);
      expect(stored?.snippets.map(({ label }) => label)).toEqual([
        "Install",
        "ChargeCardWorkflow.java",
        "ChargeCardWorker.java",
        "Starter.java",
        "Run",
      ]);
      expect(await storage().findListing(address)).toMatchObject({
        sdk: "Java",
      });
    });

    test("ignores detection results, integrations, snippets and a version sent by the client", async () => {
      const { cookie, handle } = await newPublisher();
      const body = publishBody({
        facts: { sdk: "Go", activity: { name: "forged", line: 1 } },
        sdk: ".NET",
        activity: { name: "forged", line: 1 },
        dependencies: [{ name: "stripe", line: 1 }],
        integrations: ["Stripe", "Postgres"],
        snippets: [{ label: "Forged", code: "rm -rf /" }],
        version: "2.0.0",
      });

      const response = await publish(cookie, body);

      expect(response.status).toBe(201);
      expect(await response.json<PublishResponse>()).toMatchObject({
        version: "1.0.0",
      });
      const address = addressOf(handle, body.name);
      expect(await storage().readVersionDocument(address)).toMatchObject(
        expectedDocument(postSlackMessage, address),
      );
      expect(await storage().findListing(address)).toMatchObject({
        sdk: "Python",
      });
      expect(
        await storage().findVersion({ ...address, version: "2.0.0" }),
      ).toBeUndefined();
    });

    test("replaces an orphaned document that has no rows", async () => {
      const { cookie, handle } = await newPublisher();
      const body = publishBody();
      const address = addressOf(handle, body.name);
      await storage().writeVersionDocument(address, {
        code: "orphan",
        ...expectedDocument(postSlackMessage, address),
        title: "Orphan",
        description: "Left by a failed publish.",
      });

      const response = await publish(cookie, body);

      expect(response.status).toBe(201);
      expect(await storage().readVersionDocument(address)).toMatchObject({
        code: postSlackMessage,
        title: "Post slack message",
      });
    });

    test("gives the new listing no chips, and writes the detected integrations to the document only", async () => {
      const { cookie, handle } = await newPublisher();
      const body = publishBody();

      const response = await publish(cookie, body);

      expect(response.status).toBe(201);
      const address = addressOf(handle, body.name);
      const listingRow = await env.DB.prepare(
        "select chips from listings where handle = ? and name = ?",
      )
        .bind(handle, body.name)
        .first<{ chips: string }>();
      expect(listingRow?.chips).toBe("[]");
      const versionRow = await env.DB.prepare(
        "select * from versions where handle = ? and name = ?",
      )
        .bind(handle, body.name)
        .first();
      expect(versionRow).not.toBeNull();
      expect(versionRow).not.toHaveProperty("integrations");
      expect(
        (await storage().readVersionDocument(address))?.integrations,
      ).toEqual(["Slack"]);
    });
  });

  describe("a declared SDK", () => {
    test("re-runs the declared SDK's detector and stores the SDK as declared", async () => {
      const { cookie, handle } = await newPublisher();
      const body = publishBody({ declaredSdk: "Python" });

      const response = await publish(cookie, body);

      expect(response.status).toBe(201);
      const address = addressOf(handle, body.name);
      const stored = await storage().readVersionDocument(address);
      expect(stored).toMatchObject(
        expectedDocument(postSlackMessage, address, "Python"),
      );
      expect(stored?.facts.sdk).toBe("Python");
      expect(stored?.facts.provenance?.sdk).toBe("declared");
      expect(stored?.facts.provenance?.activity).toBe("detected");
      expect(await storage().findListing(address)).toMatchObject({
        sdk: "Python",
      });
    });

    test("stores the SDK as detected when none is declared", async () => {
      const { cookie, handle } = await newPublisher();
      const body = publishBody();

      expect((await publish(cookie, body)).status).toBe(201);

      const stored = await storage().readVersionDocument(
        addressOf(handle, body.name),
      );
      expect(stored?.facts.provenance).toEqual({
        sdk: "detected",
        activity: "detected",
        inputOutput: "detected",
        runsAs: "detected",
        nonRetryableErrors: "detected",
        configurationRead: "detected",
        dependencies: "detected",
        heartbeats: "detected",
      });
    });

    test("answers 422 no activity when the declared detector finds none, and writes nothing", async () => {
      const { cookie } = await newPublisher();
      const before = await snapshot();

      const response = await publish(
        cookie,
        publishBody({ declaredSdk: "TypeScript" }),
      );

      await expectProblem(response, 422, {
        type: refusalTypes.noActivity,
        sdk: "TypeScript",
      });
      expect(await snapshot()).toEqual(before);
    });

    test("answers 400 for a declared SDK not in the list, and writes nothing", async () => {
      const { cookie } = await newPublisher();
      const before = await snapshot();

      const response = await publish(
        cookie,
        publishBody({ declaredSdk: "Kotlin" }),
      );

      const problem = await expectProblem(response, 400);
      expect(problem["errors"]).toEqual([
        { field: "declaredSdk", message: expect.any(String) as string },
      ]);
      expect(await snapshot()).toEqual(before);
    });

    test("ignores facts and provenance sent by the client with a declared SDK", async () => {
      const { cookie, handle } = await newPublisher();
      const body = publishBody({
        declaredSdk: "Python",
        facts: {
          sdk: "Python",
          activity: { name: "forged", line: 1 },
          provenance: { sdk: "detected" },
        },
        provenance: { sdk: "detected", activity: "declared" },
      });

      expect((await publish(cookie, body)).status).toBe(201);

      const address = addressOf(handle, body.name);
      expect(await storage().readVersionDocument(address)).toMatchObject(
        expectedDocument(postSlackMessage, address, "Python"),
      );
    });
  });

  describe("an address already published", () => {
    test("answers 409 address-taken and leaves the first version unchanged", async () => {
      const { cookie, handle } = await newPublisher();
      const body = publishBody();
      expect((await publish(cookie, body)).status).toBe(201);
      const address = addressOf(handle, body.name);
      const document = await storage().readVersionDocument(address);
      const listing = await storage().findListing(address);
      const before = await snapshot();

      const response = await publish(cookie, {
        ...body,
        title: "Another title",
        description: "Another description.",
        code: postSlackMessage.replace("post_slack_message", "send_message"),
      });

      await expectProblem(response, 409, {
        type: publishProblemTypes.addressTaken,
        errors: [{ field: "name", message: expect.any(String) as string }],
      });
      expect(await storage().readVersionDocument(address)).toEqual(document);
      expect(await storage().findListing(address)).toEqual(listing);
      expect(await snapshot()).toEqual(before);
    });
  });

  describe("a handle taken since it was chosen", () => {
    test("answers 409 handle-taken naming the handle, and writes nothing", async () => {
      const { cookie, handle, providerAccountId } = await newPublisher();
      await seedAccount(env.DB, { handle });
      const before = await snapshot();

      const response = await publish(cookie, publishBody());

      await expectProblem(response, 409, {
        type: publishProblemTypes.handleTaken,
        handle,
        errors: [{ field: "handle", message: `${handle} is taken.` }],
      });
      expect(await snapshot()).toEqual(before);
      expect(
        await storage().findAccountByProviderIdentity({
          provider: "github",
          providerAccountId,
        }),
      ).toBeUndefined();
    });

    test("answers 409 handle-taken, not address-taken, when the handle's owner has published the same name", async () => {
      const { cookie, handle } = await newPublisher();
      await seedAccount(env.DB, { handle });
      const body = publishBody();
      await seedListing(env.DB, { handle, name: body.name });
      await seedVersion(env.DB, {
        handle,
        name: body.name,
        version: "1.0.0",
        title: "Owner's activity",
        sdk: "Python",
      });
      const before = await snapshot();

      const response = await publish(cookie, body);

      await expectProblem(response, 409, {
        type: publishProblemTypes.handleTaken,
        handle,
        errors: [{ field: "handle", message: `${handle} is taken.` }],
      });
      expect(await snapshot()).toEqual(before);
    });

    test("answers 409 handle-taken for a handle retired since it was chosen", async () => {
      const { cookie, handle } = await newPublisher();
      await seedRetiredHandle(env.DB, handle);
      const before = await snapshot();

      const response = await publish(cookie, publishBody());

      await expectProblem(response, 409, {
        type: publishProblemTypes.handleTaken,
        handle,
      });
      expect(await snapshot()).toEqual(before);
    });
  });

  describe("the code size limit", () => {
    /** The sample padded with a trailing comment to exactly `bytes` bytes of UTF-8. */
    const paddedCode = (bytes: number) => {
      const base = `${postSlackMessage}# `;
      const code = base + "x".repeat(bytes - base.length);
      expect(new TextEncoder().encode(code).byteLength).toBe(bytes);
      return code;
    };

    test("publishes code of exactly the limit", async () => {
      const { cookie } = await newPublisher();

      const response = await publish(
        cookie,
        publishBody({ code: paddedCode(MAX_CODE_BYTES) }),
      );

      expect(response.status).toBe(201);
    });

    test("publishes code at the limit that JSON escapes to several times its size", async () => {
      const { cookie } = await newPublisher();
      const base = `${postSlackMessage}# `;
      // Each control character is escaped as six bytes: \u0001.
      const code = base + "\u0001".repeat(MAX_CODE_BYTES - base.length);

      const response = await publish(cookie, publishBody({ code }));

      expect(response.status).toBe(201);
    });

    test("answers 413 code-too-large for code one byte over the limit, and writes nothing", async () => {
      const { cookie } = await newPublisher();
      const before = await snapshot();

      const response = await publish(
        cookie,
        publishBody({ code: paddedCode(MAX_CODE_BYTES + 1) }),
      );

      await expectProblem(response, 413, {
        type: refusalTypes.codeTooLarge,
        limitBytes: MAX_CODE_BYTES,
      });
      expect(await snapshot()).toEqual(before);
    });

    test("answers 413 for a body far over the limit, before reading it", async () => {
      const { cookie } = await newPublisher();

      const response = await publish(
        cookie,
        publishBody({ code: "x".repeat(8 * MAX_CODE_BYTES) }),
      );

      await expectProblem(response, 413, { type: refusalTypes.codeTooLarge });
    });
  });

  describe("details and confirmations", () => {
    test.each([
      { field: "title", value: "", case: "an empty title" },
      { field: "title", value: "   ", case: "a title of only spaces" },
      { field: "title", value: "x".repeat(81), case: "a title over 80" },
      { field: "name", value: "", case: "an empty name" },
      { field: "name", value: "ab", case: "a name under 3" },
      { field: "name", value: "a".repeat(65), case: "a name over 64" },
      { field: "name", value: "Post-Slack", case: "an uppercase name" },
      { field: "name", value: "post--slack", case: "a double hyphen" },
      { field: "name", value: "-post-slack", case: "a leading hyphen" },
      { field: "name", value: "post-slack-", case: "a trailing hyphen" },
      { field: "name", value: "post_slack", case: "an underscore" },
      { field: "description", value: "", case: "an empty description" },
      {
        field: "description",
        value: "x".repeat(161),
        case: "a description over 160",
      },
    ])(
      "answers 422 with a field error for $case, and writes nothing",
      async ({ field, value }) => {
        const { cookie } = await newPublisher();
        const before = await snapshot();

        const response = await publish(cookie, publishBody({ [field]: value }));

        const body = await expectProblem(response, 422, {
          type: publishProblemTypes.invalidListing,
        });
        expect(body["errors"]).toEqual([
          { field, message: expect.any(String) as string },
        ]);
        expect(await snapshot()).toEqual(before);
      },
    );

    test.each(Object.keys(confirmations) as (keyof Confirmations)[])(
      "answers 422 with a field error when %s is false, and writes nothing",
      async (key) => {
        const { cookie } = await newPublisher();
        const before = await snapshot();

        const response = await publish(
          cookie,
          publishBody({ confirmations: { ...confirmations, [key]: false } }),
        );

        const body = await expectProblem(response, 422, {
          type: publishProblemTypes.invalidListing,
        });
        expect(body["errors"]).toEqual([
          {
            field: `confirmations.${key}`,
            message: "Confirm each item above.",
          },
        ]);
        expect(await snapshot()).toEqual(before);
      },
    );

    test("lists every failing detail and confirmation at once", async () => {
      const { cookie } = await newPublisher();

      const response = await publish(
        cookie,
        publishBody({
          title: "",
          name: "X",
          confirmations: { ...confirmations, terms: false, rights: false },
        }),
      );

      const body = await expectProblem(response, 422);
      expect(body["errors"]).toEqual([
        { field: "title", message: "Enter a title." },
        { field: "name", message: expect.any(String) as string },
        { field: "confirmations.rights", message: "Confirm each item above." },
        { field: "confirmations.terms", message: "Confirm each item above." },
      ]);
    });
  });

  describe("code the checks refuse", () => {
    test.each([
      {
        refusal: "code no SDK is identified in",
        code: "print('hello')\n",
        type: refusalTypes.sdkChoiceNeeded,
      },
      {
        refusal: "empty code",
        code: "   \n",
        type: refusalTypes.notTemporalActivity,
      },
      {
        refusal: "more than one activity",
        code: lines(
          "from temporalio import activity",
          "",
          "@activity.defn",
          "async def first(input: In) -> Out:",
          "    return Out()",
          "",
          "@activity.defn",
          "async def second(input: In) -> Out:",
          "    return Out()",
          "",
        ),
        type: refusalTypes.multipleActivities,
      },
    ])(
      "answers 422 for $refusal, and writes nothing",
      async ({ code, type }) => {
        const { cookie } = await newPublisher();
        const before = await snapshot();

        const response = await publish(cookie, publishBody({ code }));

        await expectProblem(response, 422, { type });
        expect(await snapshot()).toEqual(before);
      },
    );
  });

  describe("the rate limit", () => {
    test("answers 429 on a publisher's 11th publish in a minute, and not another publisher's first", async () => {
      const { cookie } = await newPublisher();
      // Refused publishes count too, so nothing has to be written to use up the limit.
      for (let i = 0; i < 10; i++) {
        const response = await publish(cookie, publishBody({ title: "" }));
        expect(response.status).toBe(422);
      }

      const refused = await publish(cookie, publishBody());

      await expectProblem(refused, 429, {
        type: publishProblemTypes.publishLimited,
      });
      // Every test request comes from the same address, so this also shows the key isn't the IP.
      const other = await newPublisher();
      expect((await publish(other.cookie, publishBody())).status).toBe(201);
    });
  });

  describe("the session", () => {
    test("answers 401 with no session, and writes nothing", async () => {
      const before = await snapshot();

      const response = await publish(undefined, publishBody());

      await expectProblem(response, 401);
      expect(await snapshot()).toEqual(before);
    });

    test("answers 401 for a tampered session cookie", async () => {
      const { cookie } = await newPublisher();

      const response = await publish(`${cookie}x`, publishBody());

      await expectProblem(response, 401);
    });

    test("answers 403 handle-not-chosen for a session with no handle and no account, and writes nothing", async () => {
      const cookie = await signIn();
      const before = await snapshot();

      const response = await publish(cookie, publishBody());

      await expectProblem(response, 403, {
        type: publishProblemTypes.handleNotChosen,
      });
      expect(await snapshot()).toEqual(before);
    });
  });

  describe("a failure after the document is written", () => {
    test("deletes the document, leaves no listing visible, and answers 409", async () => {
      // A listing row with no version is never left by publishing. It passes the address
      // check, then makes the database step fail after the document is written.
      const { cookie, handle } = await newPublisher();
      expect((await publish(cookie, publishBody())).status).toBe(201);
      const body = publishBody();
      await seedListing(env.DB, { handle, name: body.name });
      const address = addressOf(handle, body.name);
      const before = await snapshot();

      const response = await publish(cookie, body);

      await expectProblem(response, 409, {
        type: publishProblemTypes.addressTaken,
      });
      expect(await env.DOCUMENTS.head(versionDocumentKey(address))).toBeNull();
      expect(await snapshot()).toEqual(before);
      expect(
        (await get(`/api/activities/${handle}/${body.name}/versions/1.0.0`))
          .status,
      ).toBe(404);
    });
  });

  describe("validation", () => {
    test.each([
      { case: "a missing code", body: publishBody({ code: undefined }) },
      { case: "a code that isn't a string", body: publishBody({ code: 42 }) },
      { case: "a missing title", body: publishBody({ title: undefined }) },
      {
        case: "missing confirmations",
        body: publishBody({ confirmations: undefined }),
      },
      {
        case: "a confirmation that isn't a boolean",
        body: publishBody({
          confirmations: { ...confirmations, terms: "yes" },
        }),
      },
      {
        case: "a missing confirmation",
        body: publishBody({
          confirmations: { ...confirmations, terms: undefined },
        }),
      },
    ])("answers 400 with field errors for $case", async ({ body }) => {
      const { cookie } = await newPublisher();

      const response = await publish(cookie, body);

      const problem = await expectProblem(response, 400);
      expect(problem["errors"]).toEqual([
        {
          field: expect.any(String) as string,
          message: expect.any(String) as string,
        },
      ]);
    });

    test("answers 400 Problem Details for a body that isn't JSON", async () => {
      const { cookie } = await newPublisher();

      await expectProblem(await publish(cookie, "{ not json"), 400);
    });
  });

  describe("the origin check", () => {
    test("refuses a publish from another site with 403, and writes nothing", async () => {
      const { cookie } = await newPublisher();
      const before = await snapshot();

      const response = await publish(cookie, publishBody(), {
        "Sec-Fetch-Site": "cross-site",
      });

      await expectProblem(response, 403);
      expect(await snapshot()).toEqual(before);
    });
  });

  describe("logging", () => {
    test("logs no code when a publish is refused or succeeds", async () => {
      const spies = (["log", "info", "warn", "error", "debug"] as const).map(
        (level) => vi.spyOn(console, level).mockImplementation(() => undefined),
      );
      const { cookie } = await newPublisher();
      const marker = `marker_${crypto.randomUUID().replaceAll("-", "")}`;
      const code = `${postSlackMessage}# ${marker}\n`;

      await publish(cookie, publishBody({ code }));
      await publish(cookie, publishBody({ code, title: "" }));

      expect(JSON.stringify(spies.map((spy) => spy.mock.calls))).not.toContain(
        marker,
      );
    });
  });
});
