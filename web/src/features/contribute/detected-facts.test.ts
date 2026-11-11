import { describe, expect, test } from "vitest";
import type { CheckedFacts } from "./check-result";
import { factRows, type FactRow } from "./detected-facts";

const nothingFound: CheckedFacts = {
  sdk: "Python",
  activity: { name: "post_slack_message", line: 4 },
  input: null,
  output: null,
  runsAs: null,
  nonRetryableErrors: [],
  configurationRead: [],
  dependencies: [],
  heartbeats: [],
};

const everythingFound: CheckedFacts = {
  sdk: "Python",
  activity: { name: "post_slack_message", line: 10 },
  input: "SlackMessage",
  output: "MessageRef",
  runsAs: "sync",
  nonRetryableErrors: [{ line: 13 }],
  configurationRead: [{ name: "SLACK_TOKEN", line: 7 }],
  dependencies: [{ name: "httpx", line: 2 }],
  heartbeats: [{ line: 11 }],
};

function row(facts: CheckedFacts, label: string): FactRow | undefined {
  return factRows(facts).find((fact) => fact.label === label);
}

describe("factRows", () => {
  test("gives the eight facts in screen 12's order", () => {
    expect(factRows(everythingFound)).toEqual([
      { label: "SDK", value: "Python", found: true },
      { label: "Activity", value: "post_slack_message", found: true },
      {
        label: "Input → output",
        value: "SlackMessage → MessageRef",
        found: true,
      },
      {
        label: "Runs as",
        value: "Synchronous: the worker needs a thread pool",
        found: true,
      },
      {
        label: "Non-retryable errors",
        value: "Raised on line 13",
        found: true,
      },
      {
        label: "Configuration read",
        value: "SLACK_TOKEN (line 7)",
        found: true,
      },
      { label: "Dependencies", value: "httpx", found: true },
      { label: "Heartbeats", value: "Yes, line 11", found: true },
    ]);
  });

  test("gives each fact's fallback, marked not found, when detection found nothing", () => {
    expect(factRows(nothingFound)).toEqual([
      { label: "SDK", value: "Python", found: true },
      { label: "Activity", value: "post_slack_message", found: true },
      { label: "Input → output", value: "—", found: false },
      { label: "Runs as", value: "—", found: false },
      { label: "Non-retryable errors", value: "None raised", found: false },
      { label: "Configuration read", value: "None", found: false },
      { label: "Dependencies", value: "None beyond the SDK", found: false },
      { label: "Heartbeats", value: "Not detected", found: false },
    ]);
  });

  test.each(["Python", "TypeScript", ".NET"] as const)(
    "names the %s SDK as the Found line does",
    (sdk) => {
      expect(row({ ...everythingFound, sdk }, "SDK")).toEqual({
        label: "SDK",
        value: sdk,
        found: true,
      });
    },
  );

  describe("Input → output", () => {
    test('shows "—" for a side that can\'t be read', () => {
      expect(
        row({ ...everythingFound, output: null }, "Input → output")?.value,
      ).toBe("SlackMessage → —");
      expect(
        row({ ...everythingFound, input: null }, "Input → output")?.value,
      ).toBe("— → MessageRef");
    });
  });

  describe("Runs as", () => {
    test("reads Async for an async activity", () => {
      expect(row({ ...everythingFound, runsAs: "async" }, "Runs as")).toEqual({
        label: "Runs as",
        value: "Async",
        found: true,
      });
    });

    test("says the worker needs a thread pool for a synchronous activity", () => {
      expect(
        row({ ...everythingFound, runsAs: "sync" }, "Runs as")?.value,
      ).toBe("Synchronous: the worker needs a thread pool");
    });
  });

  describe("Non-retryable errors", () => {
    test("names every line one is raised on", () => {
      expect(
        row(
          {
            ...everythingFound,
            nonRetryableErrors: [{ line: 13 }, { line: 39 }],
          },
          "Non-retryable errors",
        )?.value,
      ).toBe("Raised on lines 13, 39");
    });
  });

  describe("Configuration read", () => {
    test("lists every variable with its line, in the order detection found them", () => {
      expect(
        row(
          {
            ...everythingFound,
            configurationRead: [
              { name: "SLACK_TOKEN", line: 7 },
              { name: "SLACK_CHANNEL", line: 8 },
            ],
          },
          "Configuration read",
        )?.value,
      ).toBe("SLACK_TOKEN (line 7), SLACK_CHANNEL (line 8)");
    });
  });

  describe("Dependencies", () => {
    test("lists every package by name", () => {
      expect(
        row(
          {
            ...everythingFound,
            dependencies: [
              { name: "httpx", line: 2 },
              { name: "pydantic", line: 3 },
            ],
          },
          "Dependencies",
        )?.value,
      ).toBe("httpx, pydantic");
    });
  });

  describe("Heartbeats", () => {
    test("names every line the activity heartbeats on", () => {
      expect(
        row(
          { ...everythingFound, heartbeats: [{ line: 11 }, { line: 20 }] },
          "Heartbeats",
        )?.value,
      ).toBe("Yes, lines 11, 20");
    });
  });
});
