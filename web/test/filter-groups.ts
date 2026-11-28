import type { Locator } from "vitest/browser";

/**
 * The groups of the shared filter group after Temporal SDK, as the design gives them: each
 * category's name, its help line and its filters, in order. Written out here rather than read
 * from the shared list, so a change to the list shows up as a failing test.
 */
export const categoryGroups = [
  {
    name: "AI models",
    help: "Call an AI model",
    filters: [
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
    filters: ["Amazon S3", "Postgres", "Redis"],
  },
  {
    name: "Messaging",
    help: "Send or receive messages",
    filters: ["Slack", "Amazon SQS"],
  },
  {
    name: "Payments",
    help: "Take, refund or manage payments",
    filters: ["Stripe"],
  },
  {
    name: "Workflow patterns",
    help: "Common workflow steps",
    filters: ["Approval", "Polling", "Batching", "Saga"],
  },
] as const;

/** One group of filters as a visitor meets it. */
export interface ShownGroup {
  /** The group's accessible name: the heading text. */
  name: string;
  /** The group's accessible description: the help line beside the heading. */
  help: string;
  /** Each button in the group, in order, with whether it is pressed. */
  filters: [string, boolean][];
}

function textOf(id: string | null) {
  return id === null ? "" : (document.getElementById(id)?.textContent ?? "");
}

/** Every group of filters inside `scope`, in page order. */
export function groupsIn(scope: Locator): ShownGroup[] {
  return scope
    .getByRole("group")
    .elements()
    .map((group) => ({
      name: textOf(group.getAttribute("aria-labelledby")),
      help: textOf(group.getAttribute("aria-describedby")),
      filters: [...group.querySelectorAll("button")].map((button) => [
        button.textContent,
        button.getAttribute("aria-pressed") === "true",
      ]),
    }));
}

/**
 * The category groups as they should show with `on` pressed and every other filter off: the
 * shape `groupsIn` reads.
 */
export function categoryGroupsWith(...on: string[]): ShownGroup[] {
  return categoryGroups.map(({ name, help, filters }) => ({
    name,
    help,
    filters: filters.map((filter) => [filter, on.includes(filter)]),
  }));
}
