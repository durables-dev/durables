import { describe, expect, it } from "vitest";
import { registeredSdks, sdkRegistry } from "../sdks/registry";
import type { ActivityFacts } from "./facts";
import {
  goActivityFunction,
  goActivityImport,
  goActivityShape,
  goApplicationErrorWithOptions,
  goCommentOrString,
  goContextType,
  goDetector,
  goEnvironmentRead,
  goErrorType,
  goExportedName,
  goFunctionDeclaration,
  goFunctionResults,
  goHeartbeatCall,
  goImportDeclaration,
  goImportSpec,
  goMajorVersionSuffix,
  goNonRetryableError,
  goNonRetryableOption,
  goParameter,
  goPatterns,
  goRecognition,
  goSdkImport,
  goStandardLibraryPath,
  goTypeName,
  goWorkflowContextType,
  isGoStandardLibrary,
  normaliseGoDependency,
} from "./go-detector";
import { integrationsFor } from "./integrations";
import { matchesAny, type Pattern } from "./pattern";
import { checkCode } from "./pipeline";
import { CheckRefusal, refusalTypes } from "./refusals";
import { allMatches } from "./scan";
import { MAX_CODE_BYTES } from "./size-limit";
import { toSource } from "./source";
import { unacceptedSdks } from "./unaccepted-sdks";

const detect = (code: string) =>
  goDetector.detect(toSource(code), sdkRegistry.Go.isStandardLibrary);

const lines = (...code: string[]) => code.join("\n");

/** The Problem Details body of the refusal the pipeline throws for the code. */
const refusalOf = (code: string) => {
  try {
    checkCode(code, registeredSdks);
  } catch (error) {
    expect(error).toBeInstanceOf(CheckRefusal);
    return (error as CheckRefusal).problem;
  }
  throw new Error("Expected a refusal");
};

/** The only activity detected in the code. Fails the test if there isn't exactly one. */
const onlyActivity = (code: string): ActivityFacts => {
  const found = detect(code);
  expect(found).toHaveLength(1);
  const [only] = found;
  if (only === undefined) {
    throw new Error("Expected one activity");
  }
  return only;
};

/** A package holding the given declarations, under a Temporal import. They start on line 9. */
const packageWith = (...declarations: string[]) =>
  lines(
    "package payments",
    "",
    "import (",
    '    "context"',
    "",
    '    "go.temporal.io/sdk/activity"',
    ")",
    "",
    ...declarations,
  );

/** A minimal activity with the given body lines, which start on line 10. */
const activityWith = (...body: string[]) =>
  packageWith(
    "func Act(ctx context.Context, input In) (Out, error) {",
    ...body,
    "    return Out{}, nil",
    "}",
  );

// A Go counterpart to the canvas's charge_card sample, with every fact present.
const chargeCard = lines(
  "package payments",
  "",
  "import (",
  '    "context"',
  '    "fmt"',
  '    "os"',
  "",
  '    "github.com/stripe/stripe-go/v87"',
  '    "github.com/stripe/stripe-go/v87/paymentintent"',
  '    "go.temporal.io/sdk/activity"',
  '    "go.temporal.io/sdk/temporal"',
  ")",
  "",
  "type ChargeRequest struct {",
  "    AmountCents   int64",
  "    PaymentMethod string",
  "}",
  "",
  "type ChargeResult struct {",
  "    ChargeID string",
  "}",
  "",
  "func ChargeCard(ctx context.Context, input ChargeRequest) (*ChargeResult, error) {",
  '    stripe.Key = os.Getenv("STRIPE_API_KEY")',
  '    activity.RecordHeartbeat(ctx, "charging")',
  "    intent, err := paymentintent.New(&stripe.PaymentIntentParams{",
  "        Amount:        stripe.Int64(input.AmountCents),",
  "        PaymentMethod: stripe.String(input.PaymentMethod),",
  "    })",
  "    if err != nil {",
  "        return nil, temporal.NewNonRetryableApplicationError(",
  '            fmt.Sprintf("card declined: %v", err), "CardDeclined", err)',
  "    }",
  "    return &ChargeResult{ChargeID: intent.ID}, nil",
  "}",
);

