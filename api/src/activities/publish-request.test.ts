import { describe, expect, test } from "vitest";
import { ProblemError } from "../http/problem";
import { MAX_CODE_BYTES } from "../checks/size-limit";
import { sdks } from "../sdks/sdk-list";
import { publishProblemTypes } from "./publish-problems";
import {
  acceptListing,
  MAX_PUBLISH_BODY_BYTES,
  publishBody,
  type PublishBody,
} from "./publish-request";

const confirmations = {
  rights: true,
  mitZero: true,
  noSecrets: true,
  notMalicious: true,
  noResponsibility: true,
  terms: true,
};

const body = (overrides: Partial<PublishBody> = {}): PublishBody => ({
  code: "from temporalio import activity\n",
  title: "Post slack message",
  name: "post-slack-message",
  description: "Posts a message to a Slack channel.",
  confirmations,
  ...overrides,
});

/** The problem acceptListing throws for a body. */
const refusal = (input: PublishBody) => {
  try {
    acceptListing(input);
  } catch (error) {
    if (error instanceof ProblemError) {
      return error.problem;
    }
    throw error;
  }
  throw new Error("Expected the listing to be refused.");
};

describe("the publish body's shape", () => {
  test("drops detection results, integrations, snippets and a version sent by the client", () => {
    const parsed = publishBody.parse({
      ...body(),
      facts: { sdk: "Go" },
      sdk: "Java",
      integrations: ["Stripe"],
      snippets: [],
      version: "2.0.0",
    });

    expect(parsed).toEqual(body());
  });

  test("requires each of the six confirmations as a boolean", () => {
    const five = Object.fromEntries(
      Object.entries(confirmations).filter(([key]) => key !== "terms"),
    );

    expect(
      publishBody.safeParse({ ...body(), confirmations: five }).success,
    ).toBe(false);
    expect(
      publishBody.safeParse({
        ...body(),
        confirmations: { ...confirmations, terms: "true" },
      }).success,
    ).toBe(false);
  });

  test("accepts a declared SDK from the api's list and refuses one not in it", () => {
    for (const declaredSdk of sdks) {
      expect(publishBody.parse({ ...body(), declaredSdk })).toEqual(
        body({ declaredSdk }),
      );
    }
    expect(
      publishBody.safeParse({ ...body(), declaredSdk: "Kotlin" }).success,
    ).toBe(false);
  });

  test("leaves room in the body for code of the limit escaped six bytes a byte", () => {
    expect(MAX_PUBLISH_BODY_BYTES).toBeGreaterThan(6 * MAX_CODE_BYTES);
  });
});

describe("accepting the listing", () => {
  test("returns the details with the title and description trimmed, and the name untouched", () => {
    expect(
      acceptListing(
        body({ title: "  Post slack message ", description: " Posts. " }),
      ),
    ).toEqual({
      title: "Post slack message",
      name: "post-slack-message",
      description: "Posts.",
    });
  });

  test.each([
    { field: "title", value: "" },
    { field: "title", value: "x".repeat(81) },
    { field: "name", value: "ab" },
    { field: "name", value: "a".repeat(65) },
    { field: "name", value: "Post-slack" },
    { field: "name", value: " post-slack" },
    { field: "description", value: "" },
    { field: "description", value: "x".repeat(161) },
  ])(
    "refuses a $field of $value.length characters with 422",
    ({ field, value }) => {
      const problem = refusal(body({ [field]: value }));

      expect(problem).toMatchObject({
        type: publishProblemTypes.invalidListing,
        status: 422,
      });
      expect(problem.errors).toEqual([
        { field, message: expect.any(String) as string },
      ]);
    },
  );

  test.each([
    { field: "title", value: "x".repeat(80) },
    { field: "name", value: "abc" },
    { field: "name", value: "a".repeat(64) },
    { field: "description", value: "x".repeat(160) },
  ])("accepts a $field at its limit", ({ field, value }) => {
    expect(() => acceptListing(body({ [field]: value }))).not.toThrow();
  });

  test.each(Object.keys(confirmations))(
    "refuses %s false with 422 on that confirmation",
    (key) => {
      const problem = refusal(
        body({ confirmations: { ...confirmations, [key]: false } }),
      );

      expect(problem.status).toBe(422);
      expect(problem.errors).toEqual([
        { field: `confirmations.${key}`, message: "Confirm each item above." },
      ]);
    },
  );

  test("reports every failing detail and confirmation together", () => {
    const problem = refusal(
      body({
        title: "",
        description: "",
        confirmations: { ...confirmations, mitZero: false },
      }),
    );

    expect(problem.errors?.map(({ field }) => field)).toEqual([
      "title",
      "description",
      "confirmations.mitZero",
    ]);
  });
});
