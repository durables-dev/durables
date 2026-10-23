import {
  listingDescriptionEmptyMessage,
  listingDescriptionTooLongMessage,
  listingDetailsSchema,
  listingNameEmptyMessage,
  listingNameFormatMessage,
  listingTitleEmptyMessage,
  listingTitleTooLongMessage,
  publishConfirmationKeys,
  publishConfirmationMessage,
  publishConfirmationsSchema,
  type ListingDetails,
  type PublishConfirmations,
} from "@durables/schemas";
import { describe, expect, test } from "vitest";

// The shared listing details and confirmation rules from @durables/schemas, as api applies
// them. web imports the same exports, so these results are web's too.

const validDetails: ListingDetails = {
  title: "Post slack message",
  name: "post-slack-message",
  description: "Posts a message to a Slack channel.",
};

const allConfirmed: PublishConfirmations = {
  rights: true,
  mitZero: true,
  noSecrets: true,
  notMalicious: true,
  noResponsibility: true,
  terms: true,
};

/** Each failing field, with its messages, in the order Zod reports them. */
const failuresFor = (input: unknown): [string, string][] => {
  const result = listingDetailsSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => [issue.path.join("."), issue.message]);
};

const confirmationFailuresFor = (input: unknown): [string, string][] => {
  const result = publishConfirmationsSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => [issue.path.join("."), issue.message]);
};

describe("the listing details", () => {
  test("parse when the title, name and description are valid", () => {
    const result = listingDetailsSchema.safeParse(validDetails);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(validDetails);
  });

  test("fail on every field that is empty, naming each one", () => {
    expect(
      failuresFor({ title: "", name: "", description: "" }).map(([f]) => f),
    ).toEqual(["title", "name", "description"]);
  });

  test("fail on a missing field, naming it", () => {
    const withoutDescription: Partial<ListingDetails> = { ...validDetails };
    delete withoutDescription.description;

    expect(failuresFor(withoutDescription).map(([f]) => f)).toEqual([
      "description",
    ]);
  });
});

describe("the title", () => {
  test.each([
    ["1 character", "a"],
    ["80 characters", "a".repeat(80)],
  ])("accepts %s", (_case, title) => {
    expect(
      listingDetailsSchema.safeParse({ ...validDetails, title }).success,
    ).toBe(true);
  });

  test("refuses an empty title on the title field", () => {
    expect(failuresFor({ ...validDetails, title: "" })).toEqual([
      ["title", listingTitleEmptyMessage],
    ]);
  });

  test("refuses 81 characters on the title field", () => {
    expect(failuresFor({ ...validDetails, title: "a".repeat(81) })).toEqual([
      ["title", listingTitleTooLongMessage],
    ]);
  });

  test("refuses whitespace alone as empty", () => {
    expect(failuresFor({ ...validDetails, title: "   \t " })).toEqual([
      ["title", listingTitleEmptyMessage],
    ]);
  });

  test("trims leading and trailing whitespace before counting", () => {
    const title = ` ${"a".repeat(80)}  `;
    const result = listingDetailsSchema.safeParse({ ...validDetails, title });

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("a".repeat(80));
  });
});

describe("the name in the address", () => {
  test.each([
    ["3 characters", "abc"],
    ["64 characters", "a".repeat(64)],
    ["numbers only", "123"],
    ["a single interior hyphen", "post-message"],
    ["several single hyphens", "post-slack-message"],
    ["a number at each end", "1-a-2"],
  ])("accepts %s", (_case, name) => {
    expect(
      listingDetailsSchema.safeParse({ ...validDetails, name }).success,
    ).toBe(true);
  });

  test.each([
    ["2 characters", "ab"],
    ["65 characters", "a".repeat(65)],
    ["an uppercase letter", "Post-message"],
    ["all uppercase", "POST"],
    ["two hyphens in a row", "post--message"],
    ["a leading hyphen", "-post-message"],
    ["a trailing hyphen", "post-message-"],
    ["an underscore", "post_message"],
    ["a space", "post message"],
    ["surrounding whitespace", " post-message "],
    ["a dot", "post.message"],
    ["a non-ASCII letter", "dañiel"],
  ])("refuses %s on the name field", (_case, name) => {
    expect(failuresFor({ ...validDetails, name })).toEqual([
      ["name", listingNameFormatMessage],
    ]);
  });

  test("refuses an empty name with the empty message only", () => {
    expect(failuresFor({ ...validDetails, name: "" })).toEqual([
      ["name", listingNameEmptyMessage],
    ]);
  });

  test("refuses uppercase rather than lowercasing it", () => {
    const result = listingDetailsSchema.safeParse({
      ...validDetails,
      name: "Post",
    });

    expect(result.success).toBe(false);
  });
});

describe("the description", () => {
  test.each([
    ["1 character", "a"],
    ["160 characters", "a".repeat(160)],
  ])("accepts %s", (_case, description) => {
    expect(
      listingDetailsSchema.safeParse({ ...validDetails, description }).success,
    ).toBe(true);
  });

  test("refuses an empty description on the description field", () => {
    expect(failuresFor({ ...validDetails, description: "" })).toEqual([
      ["description", listingDescriptionEmptyMessage],
    ]);
  });

  test("refuses 161 characters on the description field", () => {
    expect(
      failuresFor({ ...validDetails, description: "a".repeat(161) }),
    ).toEqual([["description", listingDescriptionTooLongMessage]]);
  });

  test("refuses whitespace alone as empty", () => {
    expect(failuresFor({ ...validDetails, description: "  \n " })).toEqual([
      ["description", listingDescriptionEmptyMessage],
    ]);
  });

  test("trims leading and trailing whitespace before counting", () => {
    const description = `  ${"a".repeat(160)} `;
    const result = listingDetailsSchema.safeParse({
      ...validDetails,
      description,
    });

    expect(result.success).toBe(true);
    expect(result.data?.description).toBe("a".repeat(160));
  });
});

describe("the six confirmations", () => {
  test("parse when all six are true", () => {
    expect(publishConfirmationsSchema.safeParse(allConfirmed).success).toBe(
      true,
    );
  });

  test("are the six the Review step lists, in its order", () => {
    expect(publishConfirmationKeys).toEqual([
      "rights",
      "mitZero",
      "noSecrets",
      "notMalicious",
      "noResponsibility",
      "terms",
    ]);
    expect(Object.keys(publishConfirmationsSchema.shape)).toEqual([
      ...publishConfirmationKeys,
    ]);
  });

  test.each(publishConfirmationKeys)("fail when %s is false", (key) => {
    expect(confirmationFailuresFor({ ...allConfirmed, [key]: false })).toEqual([
      [key, publishConfirmationMessage],
    ]);
  });

  test.each(publishConfirmationKeys)("fail when %s is missing", (key) => {
    const withoutKey: Record<string, boolean> = { ...allConfirmed };
    delete withoutKey[key];

    expect(confirmationFailuresFor(withoutKey)).toEqual([
      [key, publishConfirmationMessage],
    ]);
  });

  test("fail when a confirmation is truthy but not true", () => {
    expect(confirmationFailuresFor({ ...allConfirmed, terms: "true" })).toEqual(
      [["terms", publishConfirmationMessage]],
    );
  });

  test("fail on every confirmation when none are given", () => {
    expect(confirmationFailuresFor({}).map(([key]) => key)).toEqual([
      ...publishConfirmationKeys,
    ]);
  });
});