// Temporal's Go quickstart activity: no Temporal import, so nothing marks it as Temporal.
const quickstartGreeting = lines(
  "package app",
  "",
  "import (",
  '    "context"',
  '    "fmt"',
  ")",
  "",
  "func ComposeGreeting(ctx context.Context, name string) (string, error) {",
  '    greeting := fmt.Sprintf("Hello %s!", name)',
  "    return greeting, nil",
  "}",
);

describe("goDetector", () => {
  describe("the patterns", () => {
    it("are named, unique, documented and stateless", () => {
      const names = goPatterns.map((pattern) => pattern.name);
      expect(new Set(names).size).toBe(names.length);
      for (const pattern of goPatterns) {
        expect(pattern.name).toMatch(/^go(?:-[a-z]+)+$/);
        expect(pattern.description.length).toBeGreaterThan(0);
        expect(pattern.regex.global || pattern.regex.sticky).toBe(false);
      }
    });

    it("keep the names of the Go markers identification used before Go was accepted", () => {
      expect(goSdkImport.name).toBe("go-sdk-import");
      expect(goActivityImport.name).toBe("go-activity-import");
      expect(goActivityFunction.name).toBe("go-activity-function");
    });

    it("include every recognition pattern", () => {
      for (const pattern of [
        ...goRecognition.sdkMarkers,
        ...goRecognition.activityMarkers,
        ...goRecognition.shapeMarkers,
      ]) {
        expect(goPatterns).toContain(pattern);
      }
    });

    it("have names no other SDK's patterns use", () => {
      const others = [...registeredSdks, ...unacceptedSdks]
        .filter(({ sdk }) => sdk !== "Go")
        .flatMap(({ recognition }) => [
          ...recognition.sdkMarkers,
          ...recognition.activityMarkers,
          ...recognition.shapeMarkers,
        ]);
      const names = [...new Set([...goPatterns, ...others])].map(
        (pattern) => pattern.name,
      );
      expect(new Set(names).size).toBe(names.length);
    });

    it("are registered with the pipeline", () => {
      expect(sdkRegistry.Go.detector).toBe(goDetector);
      expect(sdkRegistry.Go.recognition).toBe(goRecognition);
    });
  });

  describe("each named pattern matches its case and misses a near miss", () => {
    const cases: readonly (readonly [Pattern, string, string])[] = [
      [goSdkImport, '    "go.temporal.io/sdk/client"', '"go.temporal.io/api"'],
      [
        goActivityImport,
        '    "go.temporal.io/sdk/activity"',
        '"go.temporal.io/sdk/workflow"',
      ],
      [
        goActivityFunction,
        "func Greet(ctx context.Context, name string) (string, error) {",
        "func GreetWorkflow(ctx workflow.Context, name string) (string, error) {",
      ],
      [
        goActivityShape,
        "func ComposeGreeting(name string) (string, error) {",
        "func composeGreeting(name string) (string, error) {",
      ],
      [goFunctionDeclaration, "func (a *Activities) Charge(", "f := func("],
      [
        goFunctionResults,
        " (*ChargeResult, error) {",
        " (*ChargeResult, error)",
      ],
      [goExportedName, "Charge", "charge"],
      [goParameter, "input ChargeRequest", ""],
      [goContextType, "context.Context", "workflow.Context"],
      [goWorkflowContextType, "workflow.Context", "context.Context"],
      [goErrorType, "error", "*errors.Error"],
      [goTypeName, "map[string][]*models.Item", "...string"],
      [
        goNonRetryableError,
        'temporal.NewNonRetryableApplicationError("no", "Bad", nil)',
        'temporal.NewApplicationError("no", "Bad")',
      ],
      [
        goApplicationErrorWithOptions,
        "temporal.NewApplicationErrorWithOptions(",
        "temporal.NewApplicationError(",
      ],
      [goNonRetryableOption, "NonRetryable: true", "NonRetryable: false"],
      [goEnvironmentRead, 'os.Getenv("API_KEY")', 'Getenv("API_KEY")'],
      [goImportDeclaration, 'import "fmt"', 'imports := "fmt"'],
      [goImportSpec, 'stripe "github.com/stripe/stripe-go/v87"', "stripe"],
      [
        goHeartbeatCall,
        "activity.RecordHeartbeat(ctx, 3)",
        "RecordHeartbeat(ctx, 3)",
      ],
      [goCommentOrString, "// note", "note"],
      [goStandardLibraryPath, "net/http", "github.com/lib/pq"],
      [
        goMajorVersionSuffix,
        "github.com/stripe/stripe-go/v87",
        "github.com/stripe/stripe-go/v1",
      ],
    ];

    it("covers every Go pattern", () => {
      expect(new Set(cases.map(([pattern]) => pattern))).toEqual(
        new Set(goPatterns),
      );
    });

    it.each(
      cases.map(
        ([pattern, hit, miss]) => [pattern.name, pattern, hit, miss] as const,
      ),
    )("%s", (_, pattern, hit, miss) => {
      expect(pattern.regex.test(hit)).toBe(true);
      expect(pattern.regex.test(miss)).toBe(false);
    });
  });

  describe("an activity with the Temporal import", () => {
    it("populates all eight facts, with the SDK detected", () => {
      expect(checkCode(chargeCard, registeredSdks)).toEqual({
        sdk: "Go",
        activity: { name: "ChargeCard", line: 23 },
        input: "ChargeRequest",
        output: "*ChargeResult",
        runsAs: "sync",
        nonRetryableErrors: [{ line: 31 }],
        configurationRead: [{ name: "STRIPE_API_KEY", line: 24 }],
        dependencies: [
          { name: "github.com/stripe/stripe-go/v87", line: 8 },
          { name: "github.com/stripe/stripe-go/v87/paymentintent", line: 9 },
        ],
        heartbeats: [{ line: 25 }],
        provenance: {
          sdk: "detected",
          activity: "detected",
          inputOutput: "detected",
          runsAs: "detected",
          nonRetryableErrors: "detected",
          configurationRead: "detected",
          dependencies: "detected",
          heartbeats: "detected",
        },
      });
    });

    it("reads a method on a struct, with its receiver", () => {
      const code = packageWith(
        "type Activities struct{ client *Client }",
        "",
        "func (a *Activities) Charge(ctx context.Context, req ChargeRequest) (ChargeResult, error) {",
        "    return a.client.Charge(ctx, req)",
        "}",
      );
      expect(onlyActivity(code)).toMatchObject({
        activity: { name: "Charge", line: 11 },
        input: "ChargeRequest",
        output: "ChargeResult",
      });
    });

    it("reads a signature split across lines", () => {
      const code = packageWith(
        "func PostSlackMessage(",
        "    ctx context.Context,",
        "    input SlackMessage,",
        ") (",
        "    *MessageRef,",
        "    error,",
        ") {",
        "    return post(ctx, input)",
        "}",
      );
      expect(onlyActivity(code)).toMatchObject({
        activity: { name: "PostSlackMessage", line: 9 },
        input: "SlackMessage",
        output: "*MessageRef",
      });
    });
  });

  describe("an activity with no Temporal marker", () => {
    it("is accepted with the SDK inferred", () => {
      expect(checkCode(quickstartGreeting, registeredSdks)).toEqual({
        sdk: "Go",
        activity: { name: "ComposeGreeting", line: 8 },
        input: "string",
        output: "string",
        runsAs: "sync",
        nonRetryableErrors: [],
        configurationRead: [],
        dependencies: [],
        heartbeats: [],
        provenance: {
          sdk: "inferred",
          activity: "detected",
          inputOutput: "detected",
          runsAs: "detected",
          nonRetryableErrors: "detected",
          configurationRead: "detected",
          dependencies: "detected",
          heartbeats: "detected",
        },
      });
    });

    it("is inferred with no context parameter either", () => {
      const code = lines(
        "package app",
        "",
        'import "fmt"',
        "",
        "func ComposeGreeting(name string) (string, error) {",
        '    return fmt.Sprintf("Hello %s!", name), nil',
        "}",
      );
      expect(checkCode(code, registeredSdks)).toMatchObject({
        sdk: "Go",
        activity: { name: "ComposeGreeting", line: 5 },
        input: "string",
        provenance: { sdk: "inferred" },
      });
    });
  });

  describe("the context, error return and parameter variants", () => {
    it.each([
      [
        "a named context",
        "func Act(ctx context.Context, in In) (Out, error) {",
      ],
      ["an unnamed context", "func Act(context.Context, In) (Out, error) {"],
      ["a blank context", "func Act(_ context.Context, in In) (Out, error) {"],
      ["no context", "func Act(in In) (Out, error) {"],
    ])("reads the input past %s", (_, signature) => {
      expect(
        onlyActivity(packageWith(signature, "    return Out{}, nil", "}")),
      ).toMatchObject({ input: "In", output: "Out" });
    });

    it.each([
      ["error alone", "error", null],
      ["a value and an error", "(Out, error)", "Out"],
      ["named results", "(out *Out, err error)", "*Out"],
      ["a slice and an error", "([]string, error)", "[]string"],
      ["a map and an error", "(map[string]int, error)", "map[string]int"],
    ])("reads %s as the results", (_, results, output) => {
      expect(
        onlyActivity(
          packageWith(
            `func Act(ctx context.Context, in In) ${results} {`,
            "    panic(1)",
            "}",
          ),
        ).output,
      ).toBe(output);
    });

    it.each([
      ["no results", ""],
      ["a value with no error", "Out"],
      ["an error first", "(error, Out)"],
      ["three results", "(Out, int, error)"],
    ])("reads a function with %s as no activity", (_, results) => {
      expect(
        detect(
          packageWith(
            `func Act(ctx context.Context, in In) ${results} {`,
            "    panic(1)",
            "}",
          ),
        ),
      ).toEqual([]);
    });

    it("reports the input as unknown with several parameters, none, or a variadic one", () => {
      for (const parameters of [
        "ctx context.Context, a string, b int",
        "ctx context.Context, a, b string",
        "ctx context.Context",
        "ctx context.Context, ids ...string",
      ]) {
        expect(
          onlyActivity(
            packageWith(
              `func Act(${parameters}) error {`,
              "    return nil",
              "}",
            ),
          ).input,
        ).toBeNull();
      }
    });

    it("reads every Go activity as synchronous", () => {
      expect(onlyActivity(activityWith()).runsAs).toBe("sync");
    });
  });

  describe("what isn't an activity", () => {
    it("leaves out unexported functions and workflows", () => {
      const code = packageWith(
        "func charge(ctx context.Context, in In) (Out, error) {",
        "    return Out{}, nil",
        "}",
        "",
        "func ChargeWorkflow(ctx workflow.Context, in In) (Out, error) {",
        "    return Out{}, nil",
        "}",
      );
      expect(detect(code)).toEqual([]);
    });

    it("counts only functions taking a context when any does, leaving out an exported helper", () => {
      const code = packageWith(
        "func NewClient() (*Client, error) {",
        "    return &Client{}, nil",
        "}",
        "",
        "func Charge(ctx context.Context, in In) (Out, error) {",
        "    return Out{}, nil",
        "}",
      );
      expect(onlyActivity(code).activity).toEqual({ name: "Charge", line: 13 });
    });

    it("ignores functions inside comments and strings", () => {
      const code = activityWith(
        "    // func Other(ctx context.Context, in In) (Out, error) {",
        "    _ = `",
        "func Another(ctx context.Context, in In) (Out, error) {",
        "`",
      );
      expect(onlyActivity(code).activity.name).toBe("Act");
    });
  });

  describe("no activity", () => {
    it("refuses a file with the Temporal import but no activity as no Go activity", () => {
      const code = packageWith(
        "func helper(ctx context.Context) {",
        '    activity.GetLogger(ctx).Info("hi")',
        "}",
      );
      expect(detect(code)).toEqual([]);
      expect(refusalOf(code)).toMatchObject({
        type: refusalTypes.noActivity,
        sdk: "Go",
      });
    });

    it("asks for the SDK to be chosen for Go code with no Temporal marker and no activity's shape", () => {
      const code = lines(
        "package util",
        "",
        "func add(a, b int) int {",
        "    return a + b",
        "}",
      );
      expect(refusalOf(code)).toMatchObject({
        type: refusalTypes.sdkChoiceNeeded,
        reason: "not-identified",
      });
    });

    it("finds no Go activity in another language when the publisher declares Go", () => {
      const python = lines(
        "from temporalio import activity",
        "",
        "@activity.defn",
        "async def greet(name: str) -> str:",
        '    return f"Hello {name}"',
      );
      expect(detect(python)).toEqual([]);
      try {
        checkCode(python, registeredSdks, "Go");
        throw new Error("Expected a refusal");
      } catch (error) {
        expect((error as CheckRefusal).problem).toMatchObject({
          type: refusalTypes.noActivity,
          sdk: "Go",
        });
      }
    });
  });

  describe("counting activities", () => {
    it("refuses a file with two activities, one activity per file", () => {
      const code = packageWith(
        "func Withdraw(ctx context.Context, in Payment) (string, error) {",
        '    return "", nil',
        "}",
        "",
        "func Deposit(ctx context.Context, in Payment) (string, error) {",
        '    return "", nil',
        "}",
      );
      expect(detect(code).map(({ activity }) => activity)).toEqual([
        { name: "Withdraw", line: 9 },
        { name: "Deposit", line: 13 },
      ]);
      expect(refusalOf(code)).toMatchObject({
        type: refusalTypes.multipleActivities,
        count: 2,
      });
    });

    it("refuses two marker-less activities too", () => {
      const code = lines(
        "package app",
        "",
        "func Greet(name string) (string, error) {",
        '    return "", nil',
        "}",
        "",
        "func Farewell(name string) (string, error) {",
        '    return "", nil',
        "}",
      );
      expect(refusalOf(code)).toMatchObject({
        type: refusalTypes.multipleActivities,
        count: 2,
      });
    });
  });

  describe("non-retryable errors", () => {
    it("reads NewNonRetryableApplicationError, with any package name", () => {
      const code = activityWith(
        '    err := temporal.NewNonRetryableApplicationError("declined", "CardDeclined", nil)',
        '    other := t.NewNonRetryableApplicationError("gone", "Gone", nil)',
      );
      expect(onlyActivity(code).nonRetryableErrors).toEqual([
        { line: 10 },
        { line: 11 },
      ]);
    });

    it("reads NonRetryable: true in the options passed to NewApplicationErrorWithOptions", () => {
      const code = activityWith(
        "    return Out{}, temporal.NewApplicationErrorWithOptions(",
        '        "declined",',
        '        "CardDeclined",',
        "        temporal.ApplicationErrorOptions{",
        "            NonRetryable: true,",
        "            Cause:        err,",
        "        },",
        "    )",
      );
      expect(onlyActivity(code).nonRetryableErrors).toEqual([{ line: 14 }]);
    });

    it("leaves out a retryable application error and options outside the call", () => {
      const code = activityWith(
        '    _ = temporal.NewApplicationError("try again", "Busy")',
        "    opts := temporal.ApplicationErrorOptions{NonRetryable: true}",
        '    _ = temporal.NewApplicationErrorWithOptions("x", "X", opts)',
        '    _ = temporal.NewApplicationErrorWithOptions("x", "X", temporal.ApplicationErrorOptions{NonRetryable: false})',
        '    // temporal.NewNonRetryableApplicationError("x", "X", nil)',
      );
      expect(onlyActivity(code).nonRetryableErrors).toEqual([]);
    });
  });

  describe("configuration read", () => {
    it("reads os.Getenv and os.LookupEnv, each variable once, ignoring comments", () => {
      const code = activityWith(
        '    key := os.Getenv("STRIPE_API_KEY")',
        "    region, ok := os.LookupEnv(`AWS_REGION`)",
        '    again := os.Getenv("STRIPE_API_KEY")',
        '    // os.Getenv("COMMENTED")',
        '    s := "os.Getenv(\\"IN_STRING\\")"',
      );
      expect(onlyActivity(code).configurationRead).toEqual([
        { name: "STRIPE_API_KEY", line: 10 },
        { name: "AWS_REGION", line: 11 },
      ]);
    });
  });

  describe("heartbeats", () => {
    it("reads each RecordHeartbeat call, with or without details", () => {
      const code = activityWith(
        "    activity.RecordHeartbeat(ctx)",
        "    for i := range items {",
        "        activity.RecordHeartbeat(ctx, i)",
        "    }",
        "    // activity.RecordHeartbeat(ctx)",
      );
      expect(onlyActivity(code).heartbeats).toEqual([
        { line: 10 },
        { line: 12 },
      ]);
    });
  });

  describe("dependencies", () => {
    it("reads grouped, single, named, blank and dot imports, leaving out the standard library and Temporal", () => {
      const code = lines(
        "package payments",
        "",
        'import "fmt"',
        'import pgx "github.com/jackc/pgx/v5"',
        "",
        "import (",
        '    "context"',
        '    "net/http"',
        '    // a comment with a (bracket) and "quotes"',
        '    _ "github.com/lib/pq"',
        '    . "github.com/example/dsl"',
        '    "go.temporal.io/sdk/activity"',
        '    "go.temporal.io/api/enums/v1"',
        '    "github.com/aws/aws-sdk-go-v2/service/s3"',
        '    "github.com/lib/pq"',
        ")",
        "",
        "func Act(ctx context.Context, in In) error {",
        "    return nil",
        "}",
      );
      expect(onlyActivity(code).dependencies).toEqual([
        { name: "github.com/jackc/pgx/v5", line: 4 },
        { name: "github.com/lib/pq", line: 10 },
        { name: "github.com/example/dsl", line: 11 },
        { name: "github.com/aws/aws-sdk-go-v2/service/s3", line: 14 },
      ]);
    });

    it("ignores imports in comments and strings", () => {
      const code = activityWith(
        "    _ = `",
        'import "github.com/in/string"',
        "`",
      );
      const commented = lines(
        "package payments",
        "",
        '// import "github.com/in/comment"',
        "/*",
        'import "github.com/in/block"',
        "*/",
        "",
        "func Act(ctx context.Context, in In) error {",
        "    return nil",
        "}",
      );
      expect(onlyActivity(code).dependencies).toEqual([]);
      expect(onlyActivity(commented).dependencies).toEqual([]);
    });
  });

  describe("the standard-library check", () => {
    it.each([
      ["fmt", true],
      ["context", true],
      ["net/http", true],
      ["encoding/json", true],
      ["C", true],
      ["github.com/stripe/stripe-go/v87", false],
      ["go.temporal.io/sdk", false],
      ["golang.org/x/sync/errgroup", false],
      ["gopkg.in/yaml.v3", false],
    ])("reads %s as standard library: %s", (path, expected) => {
      expect(isGoStandardLibrary(path)).toBe(expected);
      expect(sdkRegistry.Go.isStandardLibrary(path)).toBe(expected);
    });
  });

  describe("the dependency normaliser", () => {
    it.each([
      ["github.com/stripe/stripe-go/v87", "github.com/stripe/stripe-go"],
      [
        "github.com/stripe/stripe-go/v87/paymentintent",
        "github.com/stripe/stripe-go",
      ],
      ["github.com/jackc/pgx/v5/pgxpool", "github.com/jackc/pgx"],
      ["github.com/lib/pq", "github.com/lib/pq"],
      [
        "github.com/aws/aws-sdk-go-v2/service/s3",
        "github.com/aws/aws-sdk-go-v2/service/s3",
      ],
      ["github.com/Slack-Go/Slack", "github.com/slack-go/slack"],
      ["k8s.io/api/core/v1", "k8s.io/api/core/v1"],
      ["github.com/v2fly/v2ray-core/v5", "github.com/v2fly/v2ray-core"],
    ])("normalises %s to %s", (path, key) => {
      expect(normaliseGoDependency(path)).toBe(key);
      expect(sdkRegistry.Go.normaliseDependency(path)).toBe(key);
    });
  });

  describe("integrations from Go imports", () => {
    const imports = (...names: string[]) =>
      names.map((name, index) => ({ name, line: index + 1 }));

    it.each([
      ["github.com/stripe/stripe-go/v87", "Stripe"],
      ["github.com/stripe/stripe-go/v76/paymentintent", "Stripe"],
      ["github.com/aws/aws-sdk-go-v2/service/s3", "Amazon S3"],
      ["github.com/aws/aws-sdk-go/service/s3", "Amazon S3"],
      ["github.com/jackc/pgx/v5", "Postgres"],
      ["github.com/jackc/pgx/v5/pgxpool", "Postgres"],
      ["github.com/lib/pq", "Postgres"],
      ["github.com/slack-go/slack", "Slack"],
    ])("maps %s to %s", (path, integration) => {
      expect(integrationsFor("Go", imports(path))).toEqual([integration]);
    });

    it("maps a detected activity's imports, leaving out context and fmt", () => {
      const facts = checkCode(chargeCard, registeredSdks);
      expect(facts.dependencies.map(({ name }) => name)).not.toContain(
        "context",
      );
      expect(facts.dependencies.map(({ name }) => name)).not.toContain("fmt");
      expect(integrationsFor("Go", facts.dependencies)).toEqual(["Stripe"]);
    });

    it("maps a plain HTTP client and an unrelated module to nothing", () => {
      expect(
        integrationsFor(
          "Go",
          imports(
            "github.com/go-resty/resty/v2",
            "github.com/stripe/stripe-cli",
          ),
        ),
      ).toEqual([]);
    });
  });

  describe("recognition", () => {
    it.each([
      ['    "go.temporal.io/sdk/activity"', true],
      ['import "go.temporal.io/sdk"', true],
      ['"github.com/example/temporal"', false],
    ])("takes %s for the Go SDK: %s", (line, expected) => {
      expect(matchesAny(goRecognition.sdkMarkers, line)).toBe(expected);
    });

    it.each([
      "func Greet(ctx context.Context, name string) (string, error) {",
      "func (a *Activities) Greet(ctx context.Context) error {",
    ])("takes %s for a Go activity", (code) => {
      expect(matchesAny(goRecognition.activityMarkers, code)).toBe(true);
    });

    it("does not take a Go workflow for an activity", () => {
      const workflow =
        "func GreetWorkflow(ctx workflow.Context, name string) (string, error) {";
      expect(matchesAny(goRecognition.activityMarkers, workflow)).toBe(false);
      expect(matchesAny(goRecognition.shapeMarkers, workflow)).toBe(false);
    });

    it.each([
      ["a PHP function", "function Greet(string $name): string {"],
      ["a TypeScript function", "export function Greet(name: string): Error {"],
      ["a Rust function", "fn greet(name: String) -> Result<String, Error> {"],
      ["a Python function", "def Greet(name: str) -> error:"],
    ])("does not take %s for a Go activity's shape", (_, code) => {
      expect(matchesAny(goRecognition.shapeMarkers, code)).toBe(false);
    });
  });

  describe("adversarial input", () => {
    const atLimit = (prefix: string, repeated: string) =>
      prefix +
      repeated.repeat(
        Math.floor((MAX_CODE_BYTES - prefix.length) / repeated.length),
      );

    const adversarial: readonly (readonly [string, string])[] = [
      ["open brackets in a signature", atLimit("func A(", "(")],
      ["open results", atLimit("func A() (", "(")],
      ["an unclosed import group", atLimit("import (\n", '"a"\n')],
      ["unclosed raw strings", atLimit("x := ", "`")],
      [
        "many declarations",
        atLimit("", "func A(ctx context.Context) error {\n"),
      ],
      ["unclosed block comments", atLimit("", "/*")],
    ];

    it.each(adversarial)(
      "matches every pattern against %s in under a second",
      (_, code) => {
        for (const pattern of goPatterns) {
          const started = performance.now();
          allMatches(pattern, code);
          expect(performance.now() - started).toBeLessThan(1000);
        }
      },
    );

    it.each(adversarial)("detects %s in under a second", (_, code) => {
      const started = performance.now();
      detect(code);
      expect(performance.now() - started).toBeLessThan(1000);
    });
  });
});
