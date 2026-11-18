import {
  compareVersionNumbers,
  deprecationReasonEmptyMessage,
  versionNumberFormatMessage,
  whatChangedEmptyMessage,
  whatChangedMaxLength,
  whatChangedTooLongMessage,
} from "@durables/schemas";
import { describe, expect, test } from "vitest";
import { ProblemError } from "../http/problem";
import {
  acceptNewVersion,
  newVersionBody,
  type NewVersionBody,
} from "./new-version-request";
import { publishProblemTypes } from "./publish-problems";

// The new-version request's shape and the shared rules it applies (packages/schemas listing.ts).

const confirmations = {
  rights: true,
  mitZero: true,
  noSecrets: true,
  notMalicious: true,
  noResponsibility: true,
  terms: true,
};

const body = (overrides: Partial<NewVersionBody> = {}): NewVersionBody => ({
  code: "from temporalio import activity\n",
  title: "Post slack message",
  description: "Posts a message to a Slack channel.",
  version: "1.1.0",
  basedOn: "1.0.0",
  whatChanged: "Retries once on a rate limit.",
  deprecateBase: null,
  confirmations,
  ...overrides,
});

/** The problem acceptNewVersion throws for a body. */
const refusal = (input: NewVersionBody) => {
  try {
    acceptNewVersion(input);
  } catch (error) {
    if (error instanceof ProblemError) {
      return error.problem;
    }
    throw error;
  }
  throw new Error("Expected the new version to be refused.");
};

describe("the new version body's shape", () => {
  test("drops a name, detection results and snippets sent by the client", () => {
    const parsed = newVersionBody.parse({
      ...body(),
      name: "another-name",
      facts: { sdk: "Go" },
      integrations: ["Stripe"],
      snippets: [],
    });

    expect(parsed).toEqual(body());
  });

  test("reads a missing deprecation as none", () => {
    const parsed = newVersionBody.parse({
      ...body(),
      deprecateBase: undefined,
    });

    expect(parsed.deprecateBase).toBeNull();
  });

  test.each(["version", "basedOn", "whatChanged"] as const)(
    "requires %s as a string",
    (field) => {
      const result = newVersionBody.safeParse({
        ...body(),
        [field]: undefined,
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual([field]);
    },
  );

  test("requires a deprecation's reason as a string", () => {
    const result = newVersionBody.safeParse({ ...body(), deprecateBase: {} });

    expect(result.error?.issues[0]?.path).toEqual(["deprecateBase", "reason"]);
  });
});

describe("accepting a new version", () => {
  test("returns the details with the title, description, note and reason trimmed", () => {
    expect(
      acceptNewVersion(
        body({
          title: "  Post slack message ",
          description: " Posts a message. ",
          whatChanged: "  Retries once.  ",
          deprecateBase: { reason: " Replaced by 1.1.0 " },
        }),
      ),
    ).toEqual({
      title: "Post slack message",
      description: "Posts a message.",
      version: "1.1.0",
      whatChanged: "Retries once.",
      deprecateBase: { reason: "Replaced by 1.1.0" },
    });
  });

  test("accepts a note of exactly 160 characters", () => {
    const whatChanged = "a".repeat(whatChangedMaxLength);

    expect(acceptNewVersion(body({ whatChanged })).whatChanged).toBe(
      whatChanged,
    );
  });

  test.each([
    {
      case: "an empty note",
      whatChanged: "",
      message: whatChangedEmptyMessage,
    },
    {
      case: "a whitespace-only note",
      whatChanged: "   ",
      message: whatChangedEmptyMessage,
    },
    {
      case: "a 161-character note",
      whatChanged: "a".repeat(whatChangedMaxLength + 1),
      message: whatChangedTooLongMessage,
    },
  ])(
    "refuses $case with 422 on the whatChanged field",
    ({ whatChanged, message }) => {
      expect(refusal(body({ whatChanged }))).toMatchObject({
        status: 422,
        type: publishProblemTypes.invalidListing,
        errors: [{ field: "whatChanged", message }],
      });
    },
  );

  test.each(["", " ", "   "])(
    "refuses a deprecation of the base with the reason %j",
    (reason) => {
      expect(refusal(body({ deprecateBase: { reason } }))).toMatchObject({
        status: 422,
        errors: [
          {
            field: "deprecateBase.reason",
            message: deprecationReasonEmptyMessage,
          },
        ],
      });
    },
  );

  test.each([
    "",
    "1",
    "1.1",
    "1.1.0.0",
    "v1.1.0",
    "01.1.0",
    "1.1.0 ",
    "1.1.-1",
    "1234567890.0.0",
  ])("refuses the version number %j", (version) => {
    expect(refusal(body({ version }))).toMatchObject({
      status: 422,
      errors: [{ field: "version", message: versionNumberFormatMessage }],
    });
  });

  test.each(["0.0.0", "1.10.0", "123456789.0.1"])(
    "accepts the version number %j",
    (version) => {
      expect(acceptNewVersion(body({ version })).version).toBe(version);
    },
  );

  test("refuses a false confirmation beside its key", () => {
    expect(
      refusal(body({ confirmations: { ...confirmations, terms: false } })),
    ).toMatchObject({
      status: 422,
      errors: [{ field: "confirmations.terms" }],
    });
  });

  test("names every failing field at once", () => {
    const problem = refusal(
      body({ title: "", whatChanged: "", version: "next" }),
    );

    expect(problem.errors).toEqual([
      { field: "title", message: expect.any(String) as string },
      { field: "version", message: versionNumberFormatMessage },
      { field: "whatChanged", message: whatChangedEmptyMessage },
    ]);
  });
});

describe("comparing version numbers", () => {
  test.each([
    { a: "1.1.0", b: "1.0.0", sign: 1 },
    { a: "1.0.0", b: "1.0.0", sign: 0 },
    { a: "0.9.9", b: "1.0.0", sign: -1 },
    { a: "1.10.0", b: "1.9.0", sign: 1 },
    { a: "2.0.0", b: "1.99.99", sign: 1 },
    { a: "1.0.10", b: "1.0.9", sign: 1 },
    { a: "1.2.0", b: "1.10.0", sign: -1 },
  ])("compares $a with $b numerically", ({ a, b, sign }) => {
    expect(Math.sign(compareVersionNumbers(a, b))).toBe(sign);
  });
});
