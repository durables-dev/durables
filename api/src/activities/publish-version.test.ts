import { afterEach, describe, expect, test, vi } from "vitest";
import type {
  CreatePublicationResult,
  NewListing,
  NewPublication,
  VersionDocument,
  WriteVersionDocumentResult,
} from "../storage/storage";
import { type PublishStorage, publishVersion } from "./publish-version";

// The order publishing writes in, and its clean-up (ADR 0005), against an in-memory stand-in for
// the storage interface. Real D1 and R2 are covered by publish.integration.test.ts.

const listing: NewListing = {
  handle: "ada",
  name: "post-slack-message",
  version: "1.0.0",
  title: "Post slack message",
  description: "Posts a message to a Slack channel.",
  sdk: "Python",
  integrations: ["Slack"],
};

const document: VersionDocument = {
  code: "from temporalio import activity\n",
  facts: {
    sdk: "Python",
    activity: { name: "post_slack_message", line: 3 },
    input: null,
    output: null,
    runsAs: "async",
    nonRetryableErrors: [],
    configurationRead: [],
    dependencies: [{ name: "slack_sdk", line: 1 }],
    heartbeats: [],
  },
  integrations: ["Slack"],
  snippets: [],
  title: listing.title,
  description: listing.description,
};

const newAccount = { provider: "github", providerAccountId: "1" } as const;

const context = { requestId: "request-1" };

interface FakeState {
  /** A version row already at the address. */
  versionExists?: boolean;
  /** No version row on the first read, and one on every read after it. */
  versionAppears?: boolean;
  handleAvailable?: boolean;
  /** What each document write answers, in turn. */
  writes?: WriteVersionDocumentResult["outcome"][];
  /** Throws from the document write. */
  writeFails?: boolean;
  publication?: CreatePublicationResult | Error;
  deleteFails?: boolean;
}

