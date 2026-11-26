import type { Integration } from "./listing";

/**
 * The workflow patterns a listing can have as chips, in the order the Workflow patterns
 * category lists them. A pattern is a chip but never an integration: detection never
 * produces one.
 */
export const patterns = ["Approval", "Polling", "Batching", "Saga"] as const;

/** A workflow pattern from `patterns`. */
export type Pattern = (typeof patterns)[number];

/** A chip: an integration or a workflow pattern. Visitors see chips as "Filters". */
export type Chip = Integration | Pattern;

/** A category: its name, the help line under its heading, and its chips in order. */
export interface Category {
  readonly name: string;
  readonly help: string;
  readonly chips: readonly Chip[];
}

/**
 * The five categories, in the order the site shows them. Every chip belongs to exactly one
 * category, and every integration and every pattern appears once. There is no All chip.
 */
export const categories = [
  {
    name: "AI models",
    help: "Call an AI model",
    chips: [
      "OpenAI",
      "Anthropic Claude",
      "Google Gemini",
      "Amazon Bedrock",
      "Ollama",
      "Cohere",
      "Groq",
      "xAI Grok",
    ],
  },
  {
    name: "Data and storage",
    help: "Read or write data",
    chips: ["Amazon S3", "Postgres", "Redis"],
  },
  {
    name: "Messaging",
    help: "Send or receive messages",
    chips: ["Slack", "Amazon SQS"],
  },
  {
    name: "Payments",
    help: "Take, refund or manage payments",
    chips: ["Stripe"],
  },
  {
    name: "Workflow patterns",
    help: "Common workflow steps",
    chips: patterns,
  },
] as const satisfies readonly Category[];

/** The name of one of the five categories. */
export type CategoryName = (typeof categories)[number]["name"];

/** Every chip name, category by category, each chip in its category's order. */
export const chipNames: readonly Chip[] = categories.flatMap(
  ({ chips }) => chips,
);

/** Folds a name for comparison, so names that differ only by case or surrounding whitespace match. */
const fold = (name: string) => name.trim().toLowerCase();

/**
 * The listed chip whose name matches `name` ignoring case and surrounding whitespace,
 * so "stripe" and " stripe" find Stripe. Undefined when no chip has that name.
 */
export const findChip = (name: string): Chip | undefined =>
  chipNames.find((chip) => fold(chip) === fold(name));

/**
 * The listed category whose name matches `name` ignoring case and surrounding whitespace,
 * so "payments" and "payments " find Payments. Undefined when no category has that name.
 */
export const findCategory = (
  name: string,
): (typeof categories)[number] | undefined =>
  categories.find((category) => fold(category.name) === fold(name));

/**
 * The one category the chip named `chip` belongs to, matching the name ignoring case and
 * surrounding whitespace, so " stripe " is in Payments. Undefined when no chip has that name.
 */
export const categoryOfChip = (
  chip: string,
): (typeof categories)[number] | undefined => {
  const found = findChip(chip);
  return found === undefined
    ? undefined
    : categories.find(({ chips }) =>
        (chips as readonly Chip[]).includes(found),
      );
};
