import { describe, expect, test } from "vitest";
import type { Version, VersionDocument } from "../storage/storage";
import { formatAddress, listingResponse, versionResponse } from "./responses";

const version: Version = {
  handle: "acme",
  name: "charge-card",
  version: "1.0.0",
  title: "Charge card",
  sdk: "Python",
  integrations: ["Stripe"],
  publishedAt: new Date("2026-10-23T12:00:00Z"),
};

const document: VersionDocument = {
  code: "import stripe\n",
  facts: {
    sdk: "Python",
    activity: { name: "charge_card", line: 7 },
    input: "ChargeRequest",
    output: "ChargeResult",
    runsAs: "async",
    nonRetryableErrors: [{ line: 12 }],
    configurationRead: [{ name: "STRIPE_API_KEY", line: 9 }],
    dependencies: [{ name: "stripe", line: 1 }],
    heartbeats: [{ line: 8 }],
  },
  integrations: ["Stripe"],
  snippets: [{ label: "Register", code: "worker = Worker()\n" }],
  title: "Charge card",
  description: "The description as it was when published.",
};

describe("formatting an address", () => {
  test("joins handle, name and version as handle/name@version", () => {
    expect(
      formatAddress({ handle: "acme", name: "charge-card", version: "1.0.0" }),
    ).toBe("acme/charge-card@1.0.0");
  });
});

describe("the version response", () => {
  test("holds the address, title, SDK and detected facts", () => {
    expect(versionResponse(version, document)).toEqual({
      address: "acme/charge-card@1.0.0",
      handle: "acme",
      name: "charge-card",
      version: "1.0.0",
      title: "Charge card",
      sdk: "Python",
      facts: document.facts,
    });
  });

  test("leaves out the description, which can change after publishing", () => {
    expect(versionResponse(version, document)).not.toHaveProperty(
      "description",
    );
  });

  test("leaves out the code and snippets", () => {
    const response = versionResponse(version, document);

    expect(response).not.toHaveProperty("code");
    expect(response).not.toHaveProperty("snippets");
  });
});

describe("the listing response", () => {
  test("holds the handle, name and current description", () => {
    expect(
      listingResponse({
        handle: "acme",
        name: "charge-card",
        description: "Charges a card through Stripe.",
      }),
    ).toEqual({
      handle: "acme",
      name: "charge-card",
      description: "Charges a card through Stripe.",
    });
  });
});