/** A storage stand-in that records each call in order. */
const fakeStorage = (state: FakeState = {}) => {
  const calls: string[] = [];
  const writes = [...(state.writes ?? ["created"])];
  let versionReads = 0;
  const storage: PublishStorage = {
    findVersion: () => {
      calls.push("findVersion");
      versionReads += 1;
      const exists =
        state.versionExists === true ||
        (state.versionAppears === true && versionReads > 1);
      return Promise.resolve(
        exists
          ? {
              ...listing,
              integrations: [...listing.integrations],
              publishedAt: new Date(),
            }
          : undefined,
      );
    },
    isHandleAvailable: () => {
      calls.push("isHandleAvailable");
      return Promise.resolve(state.handleAvailable ?? true);
    },
    writeVersionDocument: () => {
      calls.push("writeVersionDocument");
      if (state.writeFails === true) {
        return Promise.reject(new Error("bucket down"));
      }
      return Promise.resolve({ outcome: writes.shift() ?? "created" });
    },
    deleteVersionDocument: () => {
      calls.push("deleteVersionDocument");
      return state.deleteFails === true
        ? Promise.reject(new Error("delete failed"))
        : Promise.resolve();
    },
    createPublication: (publication: NewPublication) => {
      calls.push(
        publication.newAccount === undefined
          ? "createPublication"
          : "createPublication+account",
      );
      const result = state.publication ?? {
        outcome: "created",
        listing: {
          ...listing,
          integrations: [...listing.integrations],
          publishedAt: new Date(0),
        },
        accountCreated: publication.newAccount !== undefined,
      };
      return result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve(result);
    },
  };
  return { storage, calls };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("publishing a version", () => {
  test("writes the document before the rows, and reports the account created", async () => {
    const { storage, calls } = fakeStorage();

    const result = await publishVersion(
      storage,
      { listing, document, newAccount },
      context,
    );

    expect(result).toEqual({ outcome: "published", accountCreated: true });
    expect(calls).toEqual([
      "isHandleAvailable",
      "findVersion",
      "writeVersionDocument",
      "createPublication+account",
    ]);
  });

  test("skips the handle check and creates no account when the account exists", async () => {
    const { storage, calls } = fakeStorage();

    const result = await publishVersion(
      storage,
      { listing, document },
      context,
    );

    expect(result).toEqual({ outcome: "published", accountCreated: false });
    expect(calls).toEqual([
      "findVersion",
      "writeVersionDocument",
      "createPublication",
    ]);
  });

  test("writes nothing when the address is published", async () => {
    const { storage, calls } = fakeStorage({ versionExists: true });

    const result = await publishVersion(
      storage,
      { listing, document, newAccount },
      context,
    );

    expect(result).toEqual({ outcome: "address-taken" });
    expect(calls).toEqual(["isHandleAvailable", "findVersion"]);
  });

  test("writes nothing when the handle is taken before the document is written", async () => {
    const { storage, calls } = fakeStorage({ handleAvailable: false });

    const result = await publishVersion(
      storage,
      { listing, document, newAccount },
      context,
    );

    expect(result).toEqual({ outcome: "handle-taken" });
    expect(calls).toEqual(["isHandleAvailable"]);
  });

  test("answers handle-taken, not address-taken, on a first publish when another account owns the handle and the address", async () => {
    const { storage, calls } = fakeStorage({
      handleAvailable: false,
      versionExists: true,
    });

    const result = await publishVersion(
      storage,
      { listing, document, newAccount },
      context,
    );

    expect(result).toEqual({ outcome: "handle-taken" });
    expect(calls).toEqual(["isHandleAvailable"]);
  });

  test("writes no rows when the document write fails", async () => {
    const { storage, calls } = fakeStorage({ writeFails: true });

    await expect(
      publishVersion(storage, { listing, document }, context),
    ).rejects.toThrow("bucket down");
    expect(calls).toEqual(["findVersion", "writeVersionDocument"]);
  });

  test("deletes the document and raises the error when the database step fails", async () => {
    const { storage, calls } = fakeStorage({
      publication: new Error("D1 down"),
    });

    await expect(
      publishVersion(storage, { listing, document }, context),
    ).rejects.toThrow("D1 down");
    expect(calls).toEqual([
      "findVersion",
      "writeVersionDocument",
      "createPublication",
      "deleteVersionDocument",
    ]);
  });

  test.each([
    { outcome: "address-taken" as const },
    { outcome: "handle-taken" as const },
  ])(
    "deletes the document when the rows are refused as $outcome",
    async (refused) => {
      const { storage, calls } = fakeStorage({ publication: refused });

      const result = await publishVersion(
        storage,
        { listing, document, newAccount },
        context,
      );

      expect(result).toEqual(refused);
      expect(calls.at(-1)).toBe("deleteVersionDocument");
    },
  );

  test("leaves the document in place when the rows are refused as address-taken and a version row now exists", async () => {
    const { storage, calls } = fakeStorage({
      versionAppears: true,
      publication: { outcome: "address-taken" },
    });

    const result = await publishVersion(
      storage,
      { listing, document },
      context,
    );

    expect(result).toEqual({ outcome: "address-taken" });
    expect(calls).toEqual([
      "findVersion",
      "writeVersionDocument",
      "createPublication",
      "findVersion",
    ]);
    expect(calls).not.toContain("deleteVersionDocument");
  });

  test("leaves the document in place when the rows are refused as handle-taken and a version row now exists", async () => {
    const { storage, calls } = fakeStorage({
      versionAppears: true,
      publication: { outcome: "handle-taken" },
    });

    const result = await publishVersion(
      storage,
      { listing, document, newAccount },
      context,
    );

    expect(result).toEqual({ outcome: "handle-taken" });
    expect(calls).toEqual([
      "isHandleAvailable",
      "findVersion",
      "writeVersionDocument",
      "createPublication+account",
      "findVersion",
    ]);
    expect(calls).not.toContain("deleteVersionDocument");
  });

  test("raises the database error, not the clean-up's, and logs the failed clean-up without the code", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { storage } = fakeStorage({
      publication: new Error("D1 down"),
      deleteFails: true,
    });

    await expect(
      publishVersion(storage, { listing, document }, context),
    ).rejects.toThrow("D1 down");
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "request-1" }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(document.code);
  });

  test("replaces an orphaned document that has no version row", async () => {
    const { storage, calls } = fakeStorage({
      writes: ["already-exists", "created"],
    });

    const result = await publishVersion(
      storage,
      { listing, document },
      context,
    );

    expect(result).toMatchObject({ outcome: "published" });
    expect(calls).toEqual([
      "findVersion",
      "writeVersionDocument",
      "findVersion",
      "deleteVersionDocument",
      "writeVersionDocument",
      "createPublication",
    ]);
  });

  test("reports address-taken and deletes nothing when the document's row appeared meanwhile", async () => {
    const { storage, calls } = fakeStorage({
      versionAppears: true,
      writes: ["already-exists"],
    });

    const result = await publishVersion(
      storage,
      { listing, document },
      context,
    );

    expect(result).toEqual({ outcome: "address-taken" });
    expect(calls).toEqual([
      "findVersion",
      "writeVersionDocument",
      "findVersion",
    ]);
  });
});
