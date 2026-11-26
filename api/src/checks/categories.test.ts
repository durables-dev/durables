import {
  categories,
  categoryOfChip,
  chipNames,
  findCategory,
  findChip,
  integrations,
  patterns,
} from "@durables/schemas";
import { describe, expect, it } from "vitest";

describe("the shared category list", () => {
  it("has five categories in order, each with its help line", () => {
    expect(categories.map(({ name, help }) => ({ name, help }))).toEqual([
      { name: "AI models", help: "Call an AI model" },
      { name: "Data and storage", help: "Read or write data" },
      { name: "Messaging", help: "Send or receive messages" },
      { name: "Payments", help: "Take, refund or manage payments" },
      { name: "Workflow patterns", help: "Common workflow steps" },
    ]);
  });

  it("lists each category's chips in order", () => {
    expect(
      Object.fromEntries(categories.map(({ name, chips }) => [name, chips])),
    ).toEqual({
      "AI models": [
        "OpenAI",
        "Anthropic Claude",
        "Google Gemini",
        "Amazon Bedrock",
        "Ollama",
        "Cohere",
        "Groq",
        "xAI Grok",
      ],
      "Data and storage": ["Amazon S3", "Postgres", "Redis"],
      Messaging: ["Slack", "Amazon SQS"],
      Payments: ["Stripe"],
      "Workflow patterns": ["Approval", "Polling", "Batching", "Saga"],
    });
  });

  it("lists each of the 14 integrations once", () => {
    expect(integrations).toHaveLength(14);
    for (const integration of integrations) {
      expect(chipNames.filter((chip) => chip === integration)).toHaveLength(1);
    }
  });

  it("lists each pattern once, under Workflow patterns", () => {
    expect(patterns).toEqual(["Approval", "Polling", "Batching", "Saga"]);
    for (const pattern of patterns) {
      expect(chipNames.filter((chip) => chip === pattern)).toHaveLength(1);
      expect(categoryOfChip(pattern)?.name).toBe("Workflow patterns");
    }
  });

  it("puts no chip under two categories", () => {
    expect(new Set(chipNames).size).toBe(chipNames.length);
    expect(chipNames).toHaveLength(integrations.length + patterns.length);
  });

  it("has no All chip and no hover text", () => {
    expect(chipNames.map((chip) => chip.toLowerCase())).not.toContain("all");
    for (const category of categories) {
      expect(Object.keys(category).sort()).toEqual(["chips", "help", "name"]);
    }
  });

  it("names every chip in chipNames, category by category", () => {
    expect(chipNames).toEqual(categories.flatMap(({ chips }) => chips));
  });
});

describe("the category of a chip", () => {
  it.each([
    ["Stripe", "Payments"],
    ["Amazon S3", "Data and storage"],
    ["Slack", "Messaging"],
    ["OpenAI", "AI models"],
    ["Saga", "Workflow patterns"],
  ])("is the one category %s is listed under", (chip, category) => {
    expect(categoryOfChip(chip)?.name).toBe(category);
  });

  it("is exactly one category for every chip", () => {
    for (const chip of chipNames) {
      const holding = categories.filter(({ chips }) =>
        (chips as readonly string[]).includes(chip),
      );
      expect(holding).toHaveLength(1);
      expect(categoryOfChip(chip)).toBe(holding[0]);
    }
  });

  it("is found whatever the chip name's case", () => {
    expect(categoryOfChip("stripe")?.name).toBe("Payments");
    expect(categoryOfChip("POLLING")?.name).toBe("Workflow patterns");
  });

  it.each(["Kafka", "", "All", "Payments"])(
    "is nothing for the unknown chip %j",
    (chip) => {
      expect(() => categoryOfChip(chip)).not.toThrow();
      expect(categoryOfChip(chip)).toBeUndefined();
    },
  );
});

describe("looking up a chip", () => {
  it.each([
    ["stripe", "Stripe"],
    ["STRIPE", "Stripe"],
    ["amazon s3", "Amazon S3"],
    ["XAI GROK", "xAI Grok"],
    ["saga", "Saga"],
    ["Postgres", "Postgres"],
  ])("finds %j as %j", (name, chip) => {
    expect(findChip(name)).toBe(chip);
  });

  it.each(["Kafka", "", " stripe", "Payments", "AmazonS3"])(
    "finds nothing for the unknown name %j",
    (name) => {
      expect(() => findChip(name)).not.toThrow();
      expect(findChip(name)).toBeUndefined();
    },
  );
});

describe("looking up a category", () => {
  it.each([
    ["payments", "Payments"],
    ["PAYMENTS", "Payments"],
    ["ai models", "AI models"],
    ["Data And Storage", "Data and storage"],
    ["workflow patterns", "Workflow patterns"],
    ["Messaging", "Messaging"],
  ])("finds %j as %j", (name, category) => {
    expect(findCategory(name)?.name).toBe(category);
  });

  it("finds the listed category, with its help line and chips", () => {
    expect(findCategory("payments")).toBe(categories[3]);
  });

  it.each(["Databases", "", "Category", "Stripe", "payments "])(
    "finds nothing for the unknown name %j",
    (name) => {
      expect(() => findCategory(name)).not.toThrow();
      expect(findCategory(name)).toBeUndefined();
    },
  );
});
