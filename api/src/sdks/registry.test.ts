import { describe, expect, expectTypeOf, it } from "vitest";
import { dotnet } from "./dotnet";
import { php } from "./php";
import { go } from "./go";
import { java } from "./java";
import { python } from "./python";
import { ruby } from "./ruby";
import { registeredSdks, sdkRegistry } from "./registry";
import type { SdkEntry, SdkRegistry } from "./sdk-entry";
import { type Sdk, sdks } from "./sdk-list";
import { typescript } from "./typescript";

/** The keys of T that may be left out. */
type OptionalKeys<T> = {
  [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? K : never;
}[keyof T];

describe("the SDK registry", () => {
  describe("its types", () => {
    // These assertions are checked by `npm run typecheck`, which compiles the tests: an entry
    // that may leave out a capability, or a registry that may leave out an SDK, fails the build.

    it("requires every capability of an entry", () => {
      expectTypeOf<OptionalKeys<SdkEntry>>().toEqualTypeOf<never>();
      expectTypeOf<OptionalKeys<SdkEntry["display"]>>().toEqualTypeOf<never>();
      expectTypeOf<keyof SdkEntry>().toEqualTypeOf<
        | "sdk"
        | "recognition"
        | "detector"
        | "snippets"
        | "isStandardLibrary"
        | "normaliseDependency"
        | "display"
      >();
    });

    it("requires an entry for every SDK in the api's list", () => {
      expectTypeOf<keyof SdkRegistry>().toEqualTypeOf<Sdk>();
      expectTypeOf<OptionalKeys<SdkRegistry>>().toEqualTypeOf<never>();
    });

    it("refuses an entry without a detector and a registry without .NET", () => {
      const { detector, ...withoutDetector } = python;
      // @ts-expect-error An entry without a detector is not an entry.
      const incomplete: SdkEntry<"Python"> = withoutDetector;
      // @ts-expect-error A registry without .NET's entry is not the registry.
      const partial: SdkRegistry = { Python: python, TypeScript: typescript };
      expect([detector, incomplete, partial]).toHaveLength(3);
    });

    it("refuses an entry filed under another SDK", () => {
      // @ts-expect-error The Python entry can't stand in for .NET.
      const misfiled: SdkRegistry = { ...sdkRegistry, ".NET": python };
      expect(misfiled).toBeDefined();
    });
  });

  it("has an entry for every SDK in the api's list, filed under its own name", () => {
    expect(Object.keys(sdkRegistry).sort()).toEqual([...sdks].sort());
    for (const sdk of sdks) {
      expect(sdkRegistry[sdk].sdk).toBe(sdk);
    }
  });

  it("lists its entries in the api's list's order", () => {
    expect(registeredSdks.map(({ sdk }) => sdk)).toEqual([...sdks]);
    expect(registeredSdks).toEqual([
      go,
      java,
      python,
      typescript,
      dotnet,
      ruby,
      php,
    ]);
  });

  it("gives every entry recognition patterns with unique names across the registry", () => {
    const names = registeredSdks.flatMap(({ recognition }) =>
      [
        ...new Set([...recognition.sdkMarkers, ...recognition.activityMarkers]),
      ].map(({ name }) => name),
    );
    expect(names.length).toBeGreaterThanOrEqual(sdks.length);
    expect(new Set(names).size).toBe(names.length);
  });

  describe("the dependency normaliser", () => {
    it.each([
      ["Go", "github.com/stripe/stripe-go/v87", "github.com/stripe/stripe-go"],
      ["Go", "github.com/Slack-Go/slack", "github.com/slack-go/slack"],
      ["Python", "Stripe", "stripe"],
      ["Python", "slack_sdk", "slack_sdk"],
      ["Python", "PSYCOPG2", "psycopg2"],
      ["TypeScript", "@AWS-SDK/client-s3", "@aws-sdk/client-s3"],
      ["TypeScript", "pg", "pg"],
      [".NET", "Npgsql", "npgsql"],
      [".NET", "SlackNet", "slacknet"],
      ["Ruby", "stripe", "stripe"],
      ["Ruby", "aws-sdk-s3", "aws-sdk-s3"],
      ["Ruby", "Slack-Ruby-Client", "slack-ruby-client"],
      ["Ruby", "google/cloud/storage", "google-cloud-storage"],
      ["PHP", "Stripe", "stripe"],
      ["PHP", "Aws\\S3", "aws\\s3"],
      ["PHP", "JoliCode\\Slack", "jolicode\\slack"],
      ["PHP", "Amp\\Postgres", "amp\\postgres"],
    ] as const)(
      "maps the %s dependency %s to the integration key %s",
      (sdk, name, key) => {
        expect(sdkRegistry[sdk].normaliseDependency(name)).toBe(key);
      },
    );
  });

  describe("the standard-library check", () => {
    it.each([
      ["Go", "fmt", true],
      ["Go", "net/http", true],
      ["Go", "github.com/lib/pq", false],
      ["Go", "go.temporal.io/sdk", false],
      ["Python", "os", true],
      ["Python", "asyncio", true],
      ["Python", "__future__", true],
      ["Python", "httpx", false],
      ["Python", "temporalio", false],
      ["TypeScript", "fs", true],
      ["TypeScript", "node:fs", true],
      ["TypeScript", "node:test", true],
      ["TypeScript", "stripe", false],
      ["TypeScript", "@temporalio/activity", false],
      [".NET", "System", true],
      [".NET", "Microsoft", true],
      [".NET", "Npgsql", false],
      [".NET", "Temporalio", false],
      ["Ruby", "json", true],
      ["Ruby", "net/http", true],
      ["Ruby", "securerandom", true],
      ["Ruby", "stripe", false],
      ["Ruby", "aws-sdk-s3", false],
      ["Ruby", "temporalio", false],
      ["PHP", "DateTimeImmutable", true],
      ["PHP", "\\PDO", true],
      ["PHP", "Random\\Randomizer", true],
      ["PHP", "PgSql\\Connection", true],
      ["PHP", "Stripe\\StripeClient", false],
      ["PHP", "Aws\\S3\\S3Client", false],
      ["PHP", "Temporal\\Activity", false],
    ] as const)(
      "reads the %s dependency %s as standard library: %s",
      (sdk, name, expected) => {
        expect(sdkRegistry[sdk].isStandardLibrary(name)).toBe(expected);
      },
    );
  });

  describe("the display profile", () => {
    it.each([
      ["Go", "activity.go", "go.temporal.io/sdk", "go"],
      ["Python", "activities.py", "temporalio", "python"],
      ["TypeScript", "activities.ts", "@temporalio/activity", "typescript"],
      [".NET", "Activities.cs", "Temporalio", "csharp"],
      ["Ruby", "activities.rb", "temporalio", "ruby"],
      ["PHP", "Activities.php", "temporal/sdk", "php"],
    ] as const)(
      "gives %s the activity file %s, the package %s and the highlight language %s",
      (sdk, activityFileName, sdkPackage, highlightLanguage) => {
        const { runsAs, workerRequirements, ...shown } =
          sdkRegistry[sdk].display;
        expect(shown).toEqual({
          package: sdkPackage,
          highlightLanguage,
          activityFileName,
        });
        expect(Object.keys(runsAs).sort()).toEqual(["async", "sync"]);
        expect(Object.keys(workerRequirements).sort()).toEqual([
          "async",
          "sync",
        ]);
      },
    );

    it("gives PHP wording for RoadRunner, which its generated worker runs under", () => {
      expect(sdkRegistry.PHP.display.runsAs).toEqual({
        sync: "Synchronous: RoadRunner runs it in a PHP worker process",
        async: "Async",
      });
      expect(sdkRegistry.PHP.display.workerRequirements).toEqual({
        sync: "This is a synchronous activity. Your worker runs under RoadRunner, which needs PHP's grpc extension. The .rr.yaml file in Implement configures it.",
        async:
          "This is an async activity. Your worker runs under RoadRunner, which needs PHP's grpc extension. The .rr.yaml file in Implement configures it.",
      });
    });

    const asyncRunsAs = "Async";
    const asyncWorker =
      "This is an async activity. Your worker needs no special setup to run it.";

    it.each([
      [
        "Go",
        "Synchronous: the Go SDK runs it for you",
        "This is a synchronous activity. The Go SDK runs it for you, so your worker needs no special setup.",
      ],
      [
        "Python",
        "Synchronous: the worker needs a thread pool",
        "This is a synchronous activity. Your worker needs a thread pool to run it, which the worker file in Implement already sets up.",
      ],
      [
        "TypeScript",
        "Synchronous: the worker needs no special setup",
        "This is a synchronous activity. Your worker needs no special setup to run it.",
      ],
      [
        ".NET",
        "Synchronous: the .NET SDK runs it for you",
        "This is a synchronous activity. The .NET SDK runs it for you, so your worker needs no special setup.",
      ],
      [
        "Ruby",
        "Synchronous: the worker needs no special setup",
        "This is a synchronous activity. Your worker needs no special setup to run it.",
      ],
    ] as const)(
      "gives %s the Runs as wording %j for sync, and its Worker requirements",
      (sdk, syncRunsAs, syncWorker) => {
        const { runsAs, workerRequirements } = sdkRegistry[sdk].display;
        expect(runsAs).toEqual({ sync: syncRunsAs, async: asyncRunsAs });
        expect(workerRequirements).toEqual({
          sync: syncWorker,
          async: asyncWorker,
        });
      },
    );
  });
});
