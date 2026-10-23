import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import {
  DocumentWriteFailure,
  Storage,
  type Address,
  type VersionDocument,
} from "./storage";
import { versionDocumentKey } from "./version-document";

// Version documents are written to and read from real local R2 (api/CONVENTIONS.md).

const storage = () => new Storage(env.DB, env.DOCUMENTS);

/** A new address for each call, so tests never share a key. */
const newAddress = (): Address => ({
  handle: `h-${crypto.randomUUID().slice(0, 8)}`,
  name: `charge-card-${crypto.randomUUID().slice(0, 8)}`,
  version: "1.0.0",
});

const pythonCode = `import os
import stripe
from temporalio import activity


@activity.defn
async def charge_card(request: ChargeRequest) -> ChargeResult:
    activity.heartbeat()
    stripe.api_key = os.environ["STRIPE_API_KEY"]
    return await stripe.Charge.create_async(amount=request.amount)
`;

const document = (
  overrides: Partial<VersionDocument> = {},
): VersionDocument => ({
  code: pythonCode,
  facts: {
    sdk: "Python",
    activity: { name: "charge_card", line: 7 },
    input: "ChargeRequest",
    output: "ChargeResult",
    runsAs: "async",
    nonRetryableErrors: [],
    configurationRead: [{ name: "STRIPE_API_KEY", line: 9 }],
    dependencies: [{ name: "stripe", line: 2 }],
    heartbeats: [{ line: 8 }],
  },
  integrations: ["Stripe"],
  snippets: [
    { label: "Register", code: "worker = Worker(activities=[charge_card])\n" },
    { label: "Call", code: "await workflow.execute_activity(charge_card)\n" },
  ],
  title: "Charge card",
  description: "Charges a card through Stripe and returns the charge.",
  ...overrides,
});

const storedBytes = async (address: Address): Promise<Uint8Array> => {
  const stored = await env.DOCUMENTS.get(versionDocumentKey(address));
  if (stored === null) {
    throw new Error("Expected a stored document.");
  }
  return new Uint8Array(await stored.arrayBuffer());
};

const utf8 = (text: string) => new TextEncoder().encode(text);

describe("writing a version document", () => {
  test("writes a new key and reads the full document back unchanged", async () => {
    const address = newAddress();
    const written = document();

    expect(await storage().writeVersionDocument(address, written)).toEqual({
      outcome: "created",
    });
    expect(await storage().readVersionDocument(address)).toEqual(written);
  });

  test("reports already-exists on a second write and keeps the first document", async () => {
    const address = newAddress();
    const first = document();
    await storage().writeVersionDocument(address, first);
    const before = await storedBytes(address);

    expect(
      await storage().writeVersionDocument(
        address,
        document({ code: "replaced", title: "Replaced", integrations: [] }),
      ),
    ).toEqual({ outcome: "already-exists" });
    expect(await storage().readVersionDocument(address)).toEqual(first);
    expect(await storedBytes(address)).toEqual(before);
  });

  test("raises a bucket failure as a DocumentWriteFailure, not already-exists", async () => {
    // R2 refuses a key over its 1,024-byte limit, a real failure other than the key existing.
    const address = { ...newAddress(), version: "9".repeat(1100) };

    const failure = await storage()
      .writeVersionDocument(address, document())
      .then(
        (result) => result,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(DocumentWriteFailure);
    expect((failure as DocumentWriteFailure).key).toBe(
      versionDocumentKey(address),
    );
    expect((failure as Error).cause).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain(pythonCode);
  });

  test.each([
    ["non-ASCII characters", "# café, naïve, 日本語, emoji 🚀\nx = 'ü'\n"],
    ["trailing whitespace on lines", "x = 1   \ny = 2\t\n   \n"],
    ["a trailing newline", "x = 1\n"],
    ["several trailing newlines", "x = 1\n\n\n"],
    ["no trailing newline", "x = 1"],
    ["Windows line endings", "x = 1\r\ny = 2\r\n"],
    ["characters JSON escapes", 'say("\\"quoted\\"")\n\u0000\u0008\u001f  '],
    ["a byte-order mark", "﻿x = 1\n"],
  ])("keeps code with %s byte for byte", async (_case, code) => {
    const address = newAddress();
    await storage().writeVersionDocument(address, document({ code }));

    const read = await storage().readVersionDocument(address);

    expect(read?.code).toBe(code);
    expect(utf8(read?.code ?? "")).toEqual(utf8(code));
  });

  test("round-trips empty integrations and snippets lists", async () => {
    const address = newAddress();
    const written = document({ integrations: [], snippets: [] });
    await storage().writeVersionDocument(address, written);

    const read = await storage().readVersionDocument(address);

    expect(read).toEqual(written);
    expect(read?.integrations).toEqual([]);
    expect(read?.snippets).toEqual([]);
  });

  test("keeps addresses that differ by handle, name or version apart", async () => {
    const address = newAddress();
    const others = [
      { ...address, handle: `${address.handle}-x` },
      { ...address, name: `${address.name}-x` },
      { ...address, version: "1.0.1" },
    ];
    await storage().writeVersionDocument(address, document({ title: "Base" }));

    for (const [index, other] of others.entries()) {
      expect(
        await storage().writeVersionDocument(
          other,
          document({ title: `Other ${index}` }),
        ),
      ).toEqual({ outcome: "created" });
      expect((await storage().readVersionDocument(other))?.title).toBe(
        `Other ${index}`,
      );
    }
    expect((await storage().readVersionDocument(address))?.title).toBe("Base");
  });
});

describe("reading a version document", () => {
  test("returns nothing for an address with no document", async () => {
    expect(await storage().readVersionDocument(newAddress())).toBeUndefined();
  });
});
