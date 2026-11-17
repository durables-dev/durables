import { describe, expect, expectTypeOf, it } from "vitest";
import { dotnet } from "./dotnet";
import { php } from "./php";
import { go } from "./go";
import { java } from "./java";
import { python } from "./python";
import { ruby } from "./ruby";
import { registeredSdks, sdkRegistry } from "./registry";
import { rust } from "./rust";
import type { DisplayProfile, SdkEntry, SdkRegistry } from "./sdk-entry";
import { type Sdk, sdks } from "./sdk-list";
import { typescript } from "./typescript";

/** The keys of T that may be left out. */
type OptionalKeys<T> = {
  [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? K : never;
}[keyof T];

/** The credit the Ruby logo's licence requires. */
const rubyCredit = "Ruby logo © 2006 Yukihiro Matsumoto, CC BY-SA 2.5";

describe("the SDK registry", () => {
  describe("its types", () => {
    // These assertions are checked by `npm run typecheck`, which compiles the tests: an entry
    // that may leave out a capability, or a registry that may leave out an SDK, fails the build.

    it("requires every capability of an entry", () => {
      expectTypeOf<OptionalKeys<SdkEntry>>().toEqualTypeOf<never>();
      // The logo, its credit and the light tile are the display profile's only optional fields.
      expectTypeOf<OptionalKeys<SdkEntry["display"]>>().toEqualTypeOf<
        "logo" | "credit" | "lightTile"
      >();
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
      rust,
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
      ["Rust", "aws-sdk-s3", "aws_sdk_s3"],
      ["Rust", "aws_sdk_s3", "aws_sdk_s3"],
      ["Rust", "Async-Stripe", "async_stripe"],
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
      ["Rust", "std", true],
      ["Rust", "core", true],
      ["Rust", "alloc", true],
      ["Rust", "serde", false],
      ["Rust", "temporalio_sdk", false],
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
      ["Rust", "activities.rs", "temporalio-sdk", "rust"],
      ["Ruby", "activities.rb", "temporalio", "ruby"],
      ["PHP", "Activities.php", "temporal/sdk", "php"],
    ] as const)(
      "gives %s the activity file %s, the package %s and the highlight language %s",
      (sdk, activityFileName, sdkPackage, highlightLanguage) => {
        const {
          runsAs,
          workerRequirements,
          logo,
          credit,
          lightTile,
          ...shown
        } = sdkRegistry[sdk].display;
        expect(shown).toEqual({
          package: sdkPackage,
          highlightLanguage,
          activityFileName,
        });
        // The logo fields are checked in full under "the SDK logos", below.
        expect(logo).toEqual(expect.any(String));
        expect(credit).toBe(sdk === "Ruby" ? rubyCredit : undefined);
        expect(lightTile).toBe(sdk === "Rust" ? true : undefined);
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
        "Rust",
        "Synchronous: the worker needs no special setup",
        "This is a synchronous activity. Your worker needs no special setup to run it.",
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

    it("never names a thread pool in Rust's wording, whatever the activity", () => {
      const { runsAs, workerRequirements } = sdkRegistry.Rust.display;
      for (const wording of [
        runsAs.sync,
        runsAs.async,
        workerRequirements.sync,
        workerRequirements.async,
      ]) {
        expect(wording).not.toMatch(/thread/i);
      }
      expect(workerRequirements.async).toContain("no special setup");
    });
  });

  describe("the SDK logos", () => {
    /** The SHA-256 digest of each logo file attached to the epic (DUR-95), in hex. */
    const attachedLogoDigests = {
      Go: "c89d8c4a31dd4f6487e69bc3bdb6585a52466a393f6e8d863bfc1a0189bc213c",
      Python:
        "baec8662a1461c2cacc326b54d2727cb2f1ce07ba02d00f5b826d035104f649f",
      TypeScript:
        "139ae451b37a00251fe24358191699efa665f63f1c8369cb9dad833159e159e2",
      ".NET":
        "f222062c4f59b7864163bd54d24fafc40f1e2f2513672e50bc08e5025d73e4e5",
      Ruby: "128ab0befae77abb5b74f6082b9b9185a0d99558d04c98b1e56de1fa65c28ce6",
      PHP: "2132ce6951ad588f001d6e17d7b8d6389de2f64d659c5eeb2615551ade79a9aa",
      Rust: "9a9549ea02d34dec3a610b8299f1b8121c7b10b14a44d3baec46ba15e9a06ca2",
    } as const satisfies Partial<Record<Sdk, string>>;

    const sdksWithLogos = Object.keys(
      attachedLogoDigests,
    ) as (keyof typeof attachedLogoDigests)[];

    /** The SHA-256 digest of a logo's UTF-8 bytes, in hex. */
    const digest = async (svg: string) =>
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(svg)),
        ),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");

    it("gives every SDK but Java a logo", () => {
      expect(
        registeredSdks
          .filter(({ display }) => display.logo !== undefined)
          .map(({ sdk }) => sdk),
      ).toEqual(sdks.filter((sdk) => sdk !== "Java"));
      expect([...sdksWithLogos].sort()).toEqual(
        sdks.filter((sdk) => sdk !== "Java").sort(),
      );
    });

    it.each(sdksWithLogos)(
      "gives %s its official logo, byte for byte the file attached to the epic",
      async (sdk) => {
        const { logo } = sdkRegistry[sdk].display;

        expect(logo).toBeDefined();
        expect(await digest(logo ?? "")).toBe(attachedLogoDigests[sdk]);
      },
    );

    it.each(sdksWithLogos)("gives %s a logo that is an SVG document", (sdk) => {
      const logo = (sdkRegistry[sdk].display.logo ?? "").trim();

      expect(logo).not.toBe("");
      expect(logo).toMatch(/<svg[\s>]/);
      expect(logo).toMatch(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      expect(logo).toMatch(/<\/svg>$/);
    });

    it("gives each SDK a different logo", () => {
      const logos = registeredSdks.flatMap(({ display }) =>
        display.logo === undefined ? [] : [display.logo],
      );

      expect(new Set(logos).size).toBe(sdksWithLogos.length);
    });

    it("gives Java no logo, no credit and no light tile", () => {
      expect(java.display).not.toHaveProperty("logo");
      expect(java.display).not.toHaveProperty("credit");
      expect(java.display).not.toHaveProperty("lightTile");
    });

    it("sets the light tile on Rust and no other SDK", () => {
      expect(sdkRegistry.Rust.display.lightTile).toBe(true);
      expect(
        registeredSdks
          .filter(({ display }) => "lightTile" in display)
          .map(({ sdk }) => sdk),
      ).toEqual(["Rust"]);
    });

    it("credits the Ruby logo, and no other SDK has a credit", () => {
      expect(sdkRegistry.Ruby.display.credit).toBe(rubyCredit);
      expect(
        registeredSdks
          .filter(({ display }) => "credit" in display)
          .map(({ sdk }) => sdk),
      ).toEqual(["Ruby"]);
    });

    it("accepts an entry that sets none of the three fields", () => {
      const { logo, credit, lightTile, ...plain } = python.display;
      const display: DisplayProfile = plain;
      const registry: SdkRegistry = {
        ...sdkRegistry,
        Python: { ...python, display },
      };

      expect([logo, credit, lightTile]).toEqual([
        expect.any(String),
        undefined,
        undefined,
      ]);
      expect(registry.Python.display).toEqual(plain);
      expect(registry.Python.display).not.toHaveProperty("logo");
      expectTypeOf<DisplayProfile["logo"]>().toEqualTypeOf<
        string | undefined
      >();
      expectTypeOf<DisplayProfile["credit"]>().toEqualTypeOf<
        string | undefined
      >();
      expectTypeOf<DisplayProfile["lightTile"]>().toEqualTypeOf<
        boolean | undefined
      >();
    });
  });
});
