import { sdkProfile, type SdkProfile } from "@/lib/sdk-catalog";
import { describe, expect, test } from "vitest";
import { testCatalog } from "../../../test/sdk-catalog";
import type { CheckedFacts } from "./check-result";
import { factRows, type FactRow } from "./detected-facts";

/** The catalog's profile for `sdk`, as the card looks it up. */
function profileOf(sdk: string): SdkProfile | undefined {
  return sdkProfile(testCatalog, sdk);
}

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

/** The card's row for `label`, with the catalog's profile for the facts' SDK. */
function row(facts: CheckedFacts, label: string): FactRow | undefined {
  return rowWith(facts, label, profileOf(facts.sdk));
}

/** The card's row for `label`, with `profile` as the SDK's catalog profile. */
function rowWith(
  facts: CheckedFacts,
  label: string,
  profile: SdkProfile | undefined,
): FactRow | undefined {
  return factRows(facts, profile).find((fact) => fact.label === label);
}

describe("factRows", () => {
  test("gives the eight facts in screen 12's order", () => {
    expect(factRows(everythingFound, profileOf("Python"))).toEqual([
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
    expect(factRows(nothingFound, profileOf("Python"))).toEqual([
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

    test("says the worker needs a thread pool for a synchronous Python activity", () => {
      expect(
        row({ ...everythingFound, runsAs: "sync" }, "Runs as")?.value,
      ).toBe("Synchronous: the worker needs a thread pool");
    });

    test.each(["Python", "TypeScript", ".NET"] as const)(
      "reads the catalog's %s wording for each way it runs",
      (sdk) => {
        const profile = profileOf(sdk);
        expect(profile).toBeDefined();
        for (const runsAs of ["sync", "async"] as const) {
          expect(
            rowWith({ ...everythingFound, sdk, runsAs }, "Runs as", profile),
          ).toEqual({
            label: "Runs as",
            value: profile?.runsAs[runsAs],
            found: true,
          });
        }
      },
    );

    test("a synchronous .NET activity reads as the Configure section does, with no thread pool", () => {
      const value = row(
        { ...everythingFound, sdk: ".NET", runsAs: "sync" },
        "Runs as",
      )?.value;

      expect(value).toBe("Synchronous: the .NET SDK runs it for you");
      expect(value).not.toMatch(/thread pool/i);
    });

    test.each([
      ["sync", "Synchronous"],
      ["async", "Async"],
    ] as const)(
      "without the catalog's profile, a %s activity reads %s and nothing more",
      (runsAs, value) => {
        expect(
          rowWith({ ...everythingFound, runsAs }, "Runs as", undefined),
        ).toEqual({ label: "Runs as", value, found: true });
      },
    );

    test("an SDK the catalog does not list falls back the same way", () => {
      expect(
        row({ ...everythingFound, sdk: "Zig", runsAs: "sync" }, "Runs as")
          ?.value,
      ).toBe("Synchronous");
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
